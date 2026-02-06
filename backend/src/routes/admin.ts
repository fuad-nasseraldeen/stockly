import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';

const router = Router();

// CRITICAL: Protect ALL admin routes with requireAuth + requireSuperAdmin
// This ensures NO admin endpoint is reachable without super admin privileges
// Normal users will always get 403 for /api/admin/*
router.use(requireAuth, requireSuperAdmin);

// Check if current user is super admin
// Note: requireSuperAdmin middleware is already applied to all routes via router.use()
router.get('/check', async (req, res) => {
  res.json({ is_super_admin: true });
});

// Get all tenants with owners and members (super admin only)
// Note: requireSuperAdmin middleware is already applied to all routes via router.use()
router.get('/tenants', async (req, res) => {
  try {
    const user = (req as any).user;

    // Get all tenants (super admin can see all)
    const { data: allTenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, name, created_at')
      .order('created_at', { ascending: false });

    if (tenantsError) {
      return res.status(500).json({ error: 'שגיאה בטעינת חנויות' });
    }

    // For each tenant, get owners and members
    const tenantsWithUsers = await Promise.all(
      (allTenants || []).map(async (tenant: any) => {
        // Get memberships
        const { data: memberships, error: membershipsError } = await supabase
          .from('memberships')
          .select(`
            id,
            user_id,
            role,
            is_blocked,
            blocked_at,
            created_at
          `)
          .eq('tenant_id', tenant.id)
          .order('created_at', { ascending: false });

        if (membershipsError) {
          console.error(`Error fetching memberships for tenant ${tenant.id}:`, membershipsError);
        }

        // Debug logging
        console.log(`Tenant ${tenant.name} (${tenant.id}): Found ${memberships?.length || 0} memberships`);

        // Get user profiles separately
        const userIds = [...new Set((memberships || []).map((m: any) => m.user_id).filter(Boolean))];
        const profilesMap: Record<string, any> = {};
        const emailsMap: Record<string, string> = {};
        
        if (userIds.length > 0) {
          // Get profiles
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('user_id, full_name')
            .in('user_id', userIds);
          
          if (profilesError) {
            console.error(`Error fetching profiles for tenant ${tenant.id}:`, profilesError);
          } else {
            (profiles || []).forEach((p: any) => {
              profilesMap[p.user_id] = p;
            });
          }

          // Get emails from auth.users (using admin client)
          // Since we're using service role, we can access auth.users
          try {
            const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
            if (!authError && authUsers && authUsers.users) {
              authUsers.users.forEach((user: any) => {
                if (userIds.includes(user.id)) {
                  emailsMap[user.id] = user.email || 'לא ידוע';
                }
              });
            } else if (authError) {
              console.error(`Error fetching emails for tenant ${tenant.id}:`, authError);
            }
          } catch (error) {
            console.error(`Error fetching emails for tenant ${tenant.id}:`, error);
          }
        }

        const users = (memberships || []).map((m: any) => ({
          membership_id: m.id,
          user_id: m.user_id,
          full_name: profilesMap[m.user_id]?.full_name || 'לא ידוע',
          email: emailsMap[m.user_id] || 'לא ידוע',
          role: m.role,
          is_blocked: m.is_blocked || false,
          blocked_at: m.blocked_at,
          joined_at: m.created_at,
        }));

        const owners = users.filter((u: any) => u.role === 'owner');
        const workers = users.filter((u: any) => u.role === 'worker');

        // Get statistics for this tenant
        const [productsCount, suppliersCount, categoriesCount, priceEntriesCount] = await Promise.all([
          supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('is_active', true),
          supabase.from('suppliers').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('is_active', true),
          supabase.from('categories').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('is_active', true),
          supabase.from('price_entries').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
        ]);

        // Calculate approximate database size (in KB)
        // Rough estimates: products ~2KB each, suppliers ~1KB, categories ~0.5KB, price_entries ~1KB
        const estimatedSizeKB = 
          (productsCount.count || 0) * 2 +
          (suppliersCount.count || 0) * 1 +
          (categoriesCount.count || 0) * 0.5 +
          (priceEntriesCount.count || 0) * 1;

        return {
          ...tenant,
          owners,
          workers,
          total_users: users.length,
          blocked_users: users.filter((u: any) => u.is_blocked).length,
          statistics: {
            products: productsCount.count || 0,
            suppliers: suppliersCount.count || 0,
            categories: categoriesCount.count || 0,
            price_entries: priceEntriesCount.count || 0,
            estimated_size_kb: Math.round(estimatedSizeKB * 10) / 10, // Round to 1 decimal
          },
        };
      })
    );

    res.json(tenantsWithUsers);
  } catch (error) {
    console.error('Admin tenants error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// Get audit logs (super admin can see all, or filter by tenant_id)
// Note: requireSuperAdmin middleware is already applied to all routes via router.use()
router.get('/audit-logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const tenantId = req.query.tenant_id as string | undefined;

    let logsQuery = supabase
      .from('audit_logs')
      .select(`
        id,
        action,
        details,
        created_at,
        user_id,
        tenant_id
      `);
    
    if (tenantId) {
      logsQuery = logsQuery.eq('tenant_id', tenantId);
    }
    
    const { data: logs, error } = await logsQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: 'שגיאה בטעינת לוגים' });
    }

    // Get user profiles separately
    const userIds = [...new Set((logs || []).map((log: any) => log.user_id).filter(Boolean))];
    const profilesMap: Record<string, any> = {};
    
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);
      
      (profiles || []).forEach((p: any) => {
        profilesMap[p.user_id] = p;
      });
    }

    const logsWithProfiles = (logs || []).map((log: any) => ({
      ...log,
      profiles: log.user_id ? profilesMap[log.user_id] || null : null,
    }));

    res.json(logsWithProfiles);
  } catch (error) {
    console.error('Audit logs error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// Block a user in a tenant
// Note: requireSuperAdmin middleware is already applied to all routes via router.use()
router.post('/block-user', async (req, res) => {
  try {
    const user = (req as any).user;
    const { membership_id } = z.object({
      membership_id: z.string().uuid('חובה להזין membership_id תקין'),
    }).parse(req.body);

    // Get membership
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('user_id, role, tenant_id')
      .eq('id', membership_id)
      .single();

    if (membershipError || !membership) {
      return res.status(404).json({ error: 'חברות לא נמצאה' });
    }

    // Don't allow blocking owners
    if (membership.role === 'owner') {
      return res.status(403).json({ error: 'לא ניתן לחסום בעלים' });
    }

    // Don't allow blocking yourself
    if (membership.user_id === user.id) {
      return res.status(403).json({ error: 'לא ניתן לחסום את עצמך' });
    }

    // Block the user
    const { error: blockError } = await supabase
      .from('memberships')
      .update({
        is_blocked: true,
        blocked_at: new Date().toISOString(),
        blocked_by: user.id,
      })
      .eq('id', membership_id);

    if (blockError) {
      return res.status(500).json({ error: 'שגיאה בחסימת משתמש' });
    }

    // Log the action
    await supabase.rpc('log_audit_event', {
      p_tenant_id: membership.tenant_id,
      p_user_id: user.id,
      p_action: 'user_blocked',
      p_details: JSON.stringify({
        blocked_user_id: membership.user_id,
        membership_id,
      }),
    });

    res.json({ message: 'משתמש נחסם בהצלחה' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('Block user error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// Unblock a user in a tenant
// Note: requireSuperAdmin middleware is already applied to all routes via router.use()
router.post('/unblock-user', async (req, res) => {
  try {
    const user = (req as any).user;
    const { membership_id } = z.object({
      membership_id: z.string().uuid('חובה להזין membership_id תקין'),
    }).parse(req.body);

    // Get membership
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('user_id, tenant_id')
      .eq('id', membership_id)
      .single();

    if (membershipError || !membership) {
      return res.status(404).json({ error: 'חברות לא נמצאה' });
    }

    // Unblock the user
    const { error: unblockError } = await supabase
      .from('memberships')
      .update({
        is_blocked: false,
        blocked_at: null,
        blocked_by: null,
      })
      .eq('id', membership_id);

    if (unblockError) {
      return res.status(500).json({ error: 'שגיאה בביטול חסימת משתמש' });
    }

    // Log the action
    await supabase.rpc('log_audit_event', {
      p_tenant_id: membership.tenant_id,
      p_user_id: user.id,
      p_action: 'user_unblocked',
      p_details: JSON.stringify({
        unblocked_user_id: membership.user_id,
        membership_id,
      }),
    });

    res.json({ message: 'חסימת משתמש בוטלה בהצלחה' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('Unblock user error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// Remove user from tenant (delete membership)
// Note: requireSuperAdmin middleware is already applied to all routes via router.use()
router.delete('/remove-user', async (req, res) => {
  try {
    const user = (req as any).user;
    const { membership_id } = z.object({
      membership_id: z.string().uuid('חובה להזין membership_id תקין'),
    }).parse(req.body);

    // Get membership
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('user_id, tenant_id, role')
      .eq('id', membership_id)
      .single();

    if (membershipError || !membership) {
      return res.status(404).json({ error: 'חברות לא נמצאה' });
    }

    // Delete membership
    const { error: deleteError } = await supabase
      .from('memberships')
      .delete()
      .eq('id', membership_id);

    if (deleteError) {
      return res.status(500).json({ error: 'שגיאה בהסרת משתמש' });
    }

    // Log the action
    await supabase.rpc('log_audit_event', {
      p_tenant_id: membership.tenant_id,
      p_user_id: user.id,
      p_action: 'user_removed',
      p_details: JSON.stringify({
        removed_user_id: membership.user_id,
        membership_id,
        role: membership.role,
      }),
    });

    res.json({ message: 'משתמש הוסר בהצלחה' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('Remove user error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// Delete all data for a tenant (reset tenant data)
// Note: requireSuperAdmin middleware is already applied to all routes via router.use()
router.post('/reset-tenant-data', async (req, res) => {
  try {
    const user = (req as any).user;
    const { tenant_id } = z.object({
      tenant_id: z.string().uuid('חובה להזין tenant_id תקין'),
    }).parse(req.body);

    // Verify tenant exists
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('id', tenant_id)
      .single();

    if (tenantError || !tenant) {
      return res.status(404).json({ error: 'חנות לא נמצאה' });
    }

    // Delete in FK-safe order
    await supabase.from('price_entries').delete().eq('tenant_id', tenant_id);
    await supabase.from('products').delete().eq('tenant_id', tenant_id);
    await supabase.from('suppliers').delete().eq('tenant_id', tenant_id);
    await supabase.from('categories').delete().eq('tenant_id', tenant_id).neq('name', 'כללי');
    await supabase.from('settings').delete().eq('tenant_id', tenant_id);
    await supabase.from('invites').delete().eq('tenant_id', tenant_id);
    await supabase.from('audit_logs').delete().eq('tenant_id', tenant_id);

    // Recreate defaults
    await supabase.from('settings').insert({
      tenant_id: tenant_id,
      vat_percent: 18,
    });

    // Ensure default category exists
    const { data: defaultCategory } = await supabase
      .from('categories')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('name', 'כללי')
      .eq('is_active', true)
      .single();

    if (!defaultCategory) {
      await supabase.from('categories').insert({
        tenant_id: tenant_id,
        name: 'כללי',
        default_margin_percent: 0,
        is_active: true,
        created_by: user.id,
      });
    }

    // Log the action
    await supabase.rpc('log_audit_event', {
      p_tenant_id: tenant_id,
      p_user_id: user.id,
      p_action: 'tenant_data_reset',
      p_details: JSON.stringify({
        tenant_name: tenant.name,
      }),
    });

    res.json({ message: 'נתוני החנות נמחקו בהצלחה' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('Reset tenant data error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// Delete entire tenant (tenant + all data + memberships)
// Note: requireSuperAdmin middleware is already applied to all routes via router.use()
router.delete('/delete-tenant', async (req, res) => {
  try {
    const user = (req as any).user;
    const { tenant_id } = z.object({
      tenant_id: z.string().uuid('חובה להזין tenant_id תקין'),
    }).parse(req.body);

    // Verify tenant exists
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('id', tenant_id)
      .single();

    if (tenantError || !tenant) {
      return res.status(404).json({ error: 'חנות לא נמצאה' });
    }

    // Delete all data first (in FK-safe order)
    await supabase.from('price_entries').delete().eq('tenant_id', tenant_id);
    await supabase.from('products').delete().eq('tenant_id', tenant_id);
    await supabase.from('suppliers').delete().eq('tenant_id', tenant_id);
    await supabase.from('categories').delete().eq('tenant_id', tenant_id);
    await supabase.from('settings').delete().eq('tenant_id', tenant_id);
    await supabase.from('invites').delete().eq('tenant_id', tenant_id);
    await supabase.from('audit_logs').delete().eq('tenant_id', tenant_id);
    await supabase.from('memberships').delete().eq('tenant_id', tenant_id);

    // Finally delete the tenant
    const { error: deleteError } = await supabase
      .from('tenants')
      .delete()
      .eq('id', tenant_id);

    if (deleteError) {
      return res.status(500).json({ error: 'שגיאה במחיקת חנות' });
    }

    // Log the action (before tenant is deleted, so we use a special tenant_id or null)
    // Note: We can't log to audit_logs after tenant is deleted, so we'll skip logging
    // or log to a special admin log if needed

    res.json({ message: 'חנות נמחקה בהצלחה' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('Delete tenant error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

export default router;
