import type { Request } from 'express';
import type { AuthedUser, TenantContext } from '../../src/middleware/auth';

/**
 * Create a mock Express request with auth and tenant context
 */
export function createMockRequest(overrides: {
  user?: AuthedUser;
  tenant?: TenantContext;
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
  params?: Record<string, string>;
} = {}): Partial<Request> {
  const { user, tenant, headers = {}, body, query, params } = overrides;

  const req: any = {
    headers: {
      'content-type': 'application/json',
      ...(user ? { authorization: `Bearer mock-token-${user.id}` } : {}),
      ...(tenant ? { 'x-tenant-id': tenant.tenantId } : {}),
      ...headers,
    },
    body: body || {},
    query: query || {},
    params: params || {},
    user,
    tenant,
  };

  return req;
}

/**
 * Create a mock Express response
 */
export function createMockResponse() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  };
  return res;
}

/**
 * Create a mock NextFunction
 */
export function createMockNext() {
  return vi.fn();
}

import { vi } from 'vitest';

// Re-export for convenience
export { vi };
