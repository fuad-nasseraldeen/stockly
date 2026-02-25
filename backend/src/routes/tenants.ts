import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { normalizePhoneToE164 } from '../lib/phone.js';
import { requireAuth, requireTenant, ownerOnly } from '../middleware/auth.js';

const router = Router();

const createTenantSchema = z.object({
  name: z.string().trim().min(1, 'חובה להזין שם טננט'),
});

const inviteSchema = z.object({
  email: z.string().trim().email('כתובת אימייל לא תקינה').optional(),
  phone: z.string().trim().min(1, 'מספר טלפון לא תקין').optional(),
  role: z.enum(['owner', 'worker']).default('worker'),
}).refine((value) => Boolean(value.email || value.phone), {
  message: 'נא להזין אימייל או מספר טלפון',
  path: ['email'],
});

async function getPrimaryOwner(tenantId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('memberships')
    .select('user_id, role, created_at')
    .eq('tenant_id', tenantId)
    .eq('role', 'owner')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0].user_id as string;
}

async function getProfilePhone(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('phone_e164')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return null;
  return (data?.phone_e164 as string | null) ?? null;
}

// Get user's tenants
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    
    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('Fetching tenants for user:', { user_id: user.id, email: user.email });
    }
    
    // Fetch memberships first
    const { data: memberships, error: membershipsError } = await supabase
      .from('memberships')
      .select('tenant_id, role')
      .eq('user_id', user.id);

    if (membershipsError) {
      console.error('Error fetching memberships:', membershipsError);
      return res.status(500).json({ error: 'שגיאה בטעינת טננטים', details: membershipsError.message });
    }

    // Debug logging
    console.log('Memberships query result:', {
      user_id: user.id,
      memberships_count: memberships?.length || 0,
      memberships: memberships,
      error: membershipsError,
    });

    if (!memberships || memberships.length === 0) {
      console.log('No memberships found for user:', user.id);
      return res.json([]);
    }

    // Fetch tenant details separately
    const tenantIds = memberships.map((m: any) => m.tenant_id);
    const { data: tenantDetails, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, name, created_at')
      .in('id', tenantIds);

    if (tenantsError) {
      console.error('Error fetching tenant details:', tenantsError);
      return res.status(500).json({ error: 'שגיאה בטעינת פרטי חנויות', details: tenantsError.message });
    }

    // Combine memberships with tenant details
    const tenantMap = new Map((tenantDetails || []).map((t: any) => [t.id, t]));
    const tenants = memberships.map((m: any) => {
      const tenant = tenantMap.get(m.tenant_id);
      return {
        id: m.tenant_id,
        role: m.role,
        name: tenant?.name || 'לא ידוע',
        created_at: tenant?.created_at || null,
      };
    });

    // Debug logging
    console.log('Final tenants result:', {
      tenant_ids: tenantIds,
      tenant_details_count: tenantDetails?.length || 0,
      tenant_details: tenantDetails,
      tenants_count: tenants.length,
      tenants: tenants,
    });

    res.json(tenants);
  } catch (error) {
    console.error('Get tenants error:', error);
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
        use_vat: false,
        decimal_precision: 2,
      });

    if (settingsError) {
      console.error('Failed to create default settings:', settingsError);
    }

    res.status(201).json({ ...tenant, role: 'owner' });
  } catch (error) {
    console.error('Create tenant error:', error);
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues?.[0];
      return res.status(400).json({ error: firstIssue?.message || 'נתונים לא תקינים' });
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
    const normalizedEmail = body.email?.trim().toLowerCase() || null;
    const normalizedPhone = body.phone ? normalizePhoneToE164(body.phone) : null;

    if (body.phone && !normalizedPhone) {
      return res.status(400).json({ error: 'מספר טלפון לא תקין' });
    }

    // Generate token
    const token = crypto.randomUUID();

    // Create invite (expires in 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { data: invite, error } = await supabase
      .from('invites')
      .insert({
        tenant_id: tenant.tenantId,
        email: normalizedEmail,
        phone_e164: normalizedPhone,
        role: body.role,
        token,
        invited_by: (req as any).user.id,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error || !invite) {
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'כבר קיימת הזמנה פעילה ליעד הזה' });
      }
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
      const firstIssue = error.issues?.[0];
      return res.status(400).json({ error: firstIssue?.message || 'נתונים לא תקינים' });
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

    const userEmail = user.email?.toLowerCase() || null;
    const inviteEmail = typeof invite.email === 'string' ? invite.email.toLowerCase() : null;
    const invitePhone = typeof invite.phone_e164 === 'string' ? invite.phone_e164 : null;
    const profilePhone = await getProfilePhone(user.id);

    const emailMatches = Boolean(inviteEmail && userEmail && userEmail === inviteEmail);
    const phoneMatches = Boolean(invitePhone && profilePhone && profilePhone === invitePhone);
    if (!emailMatches && !phoneMatches) {
      return res.status(403).json({ error: 'ההזמנה מיועדת לחשבון אחר' });
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

// List members of current tenant (owners + workers)
router.get('/members', requireAuth, requireTenant, ownerOnly, async (req, res) => {
  try {
    const tenant = (req as any).tenant;

    const primaryOwnerId = await getPrimaryOwner(tenant.tenantId);

    const { data: membershipRows, error: membershipError } = await supabase
      .from('memberships')
      .select('user_id, role, created_at')
      .eq('tenant_id', tenant.tenantId)
      .order('created_at', { ascending: true });

    if (membershipError) {
      console.error('Error loading tenant members:', membershipError);
      return res.status(500).json({ error: 'שגיאה בטעינת משתמשי החנות' });
    }

    const memberRows = membershipRows || [];
    const userIds = memberRows.map((m: any) => m.user_id);

    let nameByUserId = new Map<string, string | null>();
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);

      if (profilesError) {
        console.error('Error loading member profiles:', profilesError);
      } else {
        nameByUserId = new Map(
          (profiles || []).map((p: any) => [p.user_id as string, (p.full_name as string) ?? null])
        );
      }
    }

    const members = memberRows.map((m: any) => ({
      user_id: m.user_id,
      role: m.role,
      full_name: nameByUserId.get(m.user_id) ?? null,
      created_at: m.created_at,
      is_primary_owner: primaryOwnerId != null && m.user_id === primaryOwnerId,
    }));

    return res.json(members);
  } catch (error) {
    console.error('Members list error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// List pending invites of current tenant
router.get('/invites', requireAuth, requireTenant, ownerOnly, async (req, res) => {
  try {
    const tenant = (req as any).tenant;

    const { data, error } = await supabase
      .from('invites')
      .select('id,email,phone_e164,role,expires_at,accepted_at,created_at')
      .eq('tenant_id', tenant.tenantId)
      .is('accepted_at', null)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading tenant invites:', error);
      return res.status(500).json({ error: 'שגיאה בטעינת הזמנות' });
    }

    return res.json(data || []);
  } catch (error) {
    console.error('Invites list error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// Remove a member from current tenant (cannot remove primary owner)
router.delete('/members/:userId', requireAuth, requireTenant, ownerOnly, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const { userId } = req.params;

    const primaryOwnerId = await getPrimaryOwner(tenant.tenantId);
    if (primaryOwnerId && userId === primaryOwnerId) {
      return res.status(400).json({ error: 'לא ניתן להסיר את בעל החנות הראשי' });
    }

    const { error } = await supabase
      .from('memberships')
      .delete()
      .eq('tenant_id', tenant.tenantId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error removing member:', error);
      return res.status(500).json({ error: 'לא ניתן להסיר משתמש מהחנות' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// Cancel a pending invite
router.delete('/invites/:id', requireAuth, requireTenant, ownerOnly, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const { id } = req.params;

    const { error } = await supabase
      .from('invites')
      .delete()
      .eq('tenant_id', tenant.tenantId)
      .eq('id', id);

    if (error) {
      console.error('Error deleting invite:', error);
      return res.status(500).json({ error: 'לא ניתן לבטל הזמנה' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete invite error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

export default router;
