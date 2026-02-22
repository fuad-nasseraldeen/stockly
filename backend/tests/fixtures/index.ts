// Use valid UUIDs for all mock IDs
export const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'test@example.com',
};

export const mockTenant = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  name: 'Test Store',
  created_at: '2024-01-01T00:00:00Z',
};

export const mockMembership = {
  id: '550e8400-e29b-41d4-a716-446655440003',
  user_id: mockUser.id,
  tenant_id: mockTenant.id,
  role: 'owner' as const,
  is_blocked: false,
  created_at: '2024-01-01T00:00:00Z',
};

export const mockCategory = {
  id: '550e8400-e29b-41d4-a716-446655440004',
  tenant_id: mockTenant.id,
  name: 'Test Category',
  default_margin_percent: 30,
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  created_by: mockUser.id,
};

export const mockSupplier = {
  id: '550e8400-e29b-41d4-a716-446655440005',
  tenant_id: mockTenant.id,
  name: 'Test Supplier',
  phone: '123-456-7890',
  notes: 'Test notes',
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  created_by: mockUser.id,
};

export const mockProduct = {
  id: '550e8400-e29b-41d4-a716-446655440006',
  tenant_id: mockTenant.id,
  name: 'Test Product',
  name_norm: 'test product',
  category_id: mockCategory.id,
  unit: 'unit' as const,
  sku: 'SKU-123',
  package_quantity: 1,
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  created_by: mockUser.id,
};

export const mockPriceEntry = {
  id: '550e8400-e29b-41d4-a716-446655440007',
  tenant_id: mockTenant.id,
  product_id: mockProduct.id,
  supplier_id: mockSupplier.id,
  cost_price: 10,
  discount_percent: 0,
  cost_price_after_discount: 10,
  margin_percent: 30,
  sell_price: 15.4,
  package_quantity: 1,
  created_at: '2024-01-01T00:00:00Z',
  created_by: mockUser.id,
};

export const mockSettings = {
  id: '550e8400-e29b-41d4-a716-446655440008',
  tenant_id: mockTenant.id,
  vat_percent: 18,
  global_margin_percent: 30,
  use_margin: true,
  use_vat: true,
  decimal_precision: 2,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  created_by: mockUser.id,
};
