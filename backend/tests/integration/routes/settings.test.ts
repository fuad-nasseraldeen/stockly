import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/_app';
import { supabase } from '../../../src/lib/supabase';
import { mockUser, mockTenant, mockSettings } from '../../fixtures';

// Mock Supabase
vi.mock('../../../src/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// Mock auth middleware
vi.mock('../../../src/middleware/auth', async () => {
  const actual = await vi.importActual('../../../src/middleware/auth');
  return {
    ...actual,
    requireAuth: (req: any, res: any, next: any) => {
      req.user = mockUser;
      next();
    },
    requireTenant: (req: any, res: any, next: any) => {
      req.tenant = { tenantId: mockTenant.id, role: 'owner' };
      next();
    },
  };
});

describe('GET /api/settings', () => {
  let app: any;

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
  });

  it('should return settings for tenant', async () => {
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: mockSettings,
        error: null,
      }),
    });

    const response = await request(app)
      .get('/api/settings')
      .set('Authorization', 'Bearer mock-token')
      .set('x-tenant-id', mockTenant.id);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('vat_percent');
    expect(response.body).toHaveProperty('global_margin_percent');
  });

  it('should return 500 on error', async () => {
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      }),
    });

    const response = await request(app)
      .get('/api/settings')
      .set('Authorization', 'Bearer mock-token')
      .set('x-tenant-id', mockTenant.id);

    expect(response.status).toBe(500);
  });
});

describe('PUT /api/settings', () => {
  let app: any;

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
  });

  it('should update settings', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'settings') {
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { ...mockSettings, vat_percent: 20 },
            error: null,
          }),
        };
      }
      if (table === 'product_supplier_current_price') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    const response = await request(app)
      .put('/api/settings')
      .set('Authorization', 'Bearer mock-token')
      .set('x-tenant-id', mockTenant.id)
      .send({
        vat_percent: 20,
        global_margin_percent: 35,
      });

    expect(response.status).toBe(200);
    expect(response.body.vat_percent).toBe(20);
  });

  it('should return 400 on validation error', async () => {
    const response = await request(app)
      .put('/api/settings')
      .set('Authorization', 'Bearer mock-token')
      .set('x-tenant-id', mockTenant.id)
      .send({
        vat_percent: -10, // Invalid
      });

    expect(response.status).toBe(400);
  });
});
