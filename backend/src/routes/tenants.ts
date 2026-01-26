import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireTenant, ownerOnly } from '../middleware/auth.js';

const router = Router();

const createTenantSchema = z.object({
  name: z.string().trim().min(1, 'חובה להזין שם טננט'),
});

const inviteSchema = z.object({
  email: z.string().email('כתובת אימייל לא תקינה'),
  role: z.enum(['owner', 'worker']).default('worker'),
});

// Get user's tenants
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    
    const { data: memberships, error } = await supabase
      .from('memberships')
      .select('tenant_id, role, tenants(id, name, created_at)')
      .eq('user_id', user.id);

    if (error) {
      return res.status(500).json({ error: 'שגיאה בטעינת טננטים' });
    }

    const tenants = (memberships || []).map((m: any) => ({
      id: m.tenant_id,
      role: m.role,
      ...m.tenants,
    }));

    res.json(tenants);
  } catch (error) {
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// Create new tenant
router.post('/', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const body = createTenantSchema.parse(req.body);

    // Create tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({ name: body.name })
      .select()
      .single();

    if (tenantError || !tenant) {
      console.error('Error creating tenant:', tenantError);
      return res.status(500).json({ 
        error: tenantError?.message || 'שגיאה ביצירת טננט',
        details: tenantError?.code || 'UNKNOWN_ERROR'
      });
    }

    // Create membership as owner
    const { error: membershipError } = await supabase
      .from('memberships')
      .insert({
        user_id: user.id,
        tenant_id: tenant.id,
        role: 'owner',
      });

    if (membershipError) {
      console.error('Error creating membership:', membershipError);
      // Rollback: delete tenant if membership fails
      await supabase.from('tenants').delete().eq('id', tenant.id);
      return res.status(500).json({ 
        error: membershipError.message || 'שגיאה ביצירת חברות',
        details: membershipError.code || 'MEMBERSHIP_ERROR'
      });
    }

    // Create default category "כללי"
    const { error: categoryError } = await supabase
      .from('categories')
      .insert({
        tenant_id: tenant.id,
        name: 'כללי',
        default_margin_percent: 0,
        is_active: true,
        created_by: user.id,
      });

    if (categoryError) {
      console.error('Failed to create default category:', categoryError);
    }

    // Create default settings
    const { error: settingsError } = await supabase
      .from('settings')
      .insert({
        tenant_id: tenant.id,
        vat_percent: 18,
      });

    if (settingsError) {
      console.error('Failed to create default settings:', settingsError);
    }

    res.status(201).json({ ...tenant, role: 'owner' });
  } catch (error) {
    console.error('Create tenant error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    const errorMessage = error instanceof Error ? error.message : 'שגיאת שרת';
    res.status(500).json({ error: errorMessage });
  }
});

// Invite user to tenant
router.post('/:id/invite', requireAuth, requireTenant, ownerOnly, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const body = inviteSchema.parse(req.body);

    // Generate token
    const token = crypto.randomUUID();

    // Create invite (expires in 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { data: invite, error } = await supabase
      .from('invites')
      .insert({
        tenant_id: tenant.tenantId,
        email: body.email.toLowerCase(),
        role: body.role,
        token,
        invited_by: (req as any).user.id,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error || !invite) {
      return res.status(500).json({ error: 'שגיאה ביצירת הזמנה' });
    }

    // TODO: Send email with invite link
    // For now, return the token (in production, send via email)
    res.status(201).json({ 
      ...invite,
      inviteUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invite?token=${token}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// Accept invite (called when user logs in and has pending invite)
router.post('/accept-invite', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'נדרש token' });
    }

    // Find invite
    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .select('*')
      .eq('token', token)
      .is('accepted_at', null)
      .single();

    if (inviteError || !invite) {
      return res.status(404).json({ error: 'הזמנה לא נמצאה או כבר התקבלה' });
    }

    // Check expiration
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: 'הזמנה פגה תוקף' });
    }

    // Check email matches
    const userEmail = user.email?.toLowerCase();
    if (userEmail !== invite.email.toLowerCase()) {
      return res.status(403).json({ error: 'הזמנה מיועדת לכתובת אימייל אחרת' });
    }

    // Create membership
    const { error: membershipError } = await supabase
      .from('memberships')
      .insert({
        user_id: user.id,
        tenant_id: invite.tenant_id,
        role: invite.role,
      });

    if (membershipError) {
      // Check if already a member
      if (membershipError.code === '23505') {
        // Mark invite as accepted anyway
        await supabase
          .from('invites')
          .update({ accepted_at: new Date().toISOString() })
          .eq('id', invite.id);
        return res.json({ message: 'כבר חבר בטננט זה' });
      }
      return res.status(500).json({ error: 'שגיאה ביצירת חברות' });
    }

    // Mark invite as accepted
    await supabase
      .from('invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.id);

    res.json({ message: 'הזמנה התקבלה בהצלחה' });
  } catch (error) {
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

export default router;
