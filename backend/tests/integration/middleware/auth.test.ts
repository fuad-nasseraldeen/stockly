import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireAuth, requireTenant, ownerOnly, requireSuperAdmin } from '../../../src/middleware/auth';
import { createMockRequest, createMockResponse, createMockNext } from '../../utils/test-helpers';
import { supabase } from '../../../src/lib/supabase';
import { verifyAccessToken } from '../../../src/lib/jwt';

// Mock Supabase
vi.mock('../../../src/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));
vi.mock('../../../src/lib/jwt', () => ({
  verifyAccessToken: vi.fn(),
}));

describe('auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireAuth', () => {
    it('should return 401 if no token provided', async () => {
      const req = createMockRequest({ headers: {} });
      const res = createMockResponse();
      const next = createMockNext();

      await requireAuth(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'נדרש להתחבר כדי לבצע פעולה זו' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if token is invalid', async () => {
      (verifyAccessToken as any).mockResolvedValue(null);

      const req = createMockRequest({
        headers: { authorization: 'Bearer invalid-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await requireAuth(req as any, res as any, next);

      expect(verifyAccessToken).toHaveBeenCalledWith('invalid-token');
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'ההתחברות פגה תוקף, נא להתחבר מחדש' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should add user context and continue when token is valid', async () => {
      (verifyAccessToken as any).mockResolvedValue({
        sub: '550e8400-e29b-41d4-a716-446655440001',
        email: 'test@example.com',
      });

      const req = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await requireAuth(req as any, res as any, next);

      expect(verifyAccessToken).toHaveBeenCalledWith('valid-token');
      expect((req as any).user).toEqual({
        id: '550e8400-e29b-41d4-a716-446655440001',
        email: 'test@example.com',
      });
      expect((req as any).authToken).toBe('valid-token');
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('requireTenant', () => {
    it('should return 400 if no tenant ID header', async () => {
      const req = createMockRequest({
        user: { id: '550e8400-e29b-41d4-a716-446655440001', email: 'test@example.com' },
        headers: {},
      });
      const res = createMockResponse();
      const next = createMockNext();

      await requireTenant(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'נדרש x-tenant-id header' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 if tenant ID is not a valid UUID', async () => {
      const req = createMockRequest({
        user: { id: '550e8400-e29b-41d4-a716-446655440001', email: 'test@example.com' },
        headers: { 'x-tenant-id': 'invalid-uuid' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await requireTenant(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'x-tenant-id חייב להיות UUID תקין' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 if user is not a member', async () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const req = createMockRequest({
        user: { id: '550e8400-e29b-41d4-a716-446655440001', email: 'test@example.com' },
        headers: { 'x-tenant-id': tenantId },
      });
      const res = createMockResponse();
      const next = createMockNext();

      // Mock Supabase to return no membership
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      });

      await requireTenant(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'אין לך גישה לטננט זה' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 if user is blocked', async () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const req = createMockRequest({
        user: { id: '550e8400-e29b-41d4-a716-446655440001', email: 'test@example.com' },
        headers: { 'x-tenant-id': tenantId },
      });
      const res = createMockResponse();
      const next = createMockNext();

      // Mock Supabase to return blocked membership
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { role: 'worker', is_blocked: true },
          error: null,
        }),
      });

      await requireTenant(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'חשבונך נחסם בטננט זה. נא ליצור קשר עם בעל החנות.',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('ownerOnly', () => {
    it('should return 403 if user is not owner', () => {
      const req = createMockRequest({
        tenant: { tenantId: '550e8400-e29b-41d4-a716-446655440002', role: 'worker' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      ownerOnly(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'פעולה זו זמינה לבעלים בלבד' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next if user is owner', () => {
      const req = createMockRequest({
        tenant: { tenantId: '550e8400-e29b-41d4-a716-446655440002', role: 'owner' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      ownerOnly(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
