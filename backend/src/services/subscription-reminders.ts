import { supabase } from '../lib/supabase.js';
import { sendSms } from '../providers/smsTo.js';
import { computeSubscriptionStatus, shouldSendReminder, type TenantSubscriptionRow } from '../lib/subscription.js';

type SubscriptionWithTenant = TenantSubscriptionRow & {
  tenants?: { id: string; name: string } | null;
};

const PAID_REMINDER_DAYS = new Set([7, 3, 1, 0]);
export function shouldSendReminderForDays(
  daysRemaining: number,
  lastReminderAt: string | null,
  planName: string,
  now: Date = new Date(),
): boolean {
  if (planName === 'trial_free') {
    if (daysRemaining < 0 || daysRemaining > 29) return false;
    return shouldSendReminder(lastReminderAt, now);
  }
  if (!PAID_REMINDER_DAYS.has(daysRemaining)) return false;
  return shouldSendReminder(lastReminderAt, now);
}

function buildReminderMessage(tenantName: string, days: number, validUntil: string, planName: string): string {
  const isTrial = planName === 'trial_free';
  if (days <= 0) {
    return isTrial
      ? `Stockly: תקופת הניסיון של ${tenantName} הסתיימה היום (${validUntil}). כדי להמשיך לעבוד יש לבחור מנוי.`
      : `Stockly: המנוי של ${tenantName} פג היום (${validUntil}). יש להסדיר תשלום כדי למנוע השבתה.`;
  }
  return isTrial
    ? `Stockly: נותרו ${days} ימים לניסיון החינם של ${tenantName} (עד ${validUntil}).`
    : `Stockly: המנוי של ${tenantName} מסתיים בעוד ${days} ימים (עד ${validUntil}).`;
}

async function getTenantPhones(tenantId: string): Promise<string[]> {
  const { data: owners, error } = await supabase
    .from('memberships')
    .select('user_id, role')
    .eq('tenant_id', tenantId)
    .eq('role', 'owner');

  if (error || !owners || owners.length === 0) return [];

  const userIds = owners.map((o: any) => o.user_id).filter(Boolean);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, phone_e164')
    .in('user_id', userIds);

  const phones = new Set<string>();
  for (const p of profiles || []) {
    if (p.phone_e164) phones.add(String(p.phone_e164));
  }
  return [...phones];
}

export async function runDailySubscriptionReminders(now: Date = new Date()): Promise<{ scanned: number; sent: number }> {
  const { data, error } = await supabase
    .from('tenant_subscriptions')
    .select('*, tenants(id, name)');

  if (error) throw error;

  let sent = 0;
  const rows = (data || []) as SubscriptionWithTenant[];
  const supportPhone = (process.env.SUPPORT_SMS_TO || '').trim();

  for (const row of rows) {
    const computed = computeSubscriptionStatus(row, now);
    const days = computed.daysRemaining;

    if (!shouldSendReminderForDays(days, row.last_reminder_sent_at, row.plan_name, now)) continue;

    const tenantName = row.tenants?.name || row.tenant_id;
    const msg = buildReminderMessage(tenantName, days, row.valid_until, row.plan_name);

    const targets = new Set<string>();
    if (supportPhone) targets.add(supportPhone);

    const ownerPhones = await getTenantPhones(row.tenant_id);
    ownerPhones.forEach((p) => targets.add(p));

    for (const phone of targets) {
      try {
        await sendSms(phone, msg);
        sent += 1;
      } catch (smsErr) {
        console.error('[subscription-reminders] sms failed', { tenantId: row.tenant_id, phone, smsErr });
      }
    }

    await supabase
      .from('tenant_subscriptions')
      .update({
        last_reminder_sent_at: now.toISOString(),
      })
      .eq('tenant_id', row.tenant_id);
  }

  return { scanned: rows.length, sent };
}

export async function sendSubscriptionReminderForTenant(tenantId: string, now: Date = new Date()): Promise<{ sent: number }> {
  const { data, error } = await supabase
    .from('tenant_subscriptions')
    .select('*, tenants(id, name)')
    .eq('tenant_id', tenantId)
    .single();

  if (error || !data) throw error || new Error('subscription not found');

  const row = data as SubscriptionWithTenant;
  const computed = computeSubscriptionStatus(row, now);
  const tenantName = row.tenants?.name || row.tenant_id;
  const msg = buildReminderMessage(tenantName, Math.max(computed.daysRemaining, 0), row.valid_until, row.plan_name);

  let sent = 0;
  const targets = new Set<string>();
  const supportPhone = (process.env.SUPPORT_SMS_TO || '').trim();
  if (supportPhone) targets.add(supportPhone);
  const ownerPhones = await getTenantPhones(tenantId);
  ownerPhones.forEach((p) => targets.add(p));

  for (const phone of targets) {
    await sendSms(phone, msg);
    sent += 1;
  }

  await supabase
    .from('tenant_subscriptions')
    .update({ last_reminder_sent_at: now.toISOString() })
    .eq('tenant_id', tenantId);

  return { sent };
}
