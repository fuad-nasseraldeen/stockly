import type { Product, Category, Supplier, Settings, Tenant } from '../../src/lib/api';

export const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'test@example.com',
};

export const mockTenant: Tenant = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  name: 'Test Store',
  role: 'owner',
  created_at: '2024-01-01T00:00:00Z',
};

export const mockCategory: Category = {
  id: '550e8400-e29b-41d4-a716-446655440004',
  name: 'Test Category',
  default_margin_percent: 30,
  created_at: '2024-01-01T00:00:00Z',
};

export const mockSupplier: Supplier = {
  id: '550e8400-e29b-41d4-a716-446655440005',
  name: 'Test Supplier',
  phone: '123-456-7890',
  notes: 'Test notes',
  created_at: '2024-01-01T00:00:00Z',
};

export const mockProduct: Product = {
  id: '550e8400-e29b-41d4-a716-446655440006',
  name: 'Test Product',
  category_id: mockCategory.id,
  unit: 'unit',
  sku: 'SKU-123',
  package_quantity: 1,
  supplier_id: mockSupplier.id,
  cost_price: 10,
  margin_percent: 30,
  sell_price: 15.4,
  updated_at: '2024-01-01T00:00:00Z',
  prices: [
    {
      id: '550e8400-e29b-41d4-a716-446655440007',
      supplier_id: mockSupplier.id,
      cost_price: 10,
      margin_percent: 30,
      sell_price: 15.4,
      created_at: '2024-01-01T00:00:00Z',
    },
  ],
  category: mockCategory,
  supplier: mockSupplier,
};

export const mockSettings: Settings = {
  tenant_id: mockTenant.id,
  vat_percent: 18,
  global_margin_percent: 30,
  use_margin: true,
  use_vat: true,
  updated_at: '2024-01-01T00:00:00Z',
};

export const mockProductsResponse = {
  products: [mockProduct],
  total: 1,
  page: 1,
  totalPages: 1,
};
