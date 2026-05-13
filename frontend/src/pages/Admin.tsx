import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAdminTenants, useAuditLogs, useBlockUser, useUnblockUser, useRemoveUser, useResetTenantData, useDeleteTenant, useAdminImpersonate, useAdminSubscriptions, useUpdateAdminSubscription, useExtendAdminSubscription, useSendAdminSubscriptionReminder } from '../hooks/useAdmin';
import { useSuperAdmin } from '../hooks/useSuperAdmin';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import {
  Shield,
  Users,
  Store,
  Ban,
  CheckCircle,
  AlertCircle,
  Clock,
  Trash2,
  X,
  RotateCcw,
  LogIn,
  MessageCircle,
  Smartphone,
} from 'lucide-react';
import type { TenantSubscription, TenantWithUsers } from '../lib/api';
const SUBSCRIPTION_PLANS = ['basic', 'pro', 'business', 'enterprise'] as const;

function pickStoreEntryUserId(tenant: TenantWithUsers): string | null {
  if (tenant.owners.length > 0) return tenant.owners[0].user_id;
  const w = tenant.workers.find((x) => !x.is_blocked);
  return w?.user_id ?? null;
}

function digitsForWhatsApp(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const d = phone.replace(/\D/g, '');
  return d.length > 0 ? d : null;
}

function smsHref(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const cleaned = phone.trim().replace(/\s/g, '');
  return cleaned ? `sms:${cleaned}` : null;
}

type AdminMember = TenantWithUsers['owners'][number] | TenantWithUsers['workers'][number];

function subscriptionPlanLabel(planName: string): string {
  if (planName === 'monthly_199') return 'חודשי ₪199';
  if (planName === 'annual_49') return 'שנתי ₪1,788';
  if (planName === 'trial_free') return 'ניסיון חינם';
  return planName;
}

function subscriptionStatusLabel(status: string): string {
  if (status === 'active') return 'פעיל';
  if (status === 'trial') return 'ניסיון';
  if (status === 'past_due') return 'דורש הסדרה';
  if (status === 'expired') return 'פג תוקף';
  if (status === 'cancelled') return 'בוטל';
  return status;
}

function AdminMemberDetail({
  member,
  tenantName,
  subscription,
  formatDate,
}: {
  member: AdminMember;
  tenantName: string;
  subscription?: TenantSubscription;
  formatDate: (date: string) => string;
}) {
  const waDigits = digitsForWhatsApp(member.phone_e164);
  const waMessage = subscription
    ? `שלום ${member.full_name || ''},\nעדכון מנוי לחנות ${tenantName}:\nתוכנית: ${subscriptionPlanLabel(subscription.plan_name)}\nסטטוס: ${subscriptionStatusLabel(subscription.computed_status)}\nתקופה: ${new Date(subscription.valid_from).toLocaleDateString('he-IL')} - ${new Date(subscription.valid_until).toLocaleDateString('he-IL')}\nנותרו ${Math.max(subscription.daysRemaining, 0)} ימים.\nצוות STOCKLY`
    : `שלום ${member.full_name || ''},\nנשמח לעדכן אותך בנושא המנוי בחנות ${tenantName}.\nצוות STOCKLY`;
  const smsLink = smsHref(member.phone_e164);
  return (
    <>
      <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground border-t border-border/60 pt-1.5">
        <div>
          <span className="font-medium text-foreground/80">טלפון: </span>
          {member.phone_e164 ?? '—'}
          {member.phone_verified_at ? ' (מאומת)' : member.phone_e164 ? ' (לא מאומת)' : null}
        </div>
        <div>
          <span className="font-medium text-foreground/80">כניסה אחרונה: </span>
          {member.last_sign_in_at ? formatDate(member.last_sign_in_at) : '—'}
        </div>
        <div>
          <span className="font-medium text-foreground/80">פעילות אחרונה במערכת: </span>
          {member.last_content_activity_at
            ? formatDate(member.last_content_activity_at)
            : 'אין רישום (למשל הוספת מוצר / מחיר / ספק)'}
        </div>
        {subscription ? (
          <>
            <div>
              <span className="font-medium text-foreground/80">סוג מנוי: </span>
              {subscriptionPlanLabel(subscription.plan_name)}
            </div>
            <div>
              <span className="font-medium text-foreground/80">סטטוס מנוי: </span>
              {subscriptionStatusLabel(subscription.computed_status)}
            </div>
            <div>
              <span className="font-medium text-foreground/80">תחילת תקופה: </span>
              {new Date(subscription.valid_from).toLocaleDateString('he-IL')}
            </div>
            <div>
              <span className="font-medium text-foreground/80">סיום תקופה: </span>
              {new Date(subscription.valid_until).toLocaleDateString('he-IL')}
            </div>
            <div>
              <span className="font-medium text-foreground/80">ימים שנותרו: </span>
              {Math.max(subscription.daysRemaining, 0)}
            </div>
          </>
        ) : null}
      </div>
      {(waDigits || smsLink) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {waDigits && (
            <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
              <a href={`https://wa.me/${waDigits}?text=${encodeURIComponent(waMessage)}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="w-3 h-3 ml-1" />
                וואטסאפ
              </a>
            </Button>
          )}
          {smsLink && (
            <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
              <a href={smsLink}>
                <Smartphone className="w-3 h-3 ml-1" />
                הודעה (SMS)
              </a>
            </Button>
          )}
        </div>
      )}
    </>
  );
}

export default function Admin() {
  console.log('🔍 Admin: Component rendering...');
  
  const { data: isSuperAdmin, isLoading: checkingAdmin } = useSuperAdmin();
  const { data: tenants = [], isLoading: tenantsLoading, error: tenantsError } = useAdminTenants();
  const { data: auditLogs = [], isLoading: logsLoading } = useAuditLogs({ limit: 50 });
  const { data: subscriptions = [], isLoading: subscriptionsLoading } = useAdminSubscriptions();

  console.log('🔍 Admin: After hooks:', {
    checkingAdmin,
    isSuperAdmin,
    tenantsLoading,
    tenantsCount: tenants.length,
    tenantsError: tenantsError ? String(tenantsError) : null,
  });

  // Debug: Log all state
  useEffect(() => {
    console.log('🔍 Admin Page State:', {
      checkingAdmin,
      isSuperAdmin,
      tenantsLoading,
      tenantsCount: tenants.length,
      tenantsError: tenantsError ? String(tenantsError) : null,
    });
    console.log('🔍 Admin: checkingAdmin type:', typeof checkingAdmin, 'value:', checkingAdmin);
    console.log('🔍 Admin: isSuperAdmin type:', typeof isSuperAdmin, 'value:', isSuperAdmin);
    console.log('🔍 Admin: Will show loading?', checkingAdmin === true || checkingAdmin === undefined);
    console.log('🔍 Admin: Will show error?', checkingAdmin === false && isSuperAdmin !== true);
    console.log('🔍 Admin: Will show main?', checkingAdmin === false && isSuperAdmin === true);
  }, [checkingAdmin, isSuperAdmin, tenantsLoading, tenants.length, tenantsError]);
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();
  const removeUser = useRemoveUser();
  const resetTenantData = useResetTenantData();
  const deleteTenant = useDeleteTenant();
  const impersonateMut = useAdminImpersonate();
  const updateSubscriptionMut = useUpdateAdminSubscription();
  const extendSubscriptionMut = useExtendAdminSubscription();
  const sendReminderMut = useSendAdminSubscriptionReminder();

  const enterAsUser = async (tenantId: string, userId: string) => {
    try {
      const data = await impersonateMut.mutateAsync({ tenant_id: tenantId, user_id: userId });
      const { error } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (error) {
        throw new Error(error.message);
      }
      localStorage.setItem('currentTenantId', data.tenant_id);
      window.location.assign('/products');
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : 'שגיאה';
      window.alert(msg);
    }
  };

  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [unblockDialogOpen, setUnblockDialogOpen] = useState(false);
  const [removeUserDialogOpen, setRemoveUserDialogOpen] = useState(false);
  const [resetDataDialogOpen, setResetDataDialogOpen] = useState(false);
  const [deleteTenantDialogOpen, setDeleteTenantDialogOpen] = useState(false);
  const [editSubscriptionDialogOpen, setEditSubscriptionDialogOpen] = useState(false);
  const [extendSubscriptionDialogOpen, setExtendSubscriptionDialogOpen] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<{
    tenantId: string;
    tenantName: string;
    planName: string;
    validUntil: string;
  } | null>(null);
  const [planDraft, setPlanDraft] = useState<(typeof SUBSCRIPTION_PLANS)[number]>('basic');
  const [validUntilDraft, setValidUntilDraft] = useState('');
  const [selectedMembership, setSelectedMembership] = useState<{
    id: string;
    userName: string;
    tenantName: string;
  } | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleBlock = async () => {
    if (!selectedMembership) return;
    try {
      await blockUser.mutateAsync(selectedMembership.id);
      setBlockDialogOpen(false);
      setSelectedMembership(null);
    } catch (error) {
      console.error('Error blocking user:', error);
    }
  };

  const handleUnblock = async () => {
    if (!selectedMembership) return;
    try {
      await unblockUser.mutateAsync(selectedMembership.id);
      setUnblockDialogOpen(false);
      setSelectedMembership(null);
    } catch (error) {
      console.error('Error unblocking user:', error);
    }
  };

  const handleRemoveUser = async () => {
    if (!selectedMembership) return;
    try {
      await removeUser.mutateAsync(selectedMembership.id);
      setRemoveUserDialogOpen(false);
      setSelectedMembership(null);
    } catch (error) {
      console.error('Error removing user:', error);
    }
  };

  const handleResetTenantData = async () => {
    if (!selectedTenant) return;
    try {
      await resetTenantData.mutateAsync(selectedTenant.id);
      setResetDataDialogOpen(false);
      setSelectedTenant(null);
    } catch (error) {
      console.error('Error resetting tenant data:', error);
    }
  };

  const handleDeleteTenant = async () => {
    if (!selectedTenant) return;
    try {
      await deleteTenant.mutateAsync(selectedTenant.id);
      setDeleteTenantDialogOpen(false);
      setSelectedTenant(null);
    } catch (error) {
      console.error('Error deleting tenant:', error);
    }
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      tenant_created: 'חנות נוצרה',
      user_joined: 'משתמש הצטרף',
      user_blocked: 'משתמש נחסם',
      user_unblocked: 'חסימה בוטלה',
      invite_sent: 'הזמנה נשלחה',
      admin_impersonate: 'כניסת מנהל מערכת לפרופיל משתמש',
    };
    return labels[action] || action;
  };
  const subscriptionByTenantId = new Map(subscriptions.map((sub) => [sub.tenant_id, sub]));

  const openEditSubscription = (sub: { tenant_id: string; tenants?: { name: string } | null; plan_name: string; valid_until: string }) => {
    setSelectedSubscription({
      tenantId: sub.tenant_id,
      tenantName: sub.tenants?.name || sub.tenant_id,
      planName: sub.plan_name,
      validUntil: sub.valid_until,
    });
    setPlanDraft((SUBSCRIPTION_PLANS.includes(sub.plan_name as any) ? sub.plan_name : 'basic') as (typeof SUBSCRIPTION_PLANS)[number]);
    setEditSubscriptionDialogOpen(true);
  };

  const openExtendSubscription = (sub: { tenant_id: string; tenants?: { name: string } | null; valid_until: string; }) => {
    setSelectedSubscription({
      tenantId: sub.tenant_id,
      tenantName: sub.tenants?.name || sub.tenant_id,
      planName: '',
      validUntil: sub.valid_until,
    });
    setValidUntilDraft(sub.valid_until);
    setExtendSubscriptionDialogOpen(true);
  };

  const handleSavePlan = async () => {
    if (!selectedSubscription) return;
    await updateSubscriptionMut.mutateAsync({
      tenantId: selectedSubscription.tenantId,
      patch: { plan_name: planDraft },
    });
    setEditSubscriptionDialogOpen(false);
    setSelectedSubscription(null);
  };

  const handleExtendByDate = async () => {
    if (!selectedSubscription || !validUntilDraft) return;
    await extendSubscriptionMut.mutateAsync({
      tenantId: selectedSubscription.tenantId,
      payload: { valid_until: validUntilDraft },
    });
    setExtendSubscriptionDialogOpen(false);
    setSelectedSubscription(null);
  };

  const getSubscriptionBadgeVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (status === 'active' || status === 'trial') return 'default';
    if (status === 'past_due') return 'secondary';
    if (status === 'expired' || status === 'cancelled') return 'destructive';
    return 'outline';
  };

  const getSubscriptionStatusLabel = (status: string): string => {
    const map: Record<string, string> = {
      trial: 'ניסיון',
      active: 'פעיל',
      past_due: 'באיחור',
      expired: 'פג תוקף',
      cancelled: 'בוטל',
    };
    return map[status] || status;
  };

  // Show loading while checking admin status
  console.log('🔍 Admin: Checking conditions...', {
    checkingAdmin,
    isSuperAdmin,
    'checkingAdmin === true': checkingAdmin === true,
    'checkingAdmin === undefined': checkingAdmin === undefined,
    'checkingAdmin === false': checkingAdmin === false,
    'isSuperAdmin !== true': isSuperAdmin !== true,
    'isSuperAdmin === true': isSuperAdmin === true,
  });
  
  if (checkingAdmin === true || checkingAdmin === undefined) {
    console.log('🔍 Admin: Showing loading state');
    return (
      <div className="w-full max-w-3xl mx-auto">
        <Card className="shadow-md border-2">
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">בודק הרשאות...</p>
            <p className="text-xs text-muted-foreground mt-2">checkingAdmin: {String(checkingAdmin)}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show error if not super admin (only after loading is done)
  if (checkingAdmin === false && isSuperAdmin !== true) {
    console.log('🔍 Admin: Not super admin, showing error');
    return (
      <div className="w-full max-w-3xl mx-auto">
        <Card className="shadow-md border-2">
          <CardContent className="py-16 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
            <p className="text-lg font-bold text-foreground mb-2">אין לך הרשאות</p>
            <p className="text-sm text-muted-foreground">דף זה זמין למנהל המערכת בלבד</p>
            <p className="text-xs text-muted-foreground mt-2">
              Debug: isSuperAdmin = {String(isSuperAdmin)}, checkingAdmin = {String(checkingAdmin)}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main content - only show if super admin
  console.log('🔍 Admin: Before main content check', { checkingAdmin, isSuperAdmin, typeChecking: typeof checkingAdmin, typeSuper: typeof isSuperAdmin });
  
  // If we reach here, we should be super admin
  if (checkingAdmin === false && isSuperAdmin === true) {
    console.log('🔍 Admin: Rendering main content');
    return (
      <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">ניהול משתמשים</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1.5">
          צפה בכל החנויות, המשתמשים והפעילות • ניהול חסימות
        </p>
        <div className="mt-3">
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/support">Inbox תמיכה</Link>
          </Button>
        </div>
      </div>

      {/* Tenants & Users Overview */}
      <Card className="shadow-md border-2">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <Store className="w-4 h-4 sm:w-5 sm:h-5" />
            חנויות ומשתמשים
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {tenantsLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">טוען נתונים...</div>
          ) : tenants.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">לא נמצאו חנויות</div>
          ) : (
            <div className="space-y-4 sm:space-y-6">
              {tenants.map((tenant) => (
                <div key={tenant.id} className="border-2 border-border rounded-lg p-3 sm:p-4 space-y-3 sm:space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base sm:text-lg font-bold break-words">{tenant.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1 break-words">
                        נוצר ב-{formatDate(tenant.created_at)} • {tenant.total_users} משתמשים
                        {tenant.blocked_users > 0 && (
                          <span className="text-destructive"> • {tenant.blocked_users} חסומים</span>
                        )}
                      </p>
                      {tenant.statistics && (
                        <div className="mt-2 flex flex-wrap gap-2 sm:gap-3 text-xs">
                          <span className="text-muted-foreground whitespace-nowrap">
                            📦 {tenant.statistics.products} מוצרים
                          </span>
                          <span className="text-muted-foreground whitespace-nowrap">
                            🏢 {tenant.statistics.suppliers} ספקים
                          </span>
                          <span className="text-muted-foreground whitespace-nowrap">
                            📁 {tenant.statistics.categories} קטגוריות
                          </span>
                          <span className="text-muted-foreground whitespace-nowrap">
                            💰 {tenant.statistics.price_entries} מחירים
                          </span>
                          <span className="text-muted-foreground whitespace-nowrap">
                            💾 ~{tenant.statistics.estimated_size_kb} KB
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 flex-shrink-0 justify-end">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!pickStoreEntryUserId(tenant) || impersonateMut.isPending}
                        onClick={() => {
                          const uid = pickStoreEntryUserId(tenant);
                          if (uid) void enterAsUser(tenant.id, uid);
                        }}
                        className="text-xs sm:text-sm"
                      >
                        <LogIn className="w-3 h-3 sm:w-4 sm:h-4 ml-1" />
                        <span className="hidden sm:inline">כניסה לחנות</span>
                        <span className="sm:hidden">חנות</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedTenant({ id: tenant.id, name: tenant.name });
                          setResetDataDialogOpen(true);
                        }}
                        className="text-orange-600 hover:text-orange-700 text-xs sm:text-sm"
                      >
                        <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4 ml-1" />
                        <span className="hidden sm:inline">מחק נתונים</span>
                        <span className="sm:hidden">נתונים</span>
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setSelectedTenant({ id: tenant.id, name: tenant.name });
                          setDeleteTenantDialogOpen(true);
                        }}
                        className="text-xs sm:text-sm"
                      >
                        <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 ml-1" />
                        <span className="hidden sm:inline">מחק חנות</span>
                        <span className="sm:hidden">מחק</span>
                      </Button>
                    </div>
                  </div>

                  {/* Owners */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      בעלים ({tenant.owners.length})
                    </h4>
                    {tenant.owners.length > 0 ? (
                      <div className="space-y-2">
                        {tenant.owners.map((owner) => (
                          <div
                            key={owner.membership_id}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 bg-muted rounded-lg"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium break-words">{owner.full_name}</span>
                                <Badge variant="default" className="flex-shrink-0">בעלים</Badge>
                              </div>
                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1 text-xs text-muted-foreground">
                                <span className="break-all">{owner.email}</span>
                                <span className="hidden sm:inline">•</span>
                                <span>הצטרף ב-{formatDate(owner.joined_at)}</span>
                              </div>
                              <AdminMemberDetail
                                member={owner}
                                tenantName={tenant.name}
                                subscription={subscriptionByTenantId.get(tenant.id)}
                                formatDate={formatDate}
                              />
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={owner.is_blocked || impersonateMut.isPending}
                              onClick={() => void enterAsUser(tenant.id, owner.user_id)}
                              className="text-xs sm:text-sm flex-shrink-0"
                            >
                              <LogIn className="w-3 h-3 sm:w-4 sm:h-4 ml-1" />
                              כניסה לפרופיל
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground p-2">אין בעלים רשומים</p>
                    )}
                  </div>

                  {/* Workers */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      עובדים ({tenant.workers.length})
                    </h4>
                    {tenant.workers.length > 0 ? (
                      <div className="space-y-2">
                        {tenant.workers.map((worker) => (
                          <div
                            key={worker.membership_id}
                            className="flex flex-col gap-2 p-2 bg-muted rounded-lg"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium break-words">{worker.full_name}</span>
                                {worker.is_blocked && (
                                  <Badge variant="destructive" className="flex-shrink-0">
                                    חסום
                                  </Badge>
                                )}
                              </div>
                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1 text-xs text-muted-foreground">
                                <span className="break-all">{worker.email}</span>
                                <span className="hidden sm:inline">•</span>
                                <span>הצטרף ב-{formatDate(worker.joined_at)}</span>
                              </div>
                              <AdminMemberDetail
                                member={worker}
                                tenantName={tenant.name}
                                subscription={subscriptionByTenantId.get(tenant.id)}
                                formatDate={formatDate}
                              />
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={worker.is_blocked || impersonateMut.isPending}
                                onClick={() => void enterAsUser(tenant.id, worker.user_id)}
                                className="text-xs sm:text-sm flex-1 sm:flex-initial"
                              >
                                <LogIn className="w-3 h-3 sm:w-4 sm:h-4 ml-1" />
                                <span className="hidden sm:inline">כניסה לפרופיל</span>
                                <span className="sm:hidden">פרופיל</span>
                              </Button>
                              {worker.is_blocked ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedMembership({
                                      id: worker.membership_id,
                                      userName: worker.full_name,
                                      tenantName: tenant.name,
                                    });
                                    setUnblockDialogOpen(true);
                                  }}
                                  className="text-xs sm:text-sm flex-1 sm:flex-initial"
                                >
                                  <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 ml-1" />
                                  <span className="hidden sm:inline">בטל חסימה</span>
                                  <span className="sm:hidden">בטל</span>
                                </Button>
                              ) : (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedMembership({
                                      id: worker.membership_id,
                                      userName: worker.full_name,
                                      tenantName: tenant.name,
                                    });
                                    setBlockDialogOpen(true);
                                  }}
                                  className="text-xs sm:text-sm flex-1 sm:flex-initial"
                                >
                                  <Ban className="w-3 h-3 sm:w-4 sm:h-4 ml-1" />
                                  חסום
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedMembership({
                                    id: worker.membership_id,
                                    userName: worker.full_name,
                                    tenantName: tenant.name,
                                  });
                                  setRemoveUserDialogOpen(true);
                                }}
                                className="text-destructive hover:text-destructive text-xs sm:text-sm flex-1 sm:flex-initial"
                              >
                                <X className="w-3 h-3 sm:w-4 sm:h-4 ml-1" />
                                <span className="hidden sm:inline">הסר</span>
                                <span className="sm:hidden">הסר</span>
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground p-2">אין עובדים רשומים</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-md border-2">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl font-bold">מנויים וחיובים</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {subscriptionsLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">טוען מנויים...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>שם חנות</TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead>תוכנית</TableHead>
                    <TableHead>סכום ששולם</TableHead>
                    <TableHead>תקף מ־</TableHead>
                    <TableHead>תקף עד</TableHead>
                    <TableHead>ימים נותרו</TableHead>
                    <TableHead>תזכורת אחרונה</TableHead>
                    <TableHead>פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions.map((sub) => (
                    <TableRow key={sub.tenant_id}>
                      <TableCell>{sub.tenants?.name || sub.tenant_id}</TableCell>
                      <TableCell><Badge variant={getSubscriptionBadgeVariant(sub.computed_status)}>{getSubscriptionStatusLabel(sub.computed_status)}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className="font-semibold">{sub.plan_name}</Badge></TableCell>
                      <TableCell>{sub.paid_amount != null ? `${sub.paid_amount} ${sub.currency}` : '-'}</TableCell>
                      <TableCell>{new Date(sub.valid_from).toLocaleDateString('he-IL')}</TableCell>
                      <TableCell>
                        <span className="font-semibold">{new Date(sub.valid_until).toLocaleDateString('he-IL')}</span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            sub.computed_status === 'expired' || sub.computed_status === 'cancelled'
                              ? 'destructive'
                              : sub.isExpiringSoon
                              ? 'secondary'
                              : 'default'
                          }
                        >
                          {sub.daysRemaining}
                        </Badge>
                      </TableCell>
                      <TableCell>{sub.last_reminder_sent_at ? formatDate(sub.last_reminder_sent_at) : '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={async () => {
                            openEditSubscription(sub);
                          }}>עריכה</Button>
                          <Button size="sm" variant="outline" onClick={async () => {
                            openExtendSubscription(sub);
                          }}>הארכה</Button>
                          <Button size="sm" onClick={async () => {
                            await sendReminderMut.mutateAsync(sub.tenant_id);
                          }}>שלח תזכורת</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Logs */}
      <Card className="shadow-md border-2">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
            יומן פעילות
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {logsLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">טוען לוגים...</div>
          ) : auditLogs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">אין פעילות להצגה</div>
          ) : (
            <div className="overflow-x-auto -mx-3 sm:mx-0">
              <div className="min-w-full inline-block align-middle">
                <div className="overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs sm:text-sm">תאריך</TableHead>
                        <TableHead className="text-xs sm:text-sm">פעולה</TableHead>
                        <TableHead className="text-xs sm:text-sm hidden sm:table-cell">משתמש</TableHead>
                        <TableHead className="text-xs sm:text-sm hidden md:table-cell">פרטים</TableHead>
                        <TableHead className="text-xs sm:hidden">פרטים</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs sm:text-sm whitespace-nowrap">
                            {formatDate(log.created_at)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{getActionLabel(log.action)}</Badge>
                          </TableCell>
                          {/* Desktop: separate columns */}
                          <TableCell className="text-xs sm:text-sm hidden sm:table-cell">
                            {log.profiles?.full_name || 'לא ידוע'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground hidden md:table-cell max-w-xs truncate">
                            {log.details && typeof log.details === 'object'
                              ? JSON.stringify(log.details, null, 0).slice(0, 100)
                              : String(log.details || '-')}
                          </TableCell>
                          {/* Mobile: combined column */}
                          <TableCell className="text-xs sm:hidden">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">{log.profiles?.full_name || 'לא ידוע'}</span>
                              <span className="text-muted-foreground truncate max-w-[200px]">
                                {log.details && typeof log.details === 'object'
                                  ? JSON.stringify(log.details, null, 0).slice(0, 50) + '...'
                                  : String(log.details || '-').slice(0, 50)}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Block User Dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>חסימת משתמש</DialogTitle>
          </DialogHeader>
          <p>
            האם אתה בטוח שברצונך לחסום את המשתמש <strong>{selectedMembership?.userName}</strong> בחנות{' '}
            <strong>{selectedMembership?.tenantName}</strong>?
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            משתמש חסום לא יוכל לגשת לחנות זו עד שתבטל את החסימה.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>
              ביטול
            </Button>
            <Button variant="destructive" onClick={handleBlock} disabled={blockUser.isPending}>
              {blockUser.isPending ? 'חוסם...' : 'חסום'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unblock User Dialog */}
      <Dialog open={unblockDialogOpen} onOpenChange={setUnblockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ביטול חסימת משתמש</DialogTitle>
          </DialogHeader>
          <p>
            האם אתה בטוח שברצונך לבטל את החסימה של <strong>{selectedMembership?.userName}</strong> בחנות{' '}
            <strong>{selectedMembership?.tenantName}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnblockDialogOpen(false)}>
              ביטול
            </Button>
            <Button onClick={handleUnblock} disabled={unblockUser.isPending}>
              {unblockUser.isPending ? 'מבטל...' : 'בטל חסימה'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove User Dialog */}
      <Dialog open={removeUserDialogOpen} onOpenChange={setRemoveUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הסרת משתמש</DialogTitle>
          </DialogHeader>
          <p>
            האם אתה בטוח שברצונך להסיר את המשתמש <strong>{selectedMembership?.userName}</strong> מהחנות{' '}
            <strong>{selectedMembership?.tenantName}</strong>?
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            המשתמש יאבד את הגישה לחנות זו, אך החשבון שלו יישאר במערכת.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveUserDialogOpen(false)}>
              ביטול
            </Button>
            <Button variant="destructive" onClick={handleRemoveUser} disabled={removeUser.isPending}>
              {removeUser.isPending ? 'מסיר...' : 'הסר'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Tenant Data Dialog */}
      <Dialog open={resetDataDialogOpen} onOpenChange={setResetDataDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת נתוני חנות</DialogTitle>
          </DialogHeader>
          <p>
            האם אתה בטוח שברצונך למחוק את כל הנתונים של החנות <strong>{selectedTenant?.name}</strong>?
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            פעולה זו תמחק את כל המוצרים, הספקים, הקטגוריות והמחירים. החנות והמשתמשים יישארו.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDataDialogOpen(false)}>
              ביטול
            </Button>
            <Button variant="destructive" onClick={handleResetTenantData} disabled={resetTenantData.isPending}>
              {resetTenantData.isPending ? 'מוחק...' : 'מחק נתונים'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Tenant Dialog */}
      <Dialog open={deleteTenantDialogOpen} onOpenChange={setDeleteTenantDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת חנות</DialogTitle>
          </DialogHeader>
          <p>
            האם אתה בטוח שברצונך למחוק את החנות <strong>{selectedTenant?.name}</strong> לחלוטין?
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            פעולה זו תמחק את החנות, כל הנתונים, כל המשתמשים והחברויות. פעולה זו לא ניתנת לביטול!
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTenantDialogOpen(false)}>
              ביטול
            </Button>
            <Button variant="destructive" onClick={handleDeleteTenant} disabled={deleteTenant.isPending}>
              {deleteTenant.isPending ? 'מוחק...' : 'מחק חנות'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editSubscriptionDialogOpen} onOpenChange={setEditSubscriptionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>עריכת תוכנית מנוי</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              לקוח: <strong>{selectedSubscription?.tenantName}</strong>
            </p>
            <label className="text-sm font-medium">שם תוכנית</label>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={planDraft}
              onChange={(e) => setPlanDraft(e.target.value as (typeof SUBSCRIPTION_PLANS)[number])}
            >
              {SUBSCRIPTION_PLANS.map((plan) => (
                <option key={plan} value={plan}>{plan}</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSubscriptionDialogOpen(false)}>ביטול</Button>
            <Button onClick={handleSavePlan} disabled={updateSubscriptionMut.isPending}>
              {updateSubscriptionMut.isPending ? 'שומר...' : 'שמירה'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={extendSubscriptionDialogOpen} onOpenChange={setExtendSubscriptionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הארכת מנוי לפי תאריך</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              לקוח: <strong>{selectedSubscription?.tenantName}</strong>
            </p>
            <label className="text-sm font-medium">תאריך סיום חדש</label>
            <input
              type="date"
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={validUntilDraft}
              onChange={(e) => setValidUntilDraft(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendSubscriptionDialogOpen(false)}>ביטול</Button>
            <Button onClick={handleExtendByDate} disabled={extendSubscriptionMut.isPending || !validUntilDraft}>
              {extendSubscriptionMut.isPending ? 'מעדכן...' : 'עדכון תוקף'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    );
  }

  // Ultimate fallback - should never reach here
  console.error('🔍 Admin: Unexpected state - reached fallback!', { checkingAdmin, isSuperAdmin });
  return (
    <div className="w-full max-w-3xl mx-auto">
      <Card className="shadow-md border-2">
        <CardContent className="py-16 text-center">
          <p className="text-sm text-muted-foreground">שגיאה בטעינת הדף</p>
          <p className="text-xs text-muted-foreground mt-2">
            checkingAdmin: {String(checkingAdmin)}, isSuperAdmin: {String(isSuperAdmin)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
