import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/subscription', () => ({
  shouldEnforceSubscriptionWrites: vi.fn(),
  ensureTenantSubscription: vi.fn(),
  computeSubscriptionStatus: vi.fn(),
}));

import { requireSubscriptionWriteAccess } from '../../../src/middleware/subscription-enforcement';
import { shouldEnforceSubscriptionWrites, ensureTenantSubscription, computeSubscriptionStatus } from '../../../src/lib/subscription';

describe('requireSubscriptionWriteAccess', () => {
  const next = vi.fn();
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res: any = { status };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows when enforcement disabled', async () => {
    vi.mocked(shouldEnforceSubscriptionWrites).mockReturnValue(false);
    await requireSubscriptionWriteAccess({ tenant: { tenantId: 't1' } } as any, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks when computed status is expired', async () => {
    vi.mocked(shouldEnforceSubscriptionWrites).mockReturnValue(true);
    vi.mocked(ensureTenantSubscription).mockResolvedValue({ tenant_id: 't1' } as any);
    vi.mocked(computeSubscriptionStatus).mockReturnValue({ status: 'expired', daysRemaining: -1, isExpiringSoon: false } as any);

    await requireSubscriptionWriteAccess({ tenant: { tenantId: 't1' } } as any, res, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'Subscription expired. Please renew to continue editing.' });
  });
});
