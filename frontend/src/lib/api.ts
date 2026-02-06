import { supabase } from './supabase';

function resolveApiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_URL ?? '').trim();

  // In local dev it's easy to accidentally keep a Vercel URL in env; prefer localhost.
  // This keeps dev/test predictable even if a global env var is set.
  const isLocalHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  if (isLocalHost && configured.includes('.vercel.app')) {
    return 'http://localhost:3001';
  }

  if (configured) return configured.replace(/\/$/, '');

  // Default: dev -> local backend, prod -> expect VITE_API_URL or rewrites on hosting.
  return import.meta.env.DEV ? 'http://localhost:3001' : '';
}

export const API_URL = resolveApiBaseUrl();

// Type definitions
export type Product = {
  id: string;
  name: string;
  category_id: string | null;
  unit: 'unit' | 'kg' | 'liter';
  sku?: string | null;
  package_quantity?: number;
  supplier_id: string;
  cost_price: number;
  margin_percent: number | null;
  sell_price: number;
  updated_at: string;
  prices?: ProductPrice[];
  category?: Category;
  supplier?: Supplier;
};

export type ProductPrice = {
  id: string;
  supplier_id: string;
  cost_price: number;
  package_quantity?: number | null;
  discount_percent?: number | null;
  cost_price_after_discount?: number | null;
  margin_percent: number | null;
  sell_price: number;
  created_at: string;
  supplier?: Supplier;
  supplier_name?: string;
};

export type Category = {
  id: string;
  name: string;
  default_margin_percent: number | null;
  created_at: string;
};

export type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
};

export type Settings = {
  tenant_id: string;
  vat_percent: number;
  global_margin_percent?: number | null;
  use_margin?: boolean | null;
  use_vat?: boolean | null;
  updated_at: string;
};

export type Tenant = {
  id: string;
  name: string;
  role: 'owner' | 'worker';
  created_at: string;
};

export type TenantMember = {
  user_id: string;
  role: 'owner' | 'worker';
  full_name: string | null;
  created_at: string;
  is_primary_owner: boolean;
};

export type TenantInvite = {
  id: string;
  email: string;
  role: 'owner' | 'worker';
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

// CRITICAL: Module-level variable to store current tenantId from TenantContext
// This is the SINGLE SOURCE OF TRUTH for tenantId in API requests.
// DO NOT read from localStorage directly - always use this variable.
// TenantContext is responsible for updating this value.
let currentTenantIdForApi: string | null = null;

/**
 * Set the current tenantId for API requests.
 * This should ONLY be called by TenantContext when tenant changes.
 * 
 * @param tenantId - The tenant ID to use for API requests, or null to clear
 */
export function setTenantIdForApi(tenantId: string | null): void {
  currentTenantIdForApi = tenantId;
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 setTenantIdForApi() called, setting:', tenantId);
  }
}

/**
 * Get the current tenantId for API requests.
 * This reads from the module-level variable set by TenantContext, NOT from localStorage.
 * 
 * @returns The current tenant ID, or null if no tenant is selected
 */
function getTenantId(): string | null {
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 getTenantId() called, returning:', currentTenantIdForApi);
  }
  return currentTenantIdForApi;
}

export async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit & { skipTenantHeader?: boolean }
): Promise<T> {
  const token = await getAuthToken();
  const tenantId = options?.skipTenantHeader ? undefined : getTenantId();
  
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 apiRequest:', {
      endpoint,
      skipTenantHeader: options?.skipTenantHeader,
      tenantId,
      hasToken: !!token,
    });
  }
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  if (tenantId && !options?.skipTenantHeader) {
    headers['x-tenant-id'] = tenantId;
  } else if (!options?.skipTenantHeader) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ apiRequest: No tenantId found for endpoint:', endpoint);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { skipTenantHeader: _, ...fetchOptions } = options || {};
  const url = API_URL ? `${API_URL}${endpoint}` : endpoint;
  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    // Handle 401 (Unauthorized) - token expired or invalid
    if (response.status === 401) {
      // Try to refresh the session
      const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError || !session) {
        // Refresh failed - clear session and redirect to login
        await supabase.auth.signOut();
        // Clear tenant from localStorage
        localStorage.removeItem('currentTenantId');
        // Redirect to login page
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
        // Throw error to stop execution
        throw new Error('ההתחברות פגה תוקף, נא להתחבר מחדש');
      } else {
        // Session refreshed - retry the request with new token
        const newToken = session.access_token;
        const retryHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${newToken}`,
          ...(options?.headers as Record<string, string>),
        };
        
        if (tenantId && !options?.skipTenantHeader) {
          retryHeaders['x-tenant-id'] = tenantId;
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { skipTenantHeader: _, ...retryFetchOptions } = options || {};
        const retryResponse = await fetch(url, {
          ...retryFetchOptions,
          headers: retryHeaders,
        });

        if (!retryResponse.ok) {
          let errorMessage = 'הבקשה נכשלה';
          try {
            const errorData = await retryResponse.json();
            errorMessage = errorData.error || errorData.message || `שגיאה ${retryResponse.status}: ${retryResponse.statusText}`;
          } catch {
            errorMessage = `שגיאה ${retryResponse.status}: ${retryResponse.statusText || 'לא ניתן להתחבר לשרת'}`;
          }
          throw new Error(errorMessage);
        }

        return retryResponse.json();
      }
    }

    let errorMessage = 'הבקשה נכשלה';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || `שגיאה ${response.status}: ${response.statusText}`;
    } catch {
      // If response is not JSON, use status text
      errorMessage = `שגיאה ${response.status}: ${response.statusText || 'לא ניתן להתחבר לשרת'}`;
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  
  signup: (email: string, password: string, fullName?: string) =>
    apiRequest('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName }),
    }),
  
  logout: () =>
    apiRequest('/api/auth/logout', {
      method: 'POST',
    }),
};

// Products API
export type ProductsResponse = {
  products: Product[];
  total: number;
  page: number;
  totalPages: number;
};

export const productsApi = {
  list: (params?: { 
    search?: string; 
    supplier_id?: string; 
    category_id?: string; 
    sort?: 'price_asc' | 'price_desc' | 'updated_desc' | 'updated_asc';
    page?: number;
    pageSize?: number;
    all?: boolean; // If true, fetch all products without pagination
  }): Promise<ProductsResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.supplier_id) queryParams.append('supplier_id', params.supplier_id);
    if (params?.category_id) queryParams.append('category_id', params.category_id);
    if (params?.sort) queryParams.append('sort', params.sort);
    if (params?.all) {
      queryParams.append('all', 'true');
    } else {
      if (params?.page) queryParams.append('page', String(params.page));
      if (params?.pageSize) queryParams.append('pageSize', String(params.pageSize));
    }
    return apiRequest<ProductsResponse>(`/api/products?${queryParams.toString()}`);
  },
  
  get: (id: string): Promise<Product> => apiRequest<Product>(`/api/products/${id}`),
  
  create: (data: { name: string; category_id?: string | null; unit: 'unit' | 'kg' | 'liter'; sku?: string | null; package_quantity?: number; supplier_id: string; cost_price: number; margin_percent?: number; discount_percent?: number }) =>
    apiRequest('/api/products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  update: (id: string, data: { name?: string; category_id?: string | null; unit?: 'unit' | 'kg' | 'liter'; sku?: string | null; package_quantity?: number }) =>
    apiRequest(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  delete: (id: string) =>
    apiRequest(`/api/products/${id}`, {
      method: 'DELETE',
    }),
  
  addPrice: (id: string, data: { supplier_id: string; cost_price: number; margin_percent?: number; discount_percent?: number }) =>
    apiRequest(`/api/products/${id}/prices`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  getPriceHistory: (id: string, supplier_id?: string): Promise<ProductPrice[]> => {
    const params = new URLSearchParams();
    if (supplier_id) params.append('supplier_id', supplier_id);
    return apiRequest<ProductPrice[]>(`/api/products/${id}/price-history?${params.toString()}`);
  },
};

// Categories API
export const categoriesApi = {
  list: (): Promise<Category[]> => apiRequest<Category[]>('/api/categories'),
  
  create: (data: { name: string; default_margin_percent?: number }) =>
    apiRequest('/api/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  update: (id: string, data: { name?: string; default_margin_percent?: number }) =>
    apiRequest(`/api/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  delete: (id: string) =>
    apiRequest(`/api/categories/${id}`, {
      method: 'DELETE',
    }),
};

// Suppliers API
export const suppliersApi = {
  list: (): Promise<Supplier[]> => apiRequest<Supplier[]>('/api/suppliers'),
  
  create: (data: { name: string; phone?: string; notes?: string }): Promise<Supplier> =>
    apiRequest<Supplier>('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  update: (id: string, data: { name?: string; phone?: string; notes?: string }) =>
    apiRequest(`/api/suppliers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  delete: (id: string) =>
    apiRequest(`/api/suppliers/${id}`, {
      method: 'DELETE',
    }),
};

// Settings API
export const settingsApi = {
  get: (): Promise<Settings> => apiRequest<Settings>('/api/settings'),
  
  update: (data: { vat_percent: number; global_margin_percent?: number; use_margin?: boolean; use_vat?: boolean }): Promise<Settings> =>
    apiRequest<Settings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  // User preferences API
  getPreference: <T = unknown>(key: string): Promise<T | null> =>
    apiRequest<T | null>(`/api/settings/preferences/${key}`),
  setPreference: <T = unknown>(key: string, value: T): Promise<T | null> =>
    apiRequest<T | null>(`/api/settings/preferences/${key}`, {
      method: 'PUT',
      body: JSON.stringify(value),
    }),
  deletePreference: (key: string): Promise<{ success: boolean }> =>
    apiRequest<{ success: boolean }>(`/api/settings/preferences/${key}`, {
      method: 'DELETE',
    }),
};

// Tenant maintenance API
export const tenantApi = {
  reset: (confirmation: 'DELETE'): Promise<{ message?: string }> =>
    apiRequest('/api/tenant/reset', {
      method: 'POST',
      body: JSON.stringify({ confirmation }),
    }),
  members: (): Promise<TenantMember[]> => apiRequest<TenantMember[]>('/api/tenants/members'),
  invites: (): Promise<TenantInvite[]> => apiRequest<TenantInvite[]>('/api/tenants/invites'),
  removeMember: (userId: string): Promise<{ success: boolean }> =>
    apiRequest('/api/tenants/members/' + userId, {
      method: 'DELETE',
    }),
  deleteInvite: (id: string): Promise<{ success: boolean }> =>
    apiRequest('/api/tenants/invites/' + id, {
      method: 'DELETE',
    }),
};

// Tenants API
export const tenantsApi = {
  list: (): Promise<Tenant[]> => apiRequest<Tenant[]>('/api/tenants', { skipTenantHeader: true }),
  
  create: (data: { name: string }): Promise<Tenant> =>
    apiRequest<Tenant>('/api/tenants', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  invite: (tenantId: string, data: { email: string; role?: 'owner' | 'worker' }): Promise<{ message?: string }> =>
    apiRequest(`/api/tenants/${tenantId}/invite`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  acceptInvite: (token: string): Promise<{ message: string }> =>
    apiRequest('/api/tenants/accept-invite', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
};

// Invites API
export const invitesApi = {
  accept: (): Promise<{ accepted: number; already_member: number; not_found: number; message: string; errors?: string[] }> =>
    apiRequest('/api/invites/accept', {
      method: 'POST',
    }),
};

// Admin API
export type TenantWithUsers = {
  id: string;
  name: string;
  created_at: string;
  owners: Array<{
    membership_id: string;
    user_id: string;
    full_name: string;
    email: string;
    role: 'owner';
    is_blocked: boolean;
    blocked_at: string | null;
    joined_at: string;
  }>;
  workers: Array<{
    membership_id: string;
    user_id: string;
    full_name: string;
    email: string;
    role: 'worker';
    is_blocked: boolean;
    blocked_at: string | null;
    joined_at: string;
  }>;
  total_users: number;
  blocked_users: number;
  statistics?: {
    products: number;
    suppliers: number;
    categories: number;
    price_entries: number;
    estimated_size_kb: number;
  };
};

export type AuditLog = {
  id: string;
  action: string;
  details: unknown;
  created_at: string;
  profiles: {
    user_id: string;
    full_name: string;
  } | null;
};

export const adminApi = {
  getTenants: (): Promise<TenantWithUsers[]> =>
    apiRequest<TenantWithUsers[]>('/api/admin/tenants', { skipTenantHeader: true }),

  getAuditLogs: (params?: { limit?: number; offset?: number; tenant_id?: string }): Promise<AuditLog[]> => {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', String(params.limit));
    if (params?.offset) queryParams.append('offset', String(params.offset));
    if (params?.tenant_id) queryParams.append('tenant_id', params.tenant_id);
    return apiRequest<AuditLog[]>(`/api/admin/audit-logs?${queryParams.toString()}`, { skipTenantHeader: true });
  },

  blockUser: (membershipId: string): Promise<{ message: string }> =>
    apiRequest('/api/admin/block-user', {
      method: 'POST',
      body: JSON.stringify({ membership_id: membershipId }),
      skipTenantHeader: true,
    }),

  unblockUser: (membershipId: string): Promise<{ message: string }> =>
    apiRequest('/api/admin/unblock-user', {
      method: 'POST',
      body: JSON.stringify({ membership_id: membershipId }),
      skipTenantHeader: true,
    }),

  checkSuperAdmin: (): Promise<{ is_super_admin: boolean }> =>
    apiRequest<{ is_super_admin: boolean }>('/api/admin/check', { skipTenantHeader: true }),

  removeUser: (membershipId: string): Promise<{ message: string }> =>
    apiRequest('/api/admin/remove-user', {
      method: 'DELETE',
      body: JSON.stringify({ membership_id: membershipId }),
      skipTenantHeader: true,
    }),

  resetTenantData: (tenantId: string): Promise<{ message: string }> =>
    apiRequest('/api/admin/reset-tenant-data', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: tenantId }),
      skipTenantHeader: true,
    }),

  deleteTenant: (tenantId: string): Promise<{ message: string }> =>
    apiRequest('/api/admin/delete-tenant', {
      method: 'DELETE',
      body: JSON.stringify({ tenant_id: tenantId }),
      skipTenantHeader: true,
    }),
};

// Import/Export API
export const importApi = {
  preview: async (file: File): Promise<unknown> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = await getAuthToken();
    const tenantId = getTenantId();
    
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (tenantId) headers['x-tenant-id'] = tenantId;
    
    const response = await fetch(`${API_URL}/api/import/preview`, {
      method: 'POST',
      headers,
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'שגיאה לא ידועה' }));
      throw new Error(error.error || 'הבקשה נכשלה');
    }
    
    return response.json() as Promise<unknown>;
  },
  
  apply: async (file: File, mode: 'merge' | 'overwrite', confirmation?: string): Promise<unknown> => {
    const formData = new FormData();
    formData.append('file', file);
    if (confirmation) formData.append('confirmation', confirmation);
    
    const token = await getAuthToken();
    const tenantId = getTenantId();
    
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (tenantId) headers['x-tenant-id'] = tenantId;
    
    const response = await fetch(`${API_URL}/api/import/apply?mode=${mode}`, {
      method: 'POST',
      headers,
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'שגיאה לא ידועה' }));
      throw new Error(error.error || 'הבקשה נכשלה');
    }
    
    return response.json() as Promise<unknown>;
  },
};

export const exportApi = {
  downloadCurrent: async (): Promise<void> => {
    const token = await getAuthToken();
    const tenantId = getTenantId();
    
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (tenantId) headers['x-tenant-id'] = tenantId;
    
    const response = await fetch(`${API_URL}/api/export/current.csv`, { headers });
    if (!response.ok) throw new Error('שגיאה בייצוא');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'current_prices.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },
  
  downloadHistory: async (): Promise<void> => {
    const token = await getAuthToken();
    const tenantId = getTenantId();
    
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (tenantId) headers['x-tenant-id'] = tenantId;
    
    const response = await fetch(`${API_URL}/api/export/history.csv`, { headers });
    if (!response.ok) throw new Error('שגיאה בייצוא');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'price_history.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  downloadFiltered: async (params: {
    search?: string;
    supplier_id?: string;
    category_id?: string;
    sort?: string;
  }): Promise<void> => {
    const token = await getAuthToken();
    const tenantId = getTenantId();
    
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (tenantId) headers['x-tenant-id'] = tenantId;
    
    const queryParams = new URLSearchParams();
    if (params.search) queryParams.append('search', params.search);
    if (params.supplier_id) queryParams.append('supplier_id', params.supplier_id);
    if (params.category_id) queryParams.append('category_id', params.category_id);
    if (params.sort) queryParams.append('sort', params.sort);

    const url = `${API_URL}/api/export/filtered.csv${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error('שגיאה בייצוא');

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'products_export.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(downloadUrl);
    document.body.removeChild(a);
  },
};

// Bootstrap API - fetches all essential data in one request
export type BootstrapData = {
  tenants: Tenant[];
  settings: Settings | null;
  suppliers: Supplier[];
  categories: Category[];
  tableLayoutProducts: unknown | null; // User preference for products table layout
};

export const bootstrapApi = {
  get: (): Promise<BootstrapData> => apiRequest<BootstrapData>('/api/bootstrap'),
};

// NOTE: PDF generation is handled via external PDF service from the frontend.