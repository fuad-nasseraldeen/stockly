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
  supplier_id: string;
  cost_price: number;
  margin_percent: number | null;
  sell_price: number;
  updated_at: string;
  prices?: ProductPrice[];
  category?: Category;
  supplier?: Supplier;
  summary?: {
    min_current_cost_price: number;
    last_price_update_at: string;
  };
};

export type ProductPrice = {
  id: string;
  product_id: string;
  supplier_id: string;
  cost_price: number;
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
  updated_at: string;
};

export type Tenant = {
  id: string;
  name: string;
  role: 'owner' | 'worker';
  created_at: string;
};

async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

function getTenantId(): string | null {
  return localStorage.getItem('currentTenantId');
}

export async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const token = await getAuthToken();
  const tenantId = getTenantId();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  if (tenantId) {
    headers['x-tenant-id'] = tenantId;
  }

  const url = API_URL ? `${API_URL}${endpoint}` : endpoint;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
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
export const productsApi = {
  list: (params?: { search?: string; supplier_id?: string; category_id?: string; sort?: 'price_asc' | 'price_desc' | 'updated_desc' | 'updated_asc' }): Promise<Product[]> => {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.supplier_id) queryParams.append('supplier_id', params.supplier_id);
    if (params?.category_id) queryParams.append('category_id', params.category_id);
    if (params?.sort) queryParams.append('sort', params.sort);
    return apiRequest<Product[]>(`/api/products?${queryParams.toString()}`);
  },
  
  get: (id: string): Promise<Product> => apiRequest<Product>(`/api/products/${id}`),
  
  create: (data: { name: string; category_id?: string | null; unit: 'unit' | 'kg' | 'liter'; supplier_id: string; cost_price: number; margin_percent?: number }) =>
    apiRequest('/api/products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  update: (id: string, data: { name?: string; category_id?: string | null; unit?: 'unit' | 'kg' | 'liter' }) =>
    apiRequest(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  delete: (id: string) =>
    apiRequest(`/api/products/${id}`, {
      method: 'DELETE',
    }),
  
  addPrice: (id: string, data: { supplier_id: string; cost_price: number; margin_percent?: number }) =>
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
  
  update: (data: { vat_percent: number }): Promise<Settings> =>
    apiRequest<Settings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// Tenant maintenance API
export const tenantApi = {
  reset: (confirmation: 'DELETE'): Promise<{ message?: string }> =>
    apiRequest('/api/tenant/reset', {
      method: 'POST',
      body: JSON.stringify({ confirmation }),
    }),
};

// Tenants API
export const tenantsApi = {
  list: (): Promise<Tenant[]> => apiRequest<Tenant[]>('/api/tenants'),
  
  create: (data: { name: string }): Promise<Tenant> =>
    apiRequest<Tenant>('/api/tenants', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  invite: (tenantId: string, data: { email: string; role?: 'owner' | 'worker' }): Promise<any> =>
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

// Import/Export API
export const importApi = {
  preview: async (file: File): Promise<any> => {
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
    
    return response.json();
  },
  
  apply: async (file: File, mode: 'merge' | 'overwrite', confirmation?: string): Promise<any> => {
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
    
    return response.json();
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
};
