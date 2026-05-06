import { describe, expect, it } from 'vitest';
import { shouldSendReminderForDays } from '../../../src/services/subscription-reminders';

describe('subscription reminder selection', () => {
  const now = new Date('2026-05-05T12:00:00.000Z');

  it('selects only 7/3/0 day windows', () => {
    expect(shouldSendReminderForDays(7, null, now)).toBe(true);
    expect(shouldSendReminderForDays(3, null, now)).toBe(true);
    expect(shouldSendReminderForDays(0, null, now)).toBe(true);
    expect(shouldSendReminderForDays(5, null, now)).toBe(false);
  });

  it('prevents duplicates within cooldown window', () => {
    expect(shouldSendReminderForDays(3, '2026-05-05T01:00:00.000Z', now)).toBe(false);
    expect(shouldSendReminderForDays(3, '2026-05-04T00:00:00.000Z', now)).toBe(true);
  });
});
