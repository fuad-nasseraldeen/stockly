import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/bootstrap
 * 
 * Returns all essential data needed for app initialization in a single request:
 * - tenants (user's tenants list) - always returned
 * - settings (current tenant settings) - only if tenant is selected
 * - suppliers (active suppliers for current tenant) - only if tenant is selected
 * - categories (active categories for current tenant) - only if tenant is selected
 * - tableLayoutProducts (user preference for products table layout) - only if tenant is selected
 * 
 * This endpoint is optimized to reduce sequential API calls on app load.
 * All data is fetched in parallel where possible.
 * 
 * Note: Tenant-specific data (settings, suppliers, categories, tableLayout) is only returned
 * if a tenant is selected (x-tenant-id header present). This allows bootstrap to run
 * early in the onboarding flow to fetch tenants, then again after tenant selection.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantId = req.headers['x-tenant-id'] as string | undefined;
    const hasTenant = !!tenantId;

    // Always fetch tenants (no tenant required)
    const tenantsPromise = (async () => {
      const { data: memberships, error: membershipsError } = await supabase
        .from('memberships')
        .select('tenant_id, role')
        .eq('user_id', user.id);

      if (membershipsError || !memberships || memberships.length === 0) {
        return [];
      }

      const tenantIds = memberships.map((m: any) => m.tenant_id);
      const { data: tenantDetails, error: tenantsError } = await supabase
        .from('tenants')
        .select('id, name, created_at')
        .in('id', tenantIds);

      if (tenantsError || !tenantDetails) {
        return [];
      }

      const tenantMap = new Map((tenantDetails || []).map((t: any) => [t.id, t]));
      return memberships.map((m: any) => {
        const tenant = tenantMap.get(m.tenant_id);
        return {
          id: m.tenant_id,
          role: m.role,
          name: tenant?.name || 'לא ידוע',
          created_at: tenant?.created_at || null,
        };
      });
    })();

    // Fetch tenant-specific data only if tenant is selected
    const tenantDataPromises = hasTenant
      ? [
          // 2. Get current tenant settings
          supabase
            .from('settings')
            .select('tenant_id,vat_percent,global_margin_percent,use_margin,use_vat,decimal_precision,updated_at')
            .eq('tenant_id', tenantId)
            .single(),

          // 3. Get active suppliers
          supabase
            .from('suppliers')
            .select('id,name,phone,notes,is_active,created_at')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .order('name'),

          // 4. Get active categories
          supabase
            .from('categories')
            .select('id,name,default_margin_percent,is_active,created_at')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .order('name'),

          // 5. Get user preference for products table layout
          // Note: The key matches what frontend uses: 'table_layout_productsTable'
          supabase
            .from('user_preferences')
            .select('preference_value')
            .eq('user_id', user.id)
            .eq('tenant_id', tenantId)
            .eq('preference_key', 'table_layout_productsTable')
            .single(),
        ]
      : [Promise.resolve(null), Promise.resolve(null), Promise.resolve(null), Promise.resolve(null)];

    // Fetch all data in parallel
    const [tenantsResult, settingsResult, suppliersResult, categoriesResult, tableLayoutResult] = await Promise.allSettled([
      tenantsPromise,
      ...tenantDataPromises,
    ]);

    // Extract results (handle errors gracefully)
    const tenants = tenantsResult.status === 'fulfilled' ? tenantsResult.value : [];
    
    const settings = hasTenant && settingsResult.status === 'fulfilled' && settingsResult.value && typeof settingsResult.value === 'object' && 'data' in settingsResult.value && settingsResult.value.data
      ? settingsResult.value.data
      : null;
    
    const suppliers = hasTenant && suppliersResult.status === 'fulfilled' && suppliersResult.value && typeof suppliersResult.value === 'object' && 'data' in suppliersResult.value && suppliersResult.value.data
      ? suppliersResult.value.data
      : [];
    
    const categories = hasTenant && categoriesResult.status === 'fulfilled' && categoriesResult.value && typeof categoriesResult.value === 'object' && 'data' in categoriesResult.value && categoriesResult.value.data
      ? categoriesResult.value.data
      : [];
    
    // Table layout: return null if not found (PGRST116 = no rows) or no tenant
    const tableLayoutProducts = 
      hasTenant &&
      tableLayoutResult.status === 'fulfilled' && 
      tableLayoutResult.value && 
      typeof tableLayoutResult.value === 'object' &&
      'data' in tableLayoutResult.value &&
      tableLayoutResult.value.data && 
      !('error' in tableLayoutResult.value && tableLayoutResult.value.error)
        ? (tableLayoutResult.value as any).data.preference_value
        : null;

    res.json({
      tenants,
      settings,
      suppliers,
      categories,
      tableLayoutProducts,
    });
  } catch (error) {
    console.error('Bootstrap endpoint error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת נתוני אתחול' });
  }
});

export default router;
