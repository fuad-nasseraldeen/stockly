import { Router } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
import { requireAuth, requireTenant } from '../middleware/auth.js';
import { computeSubscriptionStatus, ensureTenantSubscription } from '../lib/subscription.js';
import { supabase } from '../lib/supabase.js';
import { getStripePriceIdForPlan, stripeGet, stripePostForm } from '../lib/stripe.js';
import { sendSubscriptionPurchaseNotifications } from '../services/subscription-purchase-notifications.js';
import { getStripeWebhookSecret, resolveStripeAppUrl, validateStripeConfig } from '../lib/stripe-config.js';

const router = Router();

const paidPlanSchema = z.enum(['monthly_199', 'annual_49']);

function toIsoDateFromUnix(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function fallbackPeriodEnd(validFromIso: string, planName: string): string {
  const base = new Date(`${validFromIso}T00:00:00.000Z`);
  if (planName === 'annual_49') {
    base.setUTCFullYear(base.getUTCFullYear() + 1);
  } else {
    base.setUTCMonth(base.getUTCMonth() + 1);
  }
  return base.toISOString().slice(0, 10);
}

function parseSubscriptionNotes(notes: string | null | undefined): Record<string, unknown> {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
  return {};
}

function isStripeMissingResourceError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || '');
  return /No such (customer|subscription|invoice)/i.test(msg);
}

function getStripeSdk(): any {
  const key = (process.env.STRIPE_SECRET_KEY || '').trim();
  return new Stripe(key as any);
}

function mergeNotes(existing: string | null | undefined, patch: Record<string, unknown>): string {
  const base = parseSubscriptionNotes(existing);
  return JSON.stringify({ ...base, ...patch });
}

async function findTenantSubscriptionByStripe(params: { stripeSubscriptionId?: string | null; stripeCustomerId?: string | null }) {
  if (params.stripeSubscriptionId) {
    const { data } = await supabase
      .from('tenant_subscriptions')
      .select('*')
      .ilike('notes', `%${params.stripeSubscriptionId}%`)
      .limit(1);
    if (data?.[0]) return data[0] as any;
  }
  if (params.stripeCustomerId) {
    const { data } = await supabase
      .from('tenant_subscriptions')
      .select('*')
      .ilike('notes', `%${params.stripeCustomerId}%`)
      .limit(1);
    if (data?.[0]) return data[0] as any;
  }
  return null;
}

async function markWebhookProcessed(subscriptionRow: any, eventId: string): Promise<boolean> {
  const notes = parseSubscriptionNotes(subscriptionRow?.notes);
  const processed = Array.isArray(notes.processed_stripe_event_ids)
    ? notes.processed_stripe_event_ids.filter((v) => typeof v === 'string')
    : [];
  if (processed.includes(eventId)) return false;
  const next = [...processed, eventId].slice(-100);
  const { error } = await supabase
    .from('tenant_subscriptions')
    .update({ notes: mergeNotes(subscriptionRow?.notes, { processed_stripe_event_ids: next, last_webhook_event_id: eventId, last_webhook_event_at: new Date().toISOString() }) })
    .eq('tenant_id', subscriptionRow.tenant_id);
  if (error) throw error;
  return true;
}

async function activateSubscriptionFromCheckoutSession(params: {
  tenantId: string;
  sessionId: string;
}): Promise<{ ok: true; payload: { planName: string; validFrom: string; validUntil: string; purchaserUserId: string | null; purchaserEmail: string | null; sessionId: string } } | { ok: false; reason: string }> {
  const session = await stripeGet<{
    status: string;
    payment_status: string;
    metadata?: Record<string, string>;
    subscription?: string;
    customer_details?: { email?: string | null } | null;
  }>(`/checkout/sessions/${encodeURIComponent(params.sessionId)}`);

  const tenantIdFromMeta = String(session.metadata?.tenant_id || '');
  const planName = String(session.metadata?.plan_name || '');
  if (tenantIdFromMeta !== params.tenantId) return { ok: false, reason: 'SESSION_TENANT_MISMATCH' };
  if (session.payment_status !== 'paid' && session.status !== 'complete') return { ok: false, reason: 'PAYMENT_NOT_COMPLETED' };
  if (!session.subscription) return { ok: false, reason: 'MISSING_SUBSCRIPTION' };

  const subscription = await stripeGet<{
    id: string;
    customer: string | null;
    cancel_at_period_end: boolean;
    current_period_start?: number | null;
    current_period_end?: number | null;
  }>(`/subscriptions/${encodeURIComponent(session.subscription)}`);

  const validFrom = toIsoDateFromUnix(subscription.current_period_start) || todayIsoDate();
  const validUntilRaw = toIsoDateFromUnix(subscription.current_period_end) || fallbackPeriodEnd(validFrom, planName);
  const validUntil = validUntilRaw <= validFrom ? fallbackPeriodEnd(validFrom, planName) : validUntilRaw;

  await ensureTenantSubscription(params.tenantId);
  const { data: currentSub } = await supabase
    .from('tenant_subscriptions')
    .select('notes')
    .eq('tenant_id', params.tenantId)
    .maybeSingle();

  let notesPayload: Record<string, unknown> = {};
  if (currentSub?.notes) {
    try {
      const parsed = JSON.parse(currentSub.notes);
      if (parsed && typeof parsed === 'object') notesPayload = parsed as Record<string, unknown>;
    } catch {
      notesPayload = {};
    }
  }

  const { error } = await supabase
    .from('tenant_subscriptions')
    .update({
      status: 'active',
      plan_name: planName || 'monthly_199',
      paid_amount: null,
      currency: 'ILS',
      valid_from: validFrom,
      valid_until: validUntil,
      payment_method: 'stripe',
      notes: JSON.stringify({
        ...notesPayload,
        stripe_customer_id: subscription.customer,
        stripe_subscription_id: subscription.id,
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
        last_checkout_session_id: params.sessionId,
      }),
    })
    .eq('tenant_id', params.tenantId);

  if (error) return { ok: false, reason: 'DB_UPDATE_FAILED' };
  return {
    ok: true,
    payload: {
      planName: planName || 'monthly_199',
      validFrom,
      validUntil,
      purchaserUserId: String(session.metadata?.user_id || '') || null,
      purchaserEmail: String(session.customer_details?.email || '') || null,
      sessionId: params.sessionId,
    },
  };
}

async function maybeSendPurchaseNotifications(params: {
  tenantId: string;
  planName: string;
  validFrom: string;
  validUntil: string;
  purchaserUserId?: string | null;
  purchaserEmail?: string | null;
  sessionId: string;
}): Promise<void> {
  const { data: subRow } = await supabase
    .from('tenant_subscriptions')
    .select('notes')
    .eq('tenant_id', params.tenantId)
    .maybeSingle();
  let notesPayload: Record<string, unknown> = {};
  if (subRow?.notes) {
    try {
      const parsed = JSON.parse(subRow.notes);
      if (parsed && typeof parsed === 'object') notesPayload = parsed as Record<string, unknown>;
    } catch {
      notesPayload = {};
    }
  }

  const notifiedSessionId = typeof notesPayload?.purchase_notified_session_id === 'string'
    ? notesPayload.purchase_notified_session_id
    : null;
  if (notifiedSessionId === params.sessionId) return;

  const [{ data: tenantRow }, profileResp] = await Promise.all([
    supabase.from('tenants').select('name').eq('id', params.tenantId).maybeSingle(),
    params.purchaserUserId
      ? supabase.from('profiles').select('phone_e164').eq('user_id', params.purchaserUserId).maybeSingle()
      : Promise.resolve({ data: null as any }),
  ]);

  await sendSubscriptionPurchaseNotifications({
    customerEmail: params.purchaserEmail || null,
    customerPhoneE164: (profileResp?.data?.phone_e164 as string | null) || null,
    tenantName: (tenantRow?.name as string | undefined) || params.tenantId,
    planName: params.planName,
    validFrom: params.validFrom,
    validUntil: params.validUntil,
  });

  await supabase
    .from('tenant_subscriptions')
    .update({
      notes: JSON.stringify({
        ...notesPayload,
        purchase_notified_session_id: params.sessionId,
        purchase_notified_at: new Date().toISOString(),
      }),
    })
    .eq('tenant_id', params.tenantId);
}

async function recoverStripeCustomerIdForTenant(tenantId: string): Promise<string | null> {
  const row = await ensureTenantSubscription(tenantId);
  const notes = parseSubscriptionNotes(row.notes);
  const stripeSubId = typeof notes.stripe_subscription_id === 'string' ? notes.stripe_subscription_id : null;
  const lastSessionId = typeof notes.last_checkout_session_id === 'string' ? notes.last_checkout_session_id : null;

  let recoveredCustomerId: string | null = null;
  if (stripeSubId) {
    try {
      const sub = await stripeGet<{ customer: string | null }>(`/subscriptions/${encodeURIComponent(stripeSubId)}`);
      recoveredCustomerId = sub.customer || null;
    } catch {
      recoveredCustomerId = null;
    }
  }

  if (!recoveredCustomerId && lastSessionId) {
    try {
      const session = await stripeGet<{ customer: string | null }>(`/checkout/sessions/${encodeURIComponent(lastSessionId)}`);
      recoveredCustomerId = session.customer || null;
    } catch {
      recoveredCustomerId = null;
    }
  }

  if (!recoveredCustomerId) return null;

  await supabase
    .from('tenant_subscriptions')
    .update({
      notes: mergeNotes(row.notes, {
        stripe_customer_id: recoveredCustomerId,
        stripe_customer_recovered_at: new Date().toISOString(),
      }),
    })
    .eq('tenant_id', tenantId);

  return recoveredCustomerId;
}

router.get('/status', requireAuth, requireTenant, async (req, res) => {
  const tenant = (req as any).tenant as { tenantId: string };
  try {
    let row = await ensureTenantSubscription(tenant.tenantId);
    if (row.payment_method === 'stripe_pending' && row.status === 'past_due' && row.notes) {
      try {
        const parsed = JSON.parse(row.notes) as Record<string, unknown>;
        const pendingSessionId = typeof parsed?.pending_checkout_session_id === 'string'
          ? parsed.pending_checkout_session_id
          : null;
        if (pendingSessionId) {
          const activated = await activateSubscriptionFromCheckoutSession({ tenantId: tenant.tenantId, sessionId: pendingSessionId });
          if (activated.ok) {
            await maybeSendPurchaseNotifications({
              tenantId: tenant.tenantId,
              ...activated.payload,
            });
          }
          row = (await ensureTenantSubscription(tenant.tenantId)) as typeof row;
        }
      } catch (reconcileError) {
        console.warn('[subscription status] reconcile skipped:', reconcileError);
      }
    }
    const computed = computeSubscriptionStatus(row);
    return res.json({
      ...row,
      computed_status: computed.status,
      daysRemaining: computed.daysRemaining,
      isExpiringSoon: computed.isExpiringSoon,
    });
  } catch (error) {
    console.error('[subscription status] failed', error);
    return res.status(500).json({ error: 'שגיאה בטעינת סטטוס מנוי' });
  }
});

router.post('/checkout-session', requireAuth, requireTenant, async (req, res) => {
  const tenant = (req as any).tenant as { tenantId: string; role: 'owner' | 'worker' };
  const user = (req as any).user as { id: string; email?: string };

  if (tenant.role !== 'owner') {
    return res.status(403).json({ error: 'רק בעל חנות יכול לרכוש מנוי' });
  }

  const parsed = z.object({ plan: paidPlanSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'תוכנית מנוי לא תקינה' });

  try {
    validateStripeConfig();
    const priceId = getStripePriceIdForPlan(parsed.data.plan);
    const appUrl = resolveStripeAppUrl();

    const session = await stripePostForm<{ id: string; url: string }>('/checkout/sessions', {
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      ...(user.email ? { customer_email: user.email } : {}),
      locale: 'he',
      'custom_text[submit][message]': 'התשלום מתבצע בסביבת תשלום מאובטחת של STOCKLY',
      allow_promotion_codes: 'true',
      success_url: `${appUrl}/subscription?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/subscription?billing=cancelled`,
      'metadata[tenant_id]': tenant.tenantId,
      'metadata[plan_name]': parsed.data.plan,
      'metadata[user_id]': user.id,
      client_reference_id: user.id,
    });

    const existing = await ensureTenantSubscription(tenant.tenantId);
    let notesPayload: Record<string, unknown> = {};
    if (existing.notes) {
      try {
        const parsed = JSON.parse(existing.notes);
        if (parsed && typeof parsed === 'object') notesPayload = parsed as Record<string, unknown>;
      } catch {
        notesPayload = {};
      }
    }
    await supabase
      .from('tenant_subscriptions')
      .update({
        payment_method: 'stripe_pending',
        notes: JSON.stringify({
          ...notesPayload,
          pending_checkout_session_id: session.id,
          pending_plan_name: parsed.data.plan,
        }),
      })
      .eq('tenant_id', tenant.tenantId);

    return res.json({ url: session.url });
  } catch (error) {
    console.error('[subscription checkout] failed', error);
    const details = error instanceof Error ? error.message : 'unknown_error';
    return res.status(500).json({ error: `לא הצלחנו לפתוח עמוד תשלום כרגע (${details})` });
  }
});

router.post('/confirm-checkout', requireAuth, requireTenant, async (req, res) => {
  const tenant = (req as any).tenant as { tenantId: string; role: 'owner' | 'worker' };
  const user = (req as any).user as { id: string; email?: string };
  if (tenant.role !== 'owner') {
    return res.status(403).json({ error: 'רק בעל חנות יכול לאשר מנוי' });
  }

  const parsed = z.object({ sessionId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'sessionId חסר' });

  try {
    const activated = await activateSubscriptionFromCheckoutSession({
      tenantId: tenant.tenantId,
      sessionId: parsed.data.sessionId,
    });
    if (!activated.ok) {
      if (activated.reason === 'PAYMENT_NOT_COMPLETED') {
        return res.status(400).json({ error: 'התשלום עדיין לא הושלם' });
      }
      if (activated.reason === 'SESSION_TENANT_MISMATCH') {
        return res.status(403).json({ error: 'session לא שייך לחנות הזו' });
      }
      if (activated.reason === 'MISSING_SUBSCRIPTION') {
        return res.status(400).json({ error: 'לא נמצאו נתוני מנוי' });
      }
      return res.status(500).json({ error: 'שגיאה בעדכון סטטוס המנוי' });
    }

    const { data, error } = await supabase
      .from('tenant_subscriptions')
      .select('*')
      .eq('tenant_id', tenant.tenantId)
      .single();

    if (error || !data) {
      return res.status(500).json({ error: 'שגיאה בעדכון סטטוס המנוי' });
    }

    const computed = computeSubscriptionStatus(data as any);
    const planName = String((data as any).plan_name || 'monthly_199');
    const validFrom = String((data as any).valid_from || '');
    const validUntil = String((data as any).valid_until || '');

    try {
      await maybeSendPurchaseNotifications({
        tenantId: tenant.tenantId,
        planName,
        validFrom,
        validUntil,
        purchaserUserId: activated.payload.purchaserUserId || user.id,
        purchaserEmail: activated.payload.purchaserEmail || user.email || null,
        sessionId: parsed.data.sessionId,
      });
    } catch (notifyError) {
      console.error('[subscription confirm] purchase notifications failed', notifyError);
    }

    return res.json({
      ...data,
      computed_status: computed.status,
      daysRemaining: computed.daysRemaining,
      isExpiringSoon: computed.isExpiringSoon,
    });
  } catch (error) {
    console.error('[subscription confirm] failed', error);
    return res.status(500).json({ error: 'אישור תשלום נכשל' });
  }
});

router.post('/cancel', requireAuth, requireTenant, async (req, res) => {
  const tenant = (req as any).tenant as { tenantId: string; role: 'owner' | 'worker' };
  if (tenant.role !== 'owner') {
    return res.status(403).json({ error: 'רק בעל חנות יכול לבטל מנוי' });
  }

  const row = await ensureTenantSubscription(tenant.tenantId);
  const planName = row.plan_name;
  if (planName !== 'monthly_199' && planName !== 'annual_49') {
    return res.status(400).json({ error: 'אין מנוי בתשלום לביטול' });
  }

  try {
    let stripeSubId: string | null = null;
    let notesPayload: Record<string, unknown> = {};
    if (row.notes) {
      try {
        const parsed = JSON.parse(row.notes);
        if (parsed && typeof parsed === 'object') notesPayload = parsed as Record<string, unknown>;
        stripeSubId = typeof parsed?.stripe_subscription_id === 'string' ? parsed.stripe_subscription_id : null;
      } catch {
        stripeSubId = null;
      }
    }

    if (!stripeSubId) {
      return res.status(400).json({ error: 'לא נמצא מזהה מנוי ב-Stripe' });
    }

    const cancelled = await stripePostForm<{
      id: string;
      current_period_end: number;
    }>(`/subscriptions/${encodeURIComponent(stripeSubId)}`, {
      cancel_at_period_end: 'true',
    });

    const validUntil = toIsoDateFromUnix(cancelled.current_period_end) || row.valid_until;
    const { data, error } = await supabase
      .from('tenant_subscriptions')
      .update({
        // Cancellation is applied now on Stripe (no further renewals), while entitlement remains
        // active through the already-paid current period end.
        status: 'active',
        valid_until: validUntil,
        notes: JSON.stringify({
          ...notesPayload,
          stripe_subscription_id: cancelled.id,
          cancel_at_period_end: true,
          cancelled_at: new Date().toISOString(),
          cancelled_plan_name: planName,
          cancellation_policy: 'no_refund',
        }),
      })
      .eq('tenant_id', tenant.tenantId)
      .select('*')
      .single();

    if (error || !data) return res.status(500).json({ error: 'עדכון ביטול מנוי נכשל' });

    const computed = computeSubscriptionStatus(data as any);
    const daysRemaining = Math.max(0, computed.daysRemaining);
    const cancelMessage = planName === 'annual_49'
      ? `המנוי השנתי בוטל מיידית לחיובים עתידיים (ללא החזר). נשארו ${daysRemaining} ימים ליהנות מההטבות והאפליקציה עד סוף התקופה הנוכחית.`
      : `המנוי החודשי בוטל מיידית לחיובים עתידיים. נשארו ${daysRemaining} ימים ליהנות מההטבות והאפליקציה עד סוף התקופה הנוכחית.`;
    return res.json({
      ...data,
      computed_status: computed.status,
      daysRemaining: computed.daysRemaining,
      isExpiringSoon: computed.isExpiringSoon,
      cancel_message: cancelMessage,
    });
  } catch (error) {
    console.error('[subscription cancel] failed', error);
    return res.status(500).json({ error: 'לא ניתן לבטל כרגע את המנוי' });
  }
});

router.get('/billing-history', requireAuth, requireTenant, async (req, res) => {
  const tenant = (req as any).tenant as { tenantId: string; role: 'owner' | 'worker' };
  if (tenant.role !== 'owner') {
    return res.status(403).json({ error: 'רק בעל חנות יכול לצפות בהיסטוריית חיובים' });
  }

  try {
    const row = await ensureTenantSubscription(tenant.tenantId);
    const notes = parseSubscriptionNotes(row.notes);
    const stripeCustomerId = typeof notes.stripe_customer_id === 'string' ? notes.stripe_customer_id : null;
    const stripeSubscriptionId = typeof notes.stripe_subscription_id === 'string' ? notes.stripe_subscription_id : null;
    if (!stripeCustomerId) {
      return res.json({ items: [] });
    }

    let effectiveCustomerId = stripeCustomerId;
    let list: {
      data: Array<{
        id: string;
        amount_paid: number;
        currency: string;
        status: string;
        hosted_invoice_url?: string | null;
        invoice_pdf?: string | null;
        created: number;
        period_start: number;
        period_end: number;
        subscription?: string | null;
        lines?: {
          data?: Array<{
            period?: {
              start: number;
              end: number;
            } | null;
          }>;
        } | null;
      }>;
    };
    try {
      if (stripeSubscriptionId) {
        // Prefer subscription-scope query: avoids missing invoices when stored customer id is stale.
        list = await stripeGet(`/invoices?subscription=${encodeURIComponent(stripeSubscriptionId)}&limit=20&expand[]=data.lines.data`);
      } else {
        list = await stripeGet(`/invoices?customer=${encodeURIComponent(effectiveCustomerId)}&limit=20&expand[]=data.lines.data`);
      }
    } catch (error) {
      if (!isStripeMissingResourceError(error)) throw error;
      const recovered = await recoverStripeCustomerIdForTenant(tenant.tenantId);
      if (!recovered) {
        return res.status(409).json({ error: 'מזהה לקוח Stripe לא תקין לסביבת העבודה הנוכחית. יש לבצע רכישה חדשה במצב הנוכחי.' });
      }
      effectiveCustomerId = recovered;
      list = await stripeGet(`/invoices?customer=${encodeURIComponent(effectiveCustomerId)}&limit=20&expand[]=data.lines.data`);
    }

    let sourceInvoices = list.data || [];
    if (sourceInvoices.length === 0 && stripeSubscriptionId) {
      // Fallback: in rare cases subscription query returns empty while customer query has data.
      const customerList = await stripeGet<{
        data: Array<{
          id: string;
          amount_paid: number;
          currency: string;
          status: string;
          hosted_invoice_url?: string | null;
          invoice_pdf?: string | null;
          created: number;
          period_start: number;
          period_end: number;
          subscription?: string | null;
          lines?: {
            data?: Array<{
              period?: {
                start: number;
                end: number;
              } | null;
            }>;
          } | null;
        }>;
      }>(`/invoices?customer=${encodeURIComponent(effectiveCustomerId)}&limit=20&expand[]=data.lines.data`);
      sourceInvoices = customerList.data || [];
    }

    const items = sourceInvoices
      .filter((i) => !stripeSubscriptionId || !i.subscription || i.subscription === stripeSubscriptionId)
      .map((i) => {
        const linePeriod = i.lines?.data?.[0]?.period || null;
        const periodStartUnix = linePeriod?.start || i.period_start;
        const periodEndUnix = linePeriod?.end || i.period_end;
        return {
          id: i.id,
          amount_paid: i.amount_paid,
          currency: i.currency,
          status: i.status,
          hosted_invoice_url: i.hosted_invoice_url || null,
          invoice_pdf: i.invoice_pdf || null,
          created_at: new Date(i.created * 1000).toISOString(),
          period_start: new Date(periodStartUnix * 1000).toISOString().slice(0, 10),
          period_end: new Date(periodEndUnix * 1000).toISOString().slice(0, 10),
        };
      });

    return res.json({ items });
  } catch (error) {
    console.error('[subscription billing-history] failed', error);
    return res.status(500).json({ error: 'שגיאה בטעינת היסטוריית חיובים' });
  }
});

router.post('/billing-portal', requireAuth, requireTenant, async (req, res) => {
  const tenant = (req as any).tenant as { tenantId: string; role: 'owner' | 'worker' };
  if (tenant.role !== 'owner') {
    return res.status(403).json({ error: 'רק בעל חנות יכול לעדכן אמצעי תשלום' });
  }

  try {
    const row = await ensureTenantSubscription(tenant.tenantId);
    const notes = parseSubscriptionNotes(row.notes);
    const stripeCustomerId = typeof notes.stripe_customer_id === 'string' ? notes.stripe_customer_id : null;
    if (!stripeCustomerId) {
      return res.status(400).json({ error: 'לא נמצא לקוח Stripe לחנות זו' });
    }

    const appUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
    let effectiveCustomerId = stripeCustomerId;
    let portal: { url: string };
    try {
      portal = await stripePostForm('/billing_portal/sessions', {
        customer: effectiveCustomerId,
        return_url: `${appUrl}/subscription`,
      });
    } catch (error) {
      if (!isStripeMissingResourceError(error)) throw error;
      const recovered = await recoverStripeCustomerIdForTenant(tenant.tenantId);
      if (!recovered) {
        return res.status(409).json({ error: 'מזהה לקוח Stripe לא תקין לסביבת העבודה הנוכחית. יש לבצע רכישה חדשה במצב הנוכחי.' });
      }
      effectiveCustomerId = recovered;
      portal = await stripePostForm('/billing_portal/sessions', {
        customer: effectiveCustomerId,
        return_url: `${appUrl}/subscription`,
      });
    }
    return res.json({ url: portal.url });
  } catch (error) {
    console.error('[subscription billing-portal] failed', error);
    return res.status(500).json({ error: 'לא הצלחנו לפתוח את עמוד עדכון הכרטיס כרגע' });
  }
});

// Stripe webhook (must receive raw body from app-level express.raw middleware).
router.post('/webhook', async (req, res) => {
  try {
    validateStripeConfig({ requireWebhookSecret: true });
    const signature = String(req.headers['stripe-signature'] || '');
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    const rawBody = req.body as Buffer;
    const event = getStripeSdk().webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());

    const eventType = event.type;
    if (
      eventType !== 'checkout.session.completed' &&
      eventType !== 'invoice.paid' &&
      eventType !== 'invoice.payment_failed' &&
      eventType !== 'customer.subscription.updated' &&
      eventType !== 'customer.subscription.deleted'
    ) {
      return res.status(200).json({ received: true, ignored: true });
    }

    if (eventType === 'checkout.session.completed') {
      const session = event.data.object as any;
      const tenantId = String(session.metadata?.tenant_id || '');
      if (!tenantId || !session.id) return res.status(400).json({ error: 'Missing tenant/session metadata' });
      const subRow = await ensureTenantSubscription(tenantId);
      const shouldProcess = await markWebhookProcessed(subRow, event.id);
      if (!shouldProcess) return res.status(200).json({ received: true, duplicate: true });
      const activated = await activateSubscriptionFromCheckoutSession({ tenantId, sessionId: session.id });
      if (activated.ok) {
        await maybeSendPurchaseNotifications({ tenantId, ...activated.payload });
      }
      return res.status(200).json({ received: true });
    }

    if (eventType === 'invoice.paid' || eventType === 'invoice.payment_failed') {
      const invoice = event.data.object as any;
      const subId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : null;
      const row = await findTenantSubscriptionByStripe({ stripeSubscriptionId: subId, stripeCustomerId: customerId });
      if (!row) return res.status(200).json({ received: true, unmatched: true });
      const shouldProcess = await markWebhookProcessed(row, event.id);
      if (!shouldProcess) return res.status(200).json({ received: true, duplicate: true });

      const status = eventType === 'invoice.paid' ? 'active' : 'past_due';
      await supabase
        .from('tenant_subscriptions')
        .update({
          status,
          notes: mergeNotes(row.notes, {
            latest_invoice_id: invoice.id || null,
            last_payment_status: eventType === 'invoice.paid' ? 'paid' : 'failed',
          }),
        })
        .eq('tenant_id', row.tenant_id);
      return res.status(200).json({ received: true });
    }

    if (eventType === 'customer.subscription.updated' || eventType === 'customer.subscription.deleted') {
      const sub = event.data.object as any;
      const row = await findTenantSubscriptionByStripe({ stripeSubscriptionId: sub.id, stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : null });
      if (!row) return res.status(200).json({ received: true, unmatched: true });
      const shouldProcess = await markWebhookProcessed(row, event.id);
      if (!shouldProcess) return res.status(200).json({ received: true, duplicate: true });

      const priceId = sub.items.data[0]?.price?.id || null;
      const planName = priceId === (process.env.STRIPE_PRICE_MONTHLY_199 || '').trim()
        ? 'monthly_199'
        : priceId === ((process.env.STRIPE_PRICE_ANNUAL_149 || process.env.STRIPE_PRICE_ANNUAL_49 || '').trim())
        ? 'annual_49'
        : row.plan_name;
      const currentPeriodStart = toIsoDateFromUnix(sub.current_period_start) || row.valid_from;
      const currentPeriodEnd = toIsoDateFromUnix(sub.current_period_end) || fallbackPeriodEnd(currentPeriodStart, planName);
      const mappedStatus = sub.status === 'canceled'
        ? 'cancelled'
        : sub.status === 'past_due' || sub.status === 'unpaid'
        ? 'past_due'
        : sub.status === 'active' || sub.status === 'trialing'
        ? 'active'
        : row.status;

      await supabase
        .from('tenant_subscriptions')
        .update({
          status: mappedStatus,
          plan_name: planName,
          valid_from: currentPeriodStart,
          valid_until: currentPeriodEnd,
          notes: mergeNotes(row.notes, {
            stripe_subscription_id: sub.id,
            stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : null,
            stripe_price_id: priceId,
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd,
            cancel_at_period_end: Boolean(sub.cancel_at_period_end),
            last_payment_status: sub.status,
          }),
        })
        .eq('tenant_id', row.tenant_id);
      return res.status(200).json({ received: true });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'webhook error';
    if (msg.toLowerCase().includes('signature')) {
      return res.status(400).json({ error: 'Invalid Stripe signature' });
    }
    console.error('[subscription webhook] failed', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
