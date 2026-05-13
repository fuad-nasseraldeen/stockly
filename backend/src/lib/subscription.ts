import { supabase } from './supabase.js';

export const SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due', 'expired', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type TenantSubscriptionRow = {
  id: string;
  tenant_id: string;
  status: SubscriptionStatus;
  plan_name: string;
  paid_amount: number | null;
  currency: string;
  valid_from: string;
  valid_until: string;
  payment_method: string | null;
  notes: string | null;
  last_reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ComputedSubscriptionStatus = {
  status: SubscriptionStatus;
  daysRemaining: number;
  isExpiringSoon: boolean;
};

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function toDayDate(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return startOfDay(d);
}

export function computeSubscriptionStatus(
  row: Pick<TenantSubscriptionRow, 'status' | 'valid_until'>,
  now: Date = new Date(),
): ComputedSubscriptionStatus {
  if (row.status === 'cancelled') {
    return { status: 'cancelled', daysRemaining: 0, isExpiringSoon: false };
  }

  const today = startOfDay(now);
  const validUntil = toDayDate(row.valid_until);
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.floor((validUntil.getTime() - today.getTime()) / msPerDay);

  if (daysRemaining < 0) {
    return { status: 'expired', daysRemaining, isExpiringSoon: false };
  }

  const isExpiringSoon = daysRemaining <= 7;

  if (row.status === 'trial') {
    return { status: 'trial', daysRemaining, isExpiringSoon };
  }

  if (row.status === 'past_due') {
    return { status: 'past_due', daysRemaining, isExpiringSoon };
  }

  return { status: 'active', daysRemaining, isExpiringSoon };
}

export async function getTenantSubscription(tenantId: string): Promise<TenantSubscriptionRow | null> {
  const { data, error } = await supabase
    .from('tenant_subscriptions')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) throw error;
  return (data as TenantSubscriptionRow | null) ?? null;
}

export async function ensureTenantSubscription(tenantId: string): Promise<TenantSubscriptionRow> {
  const existing = await getTenantSubscription(tenantId);
  if (existing) return existing;

  const now = new Date();
  const validFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const validUntil = new Date(validFrom);
  validUntil.setUTCMonth(validUntil.getUTCMonth() + 1);

  const { data, error } = await supabase
    .from('tenant_subscriptions')
    .insert({
      tenant_id: tenantId,
      status: 'trial',
      plan_name: 'trial_free',
      currency: 'ILS',
      valid_from: validFrom.toISOString().slice(0, 10),
      valid_until: validUntil.toISOString().slice(0, 10),
    })
    .select('*')
    .single();

  if (error || !data) throw error || new Error('failed to create tenant subscription');
  return data as TenantSubscriptionRow;
}

export function shouldSendReminder(lastReminderAt: string | null, now: Date = new Date()): boolean {
  if (!lastReminderAt) return true;
  const last = new Date(lastReminderAt);
  const diff = now.getTime() - last.getTime();
  return diff >= 20 * 60 * 60 * 1000;
}

export function shouldEnforceSubscriptionWrites(): boolean {
  return String(process.env.SUBSCRIPTION_ENFORCEMENT_ENABLED ?? 'true').toLowerCase() === 'true';
}

/**
 * Backend entitlement helper: paid access is active only for paid plans with active computed status.
 * Source of truth is Stripe-synced DB state in tenant_subscriptions.
 */
export function hasActivePaidSubscription(
  row: Pick<TenantSubscriptionRow, 'plan_name' | 'status' | 'valid_until'>,
  now: Date = new Date(),
): boolean {
  if (row.plan_name === 'trial_free') return false;
  const computed = computeSubscriptionStatus(row, now);
  return computed.status === 'active';
}
