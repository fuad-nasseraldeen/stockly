import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Eye, EyeOff, Send, Users, Loader2 } from 'lucide-react';
import { useTenant } from '../hooks/useTenant';
import { tenantsApi, tenantApi, type TenantMember, type TenantInvite } from '../lib/api';

export default function Settings() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();

  const [vat, setVat] = useState<string>(() =>
    settings?.vat_percent != null ? String(settings.vat_percent) : '18'
  );
  const [margin, setMargin] = useState<string>(() =>
    settings?.global_margin_percent != null ? String(settings.global_margin_percent) : '30'
  );
  const [useMargin, setUseMargin] = useState<boolean>(() =>
    settings?.use_margin !== false // Default to true if not set
  );
  const [useVat, setUseVat] = useState<boolean>(() =>
    settings?.use_vat !== false // Default to true if not set
  );

  const [userEmail, setUserEmail] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'owner' | 'worker'>('worker');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const removeMember = useMutation({
    mutationFn: (userId: string) => tenantApi.removeMember(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenantMembers'] });
    },
  });

  const deleteInvite = useMutation({
    mutationFn: (id: string) => tenantApi.deleteInvite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenantInvites'] });
    },
  });

  useEffect(() => {
    if (settings) {
      setUseMargin(settings.use_margin !== false);
      setUseVat(settings.use_vat !== false);
    }
  }, [settings]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setUserEmail(user.email);
      }
      const metaFullName =
        (user?.user_metadata as any)?.full_name ?? '';
      if (metaFullName && typeof metaFullName === 'string') {
        setFullName(metaFullName);
      }
    });
  }, []);

  const [savingVat, setSavingVat] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const isOwner = currentTenant?.role === 'owner';

  // Team management (members + invites)
  const {
    data: members = [],
    isLoading: membersLoading,
  } = useQuery<TenantMember[]>({
    queryKey: ['tenantMembers', currentTenant?.id],
    queryFn: () => tenantApi.members(),
    enabled: !!currentTenant && currentTenant.role === 'owner',
  });
  console.log('🔍 Settings - Members query:', {
    currentTenant,
    enabled: !!currentTenant && currentTenant?.role === 'owner',
    members,
    membersLoading,
  });
  const {
    data: invites = [],
    isLoading: invitesLoading,
  } = useQuery<TenantInvite[]>({
    queryKey: ['tenantInvites', currentTenant?.id],
    queryFn: () => tenantApi.invites(),
    enabled: !!currentTenant && currentTenant.role === 'owner',
  });

  const handleSaveVat = async (): Promise<void> => {
    const vatValue = vat.trim() ? Number(vat) : NaN;
    if (Number.isNaN(vatValue) || vatValue < 0 || vatValue > 100) {
      setProfileMessage('מע״מ חייב להיות בין 0 ל‑100');
      return;
    }
    try {
      setSavingVat(true);
      setProfileMessage(null);
      const marginValue = margin.trim() ? Number(margin) : NaN;
      const payload: { vat_percent: number; global_margin_percent?: number; use_margin?: boolean; use_vat?: boolean } = {
        vat_percent: vatValue,
      };
      if (!Number.isNaN(marginValue)) {
        payload.global_margin_percent = marginValue;
      }
      payload.use_margin = useMargin;
      payload.use_vat = useVat;
      await updateSettings.mutateAsync(payload);
    } catch (error) {
      console.error('Error updating settings:', error);
      setProfileMessage('שגיאה בעדכון הגדרות מס/רווח');
    } finally {
      setSavingVat(false);
    }
  };

  const handleUpdateProfile = async (): Promise<void> => {
    try {
      setProfileMessage(null);
      const updates: { password?: string; data?: { full_name?: string } } = {};

      if (password.trim()) {
        updates.password = password.trim();
      }
      if (fullName.trim()) {
        updates.data = { full_name: fullName.trim() };
      }

      if (!updates.password && !updates.data) {
        setProfileMessage('אין מה לעדכן');
        return;
      }

      const { error } = await supabase.auth.updateUser(updates);
      if (error) {
        setProfileMessage(error.message);
        return;
      }

      setProfileMessage('הפרופיל עודכן בהצלחה');
      setPassword('');
      // לא מאפסים fullName כדי שיראה מה מילא
    } catch (error) {
      console.error('Error updating profile:', error);
      setProfileMessage('שגיאה בעדכון פרופיל');
    }
  };

  const handleSendInvite = async (): Promise<void> => {
    if (!currentTenant) {
      setInviteError('אין טננט פעיל');
      return;
    }

    const email = inviteEmail.trim();
    if (!email) {
      setInviteError('נא להזין כתובת אימייל');
      return;
    }

    try {
      setInviteLoading(true);
      setInviteError(null);
      setInviteMessage(null);
      setInviteUrl(null);

      const result = await tenantsApi.invite(currentTenant.id, {
        email,
        role: inviteRole,
      });

      setInviteMessage('ההזמנה נוצרה בהצלחה. שלח את הקישור או ודא שהמוזמן מתחבר עם האימייל הזה.');
      if ((result as any)?.inviteUrl) {
        setInviteUrl((result as any).inviteUrl);
      }
      setInviteEmail('');
    } catch (error: any) {
      console.error('Error sending invite:', error);
      setInviteError(error?.message || 'שגיאה ביצירת הזמנה');
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">הגדרות</h1>
        <p className="text-sm text-muted-foreground mt-1.5">שליטה בהגדרות מערכת ופרופיל משתמש</p>
      </div>

      {/* VAT & Margin settings */}
      <Card className="shadow-md border-2">
        <CardHeader>
          <CardTitle className="text-lg font-bold">הגדרות מחירים</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vatPercent">מע&quot;מ (%)</Label>
              <Input
                id="vatPercent"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={vat}
                onChange={(e) => setVat(e.target.value)}
                placeholder={settings?.vat_percent != null ? String(settings.vat_percent) : '18'}
              />
              <p className="text-xs text-muted-foreground">
                ערך זה ישמש כברירת מחדל לחישוב מחיר מכירה בכל המערכת.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="globalMargin">אחוז רווח גלובלי (אופציונלי)</Label>
              <Input
                id="globalMargin"
                type="number"
                min="0"
                max="500"
                step="0.1"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
                placeholder="לדוגמה: 30"
              />
              <p className="text-xs text-muted-foreground">
                ערך זה יכול לשמש כברירת מחדל כשאין קטגוריה עם רווח מוגדר (כרגע לשימוש תצוגתי בלבד).
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="useMargin"
                  checked={useMargin}
                  onChange={(e) => setUseMargin(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="useMargin" className="cursor-pointer">
                  חשב מחיר מכירה עם רווח
                </Label>
              </div>
              <p className="text-xs text-muted-foreground pr-6">
                {useMargin 
                  ? 'מחיר מכירה יכלול רווח'
                  : 'מחיר מכירה ללא רווח (רק עלות + מע"מ אם מופעל)'}
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="useVat"
                  checked={useVat}
                  onChange={(e) => setUseVat(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="useVat" className="cursor-pointer">
                  חשב מחיר מכירה עם מע&quot;מ
                </Label>
              </div>
              <p className="text-xs text-muted-foreground pr-6">
                {useVat 
                  ? 'מחיר מכירה יכלול מע"מ'
                  : 'מחיר מכירה ללא מע"מ (רק עלות + רווח אם מופעל)'}
              </p>
            </div>
            <div className="p-3 bg-muted rounded-lg border-2 border-border">
              <p className="text-xs font-medium mb-1">סיכום החישוב:</p>
              <p className="text-xs text-muted-foreground">
                {!useMargin && !useVat 
                  ? 'מחיר מכירה = עלות בלבד'
                  : !useMargin && useVat
                  ? 'מחיר מכירה = עלות + מע"מ'
                  : useMargin && !useVat
                  ? 'מחיר מכירה = עלות + רווח'
                  : 'מחיר מכירה = עלות + רווח + מע"מ'}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Button onClick={handleSaveVat} disabled={savingVat || isLoading}>
              {savingVat ? 'מחשב ומעדכן מחירים...' : 'שמור הגדרות מחירים'}
            </Button>
            {savingVat && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                <span>מחשב מחירי מכירה לכל המוצרים והספקים. זה יכול לקחת כמה רגעים.</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invite team members (owners only) */}
      {isOwner && (
        <>
          <Card className="shadow-md border-2">
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Users className="w-4 h-4" />
                הזמנת משתמשים לחנות
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                הזמן עובדים או שותפים לחנות הנוכחית באמצעות כתובת אימייל. המוזמן יצטרך להתחבר עם אותו אימייל כדי לקבל גישה.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="inviteEmail">אימייל של המוזמן</Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="name@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inviteRole">תפקיד</Label>
                  <select
                    id="inviteRole"
                    className="border-input bg-background px-3 py-2 rounded-md text-sm"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'owner' | 'worker')}
                  >
                    <option value="worker">עובד</option>
                    <option value="owner">בעלים נוסף</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleSendInvite}
                  disabled={inviteLoading}
                  className="w-full sm:w-auto gap-2"
                >
                  {inviteLoading ? (
                    'שולח הזמנה...'
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      שלח הזמנה
                    </>
                  )}
                </Button>
                {inviteMessage && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">{inviteMessage}</p>
                )}
                {inviteError && (
                  <p className="text-xs text-destructive">{inviteError}</p>
                )}
                {inviteUrl && (
                  <div className="mt-2 p-3 bg-muted rounded-lg border-2 border-border text-xs break-all">
                    <p className="font-medium mb-1">קישור הזמנה:</p>
                    <p>{inviteUrl}</p>
                    <p className="mt-1 text-muted-foreground">
                      שלח קישור זה למוזמן, או שהוא יכול פשוט להתחבר עם האימייל שהזנת – המערכת תזהה את ההזמנה אוטומטית.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Members & invites list */}
          <Card className="shadow-md border-2">
            <CardHeader>
              <CardTitle className="text-lg font-bold">צוות החנות</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Members */}
              <div>
                <h3 className="text-sm font-semibold mb-2">משתמשים קיימים</h3>
                {membersLoading ? (
                  <p className="text-xs text-muted-foreground">טוען משתמשים...</p>
                ) : members.length === 0 ? (
                  <p className="text-xs text-muted-foreground">אין עדיין משתמשים נוספים בחנות.</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    {members.map((m) => (
                      <div
                        key={m.user_id}
                        className="flex items-center justify-between border rounded-md px-3 py-2"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{m.full_name || 'משתמש'}</span>
                          <span className="text-xs text-muted-foreground">
                            {m.role === 'owner' ? 'בעלים' : 'עובד'}
                            {m.is_primary_owner ? ' • בעל חנות ראשי' : ''}
                          </span>
                        </div>
                        {!m.is_primary_owner && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            disabled={removeMember.isPending}
                            onClick={() => removeMember.mutate(m.user_id)}
                          >
                            הסר גישה
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pending invites */}
              <div>
                <h3 className="text-sm font-semibold mb-2">הזמנות ממתינות</h3>
                {invitesLoading ? (
                  <p className="text-xs text-muted-foreground">טוען הזמנות...</p>
                ) : invites.length === 0 ? (
                  <p className="text-xs text-muted-foreground">אין הזמנות ממתינות.</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    {invites.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between border rounded-md px-3 py-2"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium break-all">{inv.email}</span>
                          <span className="text-xs text-muted-foreground">
                            {inv.role === 'owner' ? 'בעלים (הזמנה)' : 'עובד (הזמנה)'}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          disabled={deleteInvite.isPending}
                          onClick={() => deleteInvite.mutate(inv.id)}
                        >
                          בטל הזמנה
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Profile settings */}
      <Card className="shadow-md border-2">
        <CardHeader>
          <CardTitle className="text-lg font-bold">הגדרות פרופיל</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="userEmail">אימייל</Label>
              <Input
                id="userEmail"
                value={userEmail}
                disabled
                className="bg-muted cursor-not-allowed"
                placeholder="טוען..."
              />
              <p className="text-xs text-muted-foreground">אימייל לא ניתן לשינוי</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName">שם משתמש</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={fullName ? fullName : 'שם משתמש (אופציונלי)'}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">סיסמה חדשה</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="סיסמה חדשה (אופציונלי)"
                className="pr-10"
              />
              <button
                type="button"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button onClick={handleUpdateProfile}>
            עדכן פרופיל
          </Button>
          {profileMessage && (
            <p className="text-xs mt-2 text-muted-foreground">{profileMessage}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

