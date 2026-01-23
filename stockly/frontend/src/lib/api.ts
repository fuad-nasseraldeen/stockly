import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

export async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const token = await getAuthToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'שגיאה לא ידועה' }));
    throw new Error(error.error || 'הבקשה נכשלה');
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
  list: (params?: { search?: string; supplier_id?: string; category_id?: string; sort?: 'price_asc' | 'price_desc' | 'updated_desc' | 'updated_asc' }) => {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.supplier_id) queryParams.append('supplier_id', params.supplier_id);
    if (params?.category_id) queryParams.append('category_id', params.category_id);
    if (params?.sort) queryParams.append('sort', params.sort);
    return apiRequest(`/api/products?${queryParams.toString()}`);
  },
  
  get: (id: string) => apiRequest(`/api/products/${id}`),
  
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
  
  getPriceHistory: (id: string, supplier_id?: string) => {
    const params = new URLSearchParams();
    if (supplier_id) params.append('supplier_id', supplier_id);
    return apiRequest(`/api/products/${id}/price-history?${params.toString()}`);
  },
};

// Categories API
export const categoriesApi = {
  list: () => apiRequest('/api/categories'),
  
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
  list: () => apiRequest('/api/suppliers'),
  
  create: (data: { name: string; phone?: string; notes?: string }) =>
    apiRequest('/api/suppliers', {
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
  get: () => apiRequest('/api/settings'),
  
  update: (data: { vat_percent: number }) =>
    apiRequest('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};
