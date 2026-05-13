import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantSubscriptionStatus } from '../hooks/useAdmin';
import { subscriptionApi, type BillingHistoryItem } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';

function planLabel(planName: string): string {
  if (planName === 'monthly_199') return 'חודשי - ₪199';
  if (planName === 'annual_49') return 'שנתי - ₪1,788 מראש';
  if (planName === 'trial_free') return 'ניסיון חינם';
  return planName;
}

function statusLabel(status: string): string {
  if (status === 'active') return 'פעיל';
  if (status === 'trial') return 'ניסיון';
  if (status === 'past_due') return 'דורש הסדרה';
  if (status === 'expired') return 'פג תוקף';
  if (status === 'cancelled') return 'בוטל';
  return status;
}

function money(agorot: number, currency: string): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: (currency || 'ILS').toUpperCase(),
  }).format((agorot || 0) / 100);
}

function billingStatusLabel(status: string): string {
  if (status === 'paid') return 'שולם';
  if (status === 'open') return 'פתוח';
  if (status === 'draft') return 'טיוטה';
  if (status === 'void') return 'בוטל';
  if (status === 'uncollectible') return 'לא נגבה';
  return status;
}

export default function Subscription() {
  const { data: subscriptionStatus } = useTenantSubscriptionStatus();
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['tenant', 'billing-history'],
    queryFn: () => subscriptionApi.billingHistory(),
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const billingStatus = params.get('billing');
    const sessionId = params.get('session_id');
    if (billingStatus !== 'success' || !sessionId) return;

    let cancelled = false;
    const confirm = async () => {
      try {
        await subscriptionApi.confirmCheckout(sessionId);
        if (cancelled) return;
        setBillingMessage('המנוי הופעל בהצלחה. תודה רבה!');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['tenant', 'subscription-status'] }),
          queryClient.invalidateQueries({ queryKey: ['tenant', 'billing-history'] }),
        ]);
        navigate('/subscription', { replace: true });
      } catch (error) {
        if (cancelled) return;
        const msg = error instanceof Error ? error.message : 'לא הצלחנו לאשר את המנוי';
        setBillingMessage(msg);
      }
    };
    void confirm();
    return () => {
      cancelled = true;
    };
  }, [location.search, navigate, queryClient]);

  const orderedHistory = useMemo(() => {
    return [...(history?.items || [])].sort((a, b) => a.created_at < b.created_at ? 1 : -1);
  }, [history?.items]);

  const openBillingPortal = async () => {
    try {
      setPortalLoading(true);
      const res = await subscriptionApi.billingPortal();
      if (res?.url) window.location.href = res.url;
    } catch (error) {
      setBillingMessage(error instanceof Error ? error.message : 'לא הצלחנו לפתוח עמוד עדכון כרטיס');
    } finally {
      setPortalLoading(false);
    }
  };

  const cancelSubscription = async () => {
    try {
      setCancelLoading(true);
      const result = await subscriptionApi.cancel();
      setBillingMessage(
        result.cancel_message || 'הביטול נקלט. המנוי יישאר פעיל עד סוף התקופה הנוכחית.',
      );
      setCancelDialogOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenant', 'subscription-status'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant', 'billing-history'] }),
      ]);
    } catch (error) {
      setBillingMessage(error instanceof Error ? error.message : 'לא הצלחנו לבטל את המנוי כרגע');
    } finally {
      setCancelLoading(false);
    }
  };

  const canCancelSubscription =
    (subscriptionStatus?.plan_name === 'monthly_199' || subscriptionStatus?.plan_name === 'annual_49')
    && subscriptionStatus?.computed_status !== 'cancelled';
  const isAnnualPlan = subscriptionStatus?.plan_name === 'annual_49';
  const remainingDays = Math.max(0, Number(subscriptionStatus?.daysRemaining || 0));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">מנוי וחיובים</h1>
        <p className="text-sm text-muted-foreground mt-1.5">סטטוס מנוי, היסטוריית חיובים וניהול אמצעי תשלום</p>
      </div>

      {billingMessage ? (
        <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {billingMessage}
        </div>
      ) : null}

      {subscriptionStatus ? (
        <Card className="shadow-md border-2">
          <CardHeader>
            <CardTitle className="text-lg font-bold">סטטוס מנוי</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>מסלול:</strong> {planLabel(subscriptionStatus.plan_name)}</p>
            <p><strong>סטטוס:</strong> {statusLabel(subscriptionStatus.computed_status)}</p>
            <p><strong>התחלה:</strong> {new Date(subscriptionStatus.valid_from).toLocaleDateString('he-IL')}</p>
            <p><strong>סיום תקופה נוכחית:</strong> {new Date(subscriptionStatus.valid_until).toLocaleDateString('he-IL')}</p>
            <p className="text-muted-foreground">
              המערכת שומרת את אמצעי התשלום ומבצעת חיוב חוזר אוטומטי בתאריך החידוש.
            </p>
            <div className="pt-2">
              <Button onClick={openBillingPortal} disabled={portalLoading || cancelLoading}>
                {portalLoading ? 'פותח...' : 'עדכון כרטיס אשראי / חיוב'}
              </Button>
            </div>
            {canCancelSubscription ? (
              <div className="pt-1">
                <Button variant="outline" onClick={() => setCancelDialogOpen(true)} disabled={cancelLoading || portalLoading}>
                  {cancelLoading ? 'מבטל...' : 'ביטול מנוי'}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="shadow-md border-2">
        <CardHeader>
          <CardTitle className="text-lg font-bold">היסטוריית חיובים</CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <p className="text-sm text-muted-foreground">טוען חיובים...</p>
          ) : orderedHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין עדיין חיובים להצגה.</p>
          ) : (
            <div className="space-y-3">
              {orderedHistory.map((item: BillingHistoryItem) => (
                <div key={item.id} className="rounded-md border p-3 text-sm">
                  <p><strong>סכום:</strong> {money(item.amount_paid, item.currency)}</p>
                  <p><strong>סטטוס:</strong> {billingStatusLabel(item.status)}</p>
                  <p><strong>תאריך חיוב:</strong> {new Date(item.created_at).toLocaleDateString('he-IL')}</p>
                  <p><strong>תקופה:</strong> {new Date(item.period_start).toLocaleDateString('he-IL')} - {new Date(item.period_end).toLocaleDateString('he-IL')}</p>
                  <div className="flex gap-3 pt-1">
                    {item.hosted_invoice_url ? (
                      <a className="text-primary underline" href={item.hosted_invoice_url} target="_blank" rel="noreferrer">צפייה בחשבונית</a>
                    ) : null}
                    {item.invoice_pdf ? (
                      <a className="text-primary underline" href={item.invoice_pdf} target="_blank" rel="noreferrer">PDF</a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={cancelDialogOpen} onOpenChange={(open) => !cancelLoading && setCancelDialogOpen(open)}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-0">
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6 py-5 text-white">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                ביטול מנוי
              </DialogTitle>
            </DialogHeader>
            <p className="mt-2 text-sm text-slate-200 leading-relaxed">
              {isAnnualPlan
                ? 'המנוי השנתי יבוטל מיידית לחיובים עתידיים וללא החזר כספי.'
                : 'המנוי החודשי יבוטל מיידית לחיובים עתידיים.'}
            </p>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">נשארו לך {remainingDays} ימים לשימוש בהטבות ובאפליקציה.</p>
              <p className="text-xs text-amber-800 mt-1">הגישה תישאר פעילה עד סוף התקופה הנוכחית.</p>
            </div>
            <p className="text-xs text-muted-foreground">
              לאחר האישור לא יתבצעו חיובים חדשים, והביטול יחול על חידושים עתידיים בלבד.
            </p>
          </div>

          <DialogFooter className="px-6 pb-5 pt-0 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)} disabled={cancelLoading}>
              חזרה
            </Button>
            <Button
              onClick={cancelSubscription}
              disabled={cancelLoading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {cancelLoading ? 'מבטל...' : 'אישור ביטול מנוי'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
