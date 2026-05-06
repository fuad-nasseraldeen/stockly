import { describe, expect, it } from 'vitest';
import { computeSubscriptionStatus, shouldSendReminder } from '../../../src/lib/subscription';

describe('subscription logic', () => {
  const now = new Date('2026-05-05T10:00:00.000Z');

  it('marks as expired when valid_until is before today', () => {
    const result = computeSubscriptionStatus({ status: 'active', valid_until: '2026-05-04' }, now);
    expect(result.status).toBe('expired');
  });

  it('marks as past_due when valid_until is within 7 days', () => {
    const result = computeSubscriptionStatus({ status: 'active', valid_until: '2026-05-10' }, now);
    expect(result.status).toBe('past_due');
    expect(result.isExpiringSoon).toBe(true);
  });

  it('keeps trial status when still valid and not expiring soon', () => {
    const result = computeSubscriptionStatus({ status: 'trial', valid_until: '2026-06-20' }, now);
    expect(result.status).toBe('trial');
  });

  it('suppresses reminders within same 20h window', () => {
    expect(shouldSendReminder('2026-05-05T00:00:00.000Z', new Date('2026-05-05T10:00:00.000Z'))).toBe(false);
    expect(shouldSendReminder('2026-05-04T00:00:00.000Z', new Date('2026-05-05T10:00:00.000Z'))).toBe(true);
  });
});
