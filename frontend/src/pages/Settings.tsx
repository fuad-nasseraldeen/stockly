import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Eye, EyeOff, Send, Users, Loader2, HelpCircle, ChevronUp, ChevronDown } from 'lucide-react';
import { useTenant } from '../hooks/useTenant';
import { accountApi, authApi, tenantsApi, tenantApi, settingsApi, setTenantIdForApi, type TenantMember, type TenantInvite } from '../lib/api';
import { getAvailableColumns, type Settings as SettingsType } from '../lib/column-resolver';
import { useTableLayout } from '../hooks/useTableLayout';
import { getTableLayoutProductsKey } from '../lib/table-layout-keys';
import { FieldLayoutEditor } from '../components/FieldLayoutEditor/FieldLayoutEditor';
import type { FieldOption, PinnedFieldIds } from '../components/FieldLayoutEditor/fieldLayoutTypes';
import { emptyPinnedFieldIds, normalizePinnedFieldIds, parsePinnedFieldIdsFromSavedLayout } from '../components/FieldLayoutEditor/fieldLayoutUtils';
import { useHelpCenter } from '../contexts/HelpCenterContext';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext';

export default function Settings() {
  const { openHelp, showWelcome, supportButtonHidden, showSupportButton } = useHelpCenter();
  const navigate = useNavigate();
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();

  const [vat, setVat] = useState<string>(() =>
    settings?.vat_percent != null ? String(settings.vat_percent) : '18'
  );
  const [margin, setMargin] = useState<string>(() =>
    settings?.global_margin_percent != null ? String(settings.global_margin_percent) : '0'
  );
  const [useVat, setUseVat] = useState<boolean>(() => settings?.use_vat === true);
  const [decimalPrecision, setDecimalPrecision] = useState<string>(() =>
    settings?.decimal_precision != null ? String(settings.decimal_precision) : '2'
  );

  const [userEmail, setUserEmail] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteTargetType, setInviteTargetType] = useState<'email' | 'phone'>('email');
  const [inviteRole, setInviteRole] = useState<'owner' | 'worker'>('worker');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [profilePhoneE164, setProfilePhoneE164] = useState<string | null>(null);
  const [phoneStatusLoading, setPhoneStatusLoading] = useState(false);
  const [profilePhoneStep, setProfilePhoneStep] = useState<'idle' | 'phone' | 'code'>('idle');
  const [profilePhoneInput, setProfilePhoneInput] = useState('');
  const [profilePhoneCode, setProfilePhoneCode] = useState('');
  const [profilePhoneLoading, setProfilePhoneLoading] = useState(false);
  const [profilePhoneError, setProfilePhoneError] = useState<string | null>(null);
  const [profilePhoneMessage, setProfilePhoneMessage] = useState<string | null>(null);
  const [profilePhoneResendIn, setProfilePhoneResendIn] = useState(0);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirmationText, setResetConfirmationText] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleteReason, setDeleteReason] = useState<
    'not_satisfied' | 'too_expensive' | 'stopped_working_with_suppliers' | 'moved_to_other_system' | 'missing_features' | 'other'
  >('not_satisfied');
  const [deleteMessage, setDeleteMessage] = useState('');
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [dangerActionMessage, setDangerActionMessage] = useState<string | null>(null);

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

  useEffect(() => {
    if (!settings) return;
    setVat(settings.vat_percent != null ? String(settings.vat_percent) : '18');
    setMargin(settings.global_margin_percent != null ? String(settings.global_margin_percent) : '0');
    setUseVat(settings.use_vat === true);
    setDecimalPrecision(settings.decimal_precision != null ? String(settings.decimal_precision) : '2');
  }, [settings]);

  useEffect(() => {
    if (profilePhoneResendIn <= 0) return;
    const timer = window.setInterval(() => {
      setProfilePhoneResendIn((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [profilePhoneResendIn]);

  const [savingVat, setSavingVat] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcMessage, setRecalcMessage] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [savingFieldLayout, setSavingFieldLayout] = useState(false);
  const [explainPopup, setExplainPopup] = useState<'margin' | 'decimal' | null>(null);

  const isMarginInvalid = useMemo(() => {
    if (!margin.trim()) return false;
    const n = Number(margin);
    return Number.isNaN(n) || n < 0 || n > 100;
  }, [margin]);
  const isDecimalInvalid = useMemo(() => {
    if (!decimalPrecision.trim()) return false;
    const n = Number(decimalPrecision);
    return Number.isNaN(n) || n < 0 || n > 5;
  }, [decimalPrecision]);

  const hasUnsavedPriceChanges = useMemo(() => {
    if (!settings) return false;
    const savedVat = settings.vat_percent != null ? String(settings.vat_percent) : '18';
    const savedMargin = settings.global_margin_percent != null ? String(settings.global_margin_percent) : '0';
    const savedUseVat = settings.use_vat === true;
    const savedPrecision = settings.decimal_precision != null ? String(settings.decimal_precision) : '2';
    return vat !== savedVat || margin !== savedMargin || useVat !== savedUseVat || decimalPrecision !== savedPrecision;
  }, [settings, vat, margin, useVat, decimalPrecision]);

  const { setHasUnsavedChanges, setSaveCallback } = useUnsavedChanges();
  const handleSaveVatRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  useEffect(() => {
    setHasUnsavedChanges(hasUnsavedPriceChanges);
    return () => setHasUnsavedChanges(false);
  }, [hasUnsavedPriceChanges, setHasUnsavedChanges]);
  useEffect(() => {
    setSaveCallback(() => handleSaveVatRef.current());
    return () => setSaveCallback(null);
  }, [setSaveCallback]);

  useEffect(() => {
    if (!hasUnsavedPriceChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedPriceChanges]);
  
  // Column layout management - global for all products
  const appSettings: SettingsType = useMemo(() => ({
    use_vat: useVat,
    use_margin: Number(margin) > 0,
    vat_percent: settings?.vat_percent ?? undefined,
    global_margin_percent: settings?.global_margin_percent ?? undefined,
    decimal_precision: settings?.decimal_precision ?? null,
  }), [useVat, margin, settings?.vat_percent, settings?.global_margin_percent, settings?.decimal_precision]);
  
  const { data: savedLayout, isLoading: layoutLoading } = useTableLayout('productsTable');
  const availableColumns = useMemo(
    () => getAvailableColumns(appSettings).filter((col) => col.id !== 'actions'),
    [appSettings]
  );
  const allFields: FieldOption[] = useMemo(
    () => availableColumns.map((col) => ({ id: col.id, label: col.headerLabel })),
    [availableColumns]
  );
  const defaultPinned = useMemo(
    () => normalizePinnedFieldIds(
      allFields.slice(0, 3).map((field) => field.id),
      allFields
    ),
    [allFields]
  );
  const [pinnedFieldIds, setPinnedFieldIds] = useState<PinnedFieldIds>(emptyPinnedFieldIds());

  useEffect(() => {
    if (savedLayout === undefined) return;
    const parsed = parsePinnedFieldIdsFromSavedLayout(savedLayout as unknown, allFields);
    const hasAnyPinned = parsed.some((id) => !!id);
    setPinnedFieldIds(hasAnyPinned ? parsed : defaultPinned);
  }, [savedLayout, allFields, defaultPinned]);

  const isOwner = currentTenant?.role === 'owner';

  // Team management (members + invites)
  // Only fetch when currentTenant is valid AND user is owner to prevent 403 errors
  const {
    data: members = [],
    isLoading: membersLoading,
  } = useQuery<TenantMember[]>({
    queryKey: ['tenantMembers', currentTenant?.id],
    queryFn: () => tenantApi.members(),
    enabled: !!currentTenant?.id && currentTenant.role === 'owner',
  });
  const {
    data: invites = [],
    isLoading: invitesLoading,
  } = useQuery<TenantInvite[]>({
    queryKey: ['tenantInvites', currentTenant?.id],
    queryFn: () => tenantApi.invites(),
    enabled: !!currentTenant?.id && currentTenant.role === 'owner',
  });

  const handleSaveVat = async (): Promise<boolean> => {
    const vatValue = vat.trim() ? Number(vat) : NaN;
    if (Number.isNaN(vatValue) || vatValue < 0 || vatValue > 100) {
      setProfileMessage('מע״מ חייב להיות בין 0 ל‑100');
      return false;
    }
    try {
      setSavingVat(true);
      setProfileMessage(null);
      const marginValue = margin.trim() ? Number(margin) : NaN;
      if (!Number.isNaN(marginValue) && (marginValue < 0 || marginValue > 100)) {
        setProfileMessage('רווח גלובלי חייב להיות בין 0 ל־100');
        return false;
      }
      const precisionValue = decimalPrecision.trim() ? Number(decimalPrecision) : NaN;
      if (!Number.isNaN(precisionValue) && (precisionValue < 0 || precisionValue > 5)) {
        setProfileMessage('דיוק עשרוני חייב להיות בין 0 ל־5');
        return false;
      }
      const payload: { vat_percent: number; global_margin_percent?: number; use_margin?: boolean; use_vat?: boolean; decimal_precision?: number } = {
        vat_percent: vatValue,
        use_vat: useVat,
      };
      if (!Number.isNaN(marginValue)) {
        payload.global_margin_percent = marginValue;
      }
      if (!Number.isNaN(precisionValue)) {
        payload.decimal_precision = Math.max(0, Math.min(5, Math.floor(precisionValue)));
      }
      payload.use_margin = !Number.isNaN(marginValue) && marginValue > 0;
      await updateSettings.mutateAsync(payload);
      return true;
    } catch (error) {
      console.error('Error updating settings:', error);
      setProfileMessage('שגיאה בעדכון הגדרות מס/רווח');
      return false;
    } finally {
      setSavingVat(false);
    }
  };
  handleSaveVatRef.current = handleSaveVat;

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

  const toPhoneFlowErrorMessage = (err: unknown): string => {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('INVALID_CODE')) return 'קוד האימות לא תקין או שפג תוקף הקוד.';
    if (message.includes('INVALID_PHONE')) return 'מספר הטלפון שהוזן אינו תקין.';
    if (message.includes('PHONE_MISMATCH')) return 'המספר שייך כבר לחשבון אחר.';
    return message || 'שגיאה בתהליך אימות הטלפון';
  };

  const loadPhoneStatus = async (): Promise<void> => {
    try {
      setPhoneStatusLoading(true);
      const status = await authApi.phoneStatus();
      setProfilePhoneE164(status.phoneE164);
    } catch {
      setProfilePhoneE164(null);
    } finally {
      setPhoneStatusLoading(false);
    }
  };

  useEffect(() => {
    void loadPhoneStatus();
  }, []);

  const startPhoneChange = (): void => {
    setProfilePhoneStep('phone');
    setProfilePhoneInput(profilePhoneE164 || '');
    setProfilePhoneCode('');
    setProfilePhoneError(null);
    setProfilePhoneMessage(null);
  };

  const requestProfilePhoneOtp = async (): Promise<void> => {
    setProfilePhoneError(null);
    setProfilePhoneMessage(null);
    try {
      setProfilePhoneLoading(true);
      await authApi.requestOtp(profilePhoneInput, null, { flow: 'verify_phone' });
      setProfilePhoneStep('code');
      setProfilePhoneResendIn(60);
    } catch (error) {
      setProfilePhoneError(toPhoneFlowErrorMessage(error));
    } finally {
      setProfilePhoneLoading(false);
    }
  };

  const verifyProfilePhoneOtp = async (): Promise<void> => {
    setProfilePhoneError(null);
    setProfilePhoneMessage(null);
    try {
      setProfilePhoneLoading(true);
      await authApi.verifyMyPhone(profilePhoneInput, profilePhoneCode);
      await loadPhoneStatus();
      setProfilePhoneStep('idle');
      setProfilePhoneInput('');
      setProfilePhoneCode('');
      setProfilePhoneResendIn(0);
      setProfilePhoneMessage('מספר הטלפון אומת ועודכן בהצלחה');
    } catch (error) {
      setProfilePhoneError(toPhoneFlowErrorMessage(error));
    } finally {
      setProfilePhoneLoading(false);
    }
  };

  const handleSendInvite = async (): Promise<void> => {
    if (!currentTenant) {
      setInviteError('אין טננט פעיל');
      return;
    }

    const email = inviteEmail.trim();
    const phone = invitePhone.trim();

    if (inviteTargetType === 'email' && !email) {
      setInviteError('נא להזין כתובת אימייל');
      return;
    }
    if (inviteTargetType === 'phone' && !phone) {
      setInviteError('נא להזין מספר טלפון');
      return;
    }

    try {
      setInviteLoading(true);
      setInviteError(null);
      setInviteMessage(null);
      setInviteUrl(null);

      const result = await tenantsApi.invite(currentTenant.id, {
        ...(inviteTargetType === 'email' ? { email } : { phone }),
        role: inviteRole,
      });

      setInviteMessage('ההזמנה נוצרה בהצלחה. שלח את הקישור למוזמן או בקש ממנו להתחבר עם אותו יעד הזמנה.');
      if ((result as any)?.inviteUrl) {
        setInviteUrl((result as any).inviteUrl);
      }
      setInviteEmail('');
      setInvitePhone('');
    } catch (error: any) {
      console.error('Error sending invite:', error);
      setInviteError(error?.message || 'שגיאה ביצירת הזמנה');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleResetTenantData = async (): Promise<void> => {
    if (resetConfirmationText.trim() !== 'מחק') {
      setResetMessage('יש להקליד "מחק" בדיוק כדי לאשר איפוס נתונים');
      return;
    }
    try {
      setResetLoading(true);
      setResetMessage(null);
      setDangerActionMessage(null);
      await tenantApi.reset('מחק');
      setResetDialogOpen(false);
      setResetConfirmationText('');
      setDangerActionMessage('כל נתוני החנות אופסו בהצלחה');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
        queryClient.invalidateQueries({ queryKey: ['settings'] }),
      ]);
    } catch (error) {
      setResetMessage(error instanceof Error ? error.message : 'שגיאה באיפוס נתונים');
    } finally {
      setResetLoading(false);
    }
  };

  const handleDeleteAccount = async (): Promise<void> => {
    if (deleteConfirmationText.trim() !== 'מחק') {
      setDeleteAccountError('יש להקליד "מחק" בדיוק כדי לאשר מחיקת חשבון');
      return;
    }
    try {
      setDeleteAccountLoading(true);
      setDeleteAccountError(null);
      await accountApi.delete({
        confirmation: 'מחק',
        reason: deleteReason,
        message: deleteMessage.trim() || undefined,
      });
      await supabase.auth.signOut();
      window.location.href = '/about';
    } catch (error) {
      setDeleteAccountError(error instanceof Error ? error.message : 'שגיאה במחיקת החשבון');
    } finally {
      setDeleteAccountLoading(false);
    }
  };

  return (
    <>
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
          {/* כפתור שמירה בראש הכרטיס - נראה במובייל ללא גלילה */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pb-2 border-b border-border/50 sm:border-0 sm:pb-0">
            <div className={`relative inline-flex rounded-lg overflow-hidden ${savingVat ? 'p-[2px]' : ''}`}>
              {savingVat && (
                <div
                  className="absolute inset-0 rounded-lg animate-spin z-0"
                  style={{
                    background: 'conic-gradient(from 0deg, transparent 0deg, hsl(var(--primary)) 80deg, transparent 80deg)',
                  }}
                  aria-hidden
                />
              )}
              <Button
                onClick={handleSaveVat}
                disabled={savingVat || isLoading}
                className={`w-full sm:w-auto shrink-0 relative z-10 ${savingVat ? 'm-[2px]' : ''}`}
              >
                {savingVat ? 'מחשב ומעדכן מחירים...' : 'שמור הגדרות מחירים'}
              </Button>
            </div>
            {savingVat && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
                <span>מחשב מחירי מכירה לכל המוצרים והספקים. זה יכול לקחת כמה רגעים.</span>
              </div>
            )}
            <div className="flex flex-col gap-1 shrink-0">
              <Button
                variant="outline"
                onClick={async () => {
                  setRecalcMessage(null);
                  setRecalcLoading(true);
                  try {
                    const res = await settingsApi.recalculatePrices();
                    setRecalcMessage(res.message || (res.updated > 0 ? `עודכנו ${res.updated} מחירים` : 'כל המחירים כבר מעודכנים'));
                    if (res.updated > 0) {
                      await Promise.all([
                        queryClient.invalidateQueries({ queryKey: ['products'] }),
                        queryClient.invalidateQueries({ queryKey: ['settings'] }),
                      ]);
                    }
                  } catch (e) {
                    setRecalcMessage(e instanceof Error ? e.message : 'שגיאה בחישוב מחדש');
                  } finally {
                    setRecalcLoading(false);
                  }
                }}
                disabled={recalcLoading || isLoading}
                title="מחיל את הרווח והמע״מ הנוכחיים על כל המוצרים (כולל מיובאים)"
              >
                {recalcLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin ml-2" />
                    מחשב מחדש...
                  </>
                ) : (
                  'חשב מחדש את כל המחירים'
                )}
              </Button>
              <p className="text-xs text-muted-foreground">שימושי כששינית רווח/מע״מ ומוצרים מיובאים נשארו עם הערכים הישנים</p>
              {recalcMessage && (
                <p className="text-sm text-muted-foreground">{recalcMessage}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* בוקס 1: חשב מע"מ */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium">חשב מע&quot;מ</span>
              </div>
              <label htmlFor="useVatToggle" className="flex items-center gap-2 cursor-pointer">
                <span className="text-sm text-muted-foreground">{useVat ? 'פעיל' : 'לא פעיל'}</span>
                <div
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    useVat ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                      useVat ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </div>
                <input
                  id="useVatToggle"
                  type="checkbox"
                  className="sr-only"
                  checked={useVat}
                  onChange={(e) => setUseVat(e.target.checked)}
                />
              </label>
            </div>
            {/* בוקס 2: מע"מ (%) */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium">מע&quot;מ (%)</span>
              </div>
              <div className="flex items-stretch rounded-lg border-2 border-input overflow-hidden has-[:focus-within]:border-primary has-[:focus-within]:ring-2 has-[:focus-within]:ring-ring has-[:focus-within]:ring-offset-2">
                <Input
                  id="vatPercent"
                  type="text"
                  inputMode="decimal"
                  value={vat}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
                    setVat(v);
                  }}
                  placeholder="18"
                  className="h-9 text-sm border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 flex-1 min-w-0"
                />
                <div className="flex flex-col border-r border-input">
                  <button
                    type="button"
                    onClick={() => setVat(String(Math.min(100, (Number(vat) || 0) + 1)))}
                    className="flex-1 min-h-[18px] px-1.5 flex items-center justify-center hover:bg-muted transition-colors"
                    aria-label="הגדל"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setVat(String(Math.max(0, (Number(vat) || 0) - 1)))}
                    className="flex-1 min-h-[18px] px-1.5 flex items-center justify-center hover:bg-muted transition-colors"
                    aria-label="הקטן"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
            {/* בוקס 3: רווח גלובלי */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium">רווח גלובלי</span>
                <Button type="button" variant="ghost" size="sm" className="h-5 w-5 p-0 shrink-0" onClick={() => setExplainPopup('margin')} aria-label="הסבר">
                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </div>
              <div className={`flex items-stretch rounded-lg border-2 overflow-hidden has-[:focus-within]:ring-2 has-[:focus-within]:ring-ring has-[:focus-within]:ring-offset-2 ${isMarginInvalid ? 'border-destructive' : 'border-input has-[:focus-within]:border-primary'}`}>
                <Input
                  id="globalMargin"
                  type="text"
                  inputMode="decimal"
                  value={margin}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
                    setMargin(v);
                  }}
                  placeholder="0"
                  className="h-9 text-sm border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 flex-1 min-w-0"
                />
                <div className="flex flex-col border-r border-input">
                  <button
                    type="button"
                    onClick={() => setMargin(String(Math.min(100, (Number(margin) || 0) + 1)))}
                    className="flex-1 min-h-[18px] px-1.5 flex items-center justify-center hover:bg-muted transition-colors"
                    aria-label="הגדל"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMargin(String(Math.max(0, (Number(margin) || 0) - 1)))}
                    className="flex-1 min-h-[18px] px-1.5 flex items-center justify-center hover:bg-muted transition-colors"
                    aria-label="הקטן"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">מ־0 עד 100</p>
              {isMarginInvalid && <p className="text-xs text-destructive">רווח גלובלי חייב להיות בין 0 ל־100</p>}
            </div>
            {/* בוקס 4: דיוק עשרוני */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium">דיוק עשרוני</span>
                <Button type="button" variant="ghost" size="sm" className="h-5 w-5 p-0 shrink-0" onClick={() => setExplainPopup('decimal')} aria-label="הסבר">
                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </div>
              <div className={`flex items-stretch rounded-lg border-2 overflow-hidden has-[:focus-within]:ring-2 has-[:focus-within]:ring-ring has-[:focus-within]:ring-offset-2 ${isDecimalInvalid ? 'border-destructive' : 'border-input has-[:focus-within]:border-primary'}`}>
                <Input
                  id="decimalPrecision"
                  type="text"
                  inputMode="numeric"
                  value={decimalPrecision}
                  onChange={(e) => setDecimalPrecision(e.target.value.replace(/\D/g, ''))}
                  placeholder="2"
                  className="h-9 text-sm border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 flex-1 min-w-0"
                />
                <div className="flex flex-col border-r border-input">
                  <button
                    type="button"
                    onClick={() => setDecimalPrecision(String(Math.min(5, (Number(decimalPrecision) || 0) + 1)))}
                    className="flex-1 min-h-[18px] px-1.5 flex items-center justify-center hover:bg-muted transition-colors"
                    aria-label="הגדל"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecimalPrecision(String(Math.max(0, (Number(decimalPrecision) || 0) - 1)))}
                    className="flex-1 min-h-[18px] px-1.5 flex items-center justify-center hover:bg-muted transition-colors"
                    aria-label="הקטן"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">מ־0 עד 5 (מספר ספרות אחרי הנקודה)</p>
              {isDecimalInvalid && <p className="text-xs text-destructive">דיוק עשרוני חייב להיות בין 0 ל־5</p>}
            </div>
          </div>

          {/* פופאפ הסבר */}
          <Dialog open={explainPopup !== null} onOpenChange={(open) => !open && setExplainPopup(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {explainPopup === 'margin' && 'אחוז רווח גלובלי – הסבר'}
                  {explainPopup === 'decimal' && 'דיוק עשרוני – הסבר'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm text-muted-foreground">
                {explainPopup === 'margin' && (
                  <>
                    <p>אחוז הרווח הגלובלי מגדיר את התוספת על עלות הקנייה שתיושם אוטומטית בכל המוצרים. הערך משמש כברירת מחדל כאשר לא הוגדר רווח ברמת קטגוריה או מוצר ספציפי.</p>
                    <p>מחיר המכירה מחושב מעלות המוצר (לאחר הנחה) בתוספת אחוז הרווח והמע״מ בהתאם להגדרות. ערך 0% משמש לתצוגת עלות בלבד ללא תוספת רווח.</p>
                  </>
                )}
                {explainPopup === 'decimal' && (
                  <>
                    <p>ברירת המחדל היא 2 ספרות. העלה דיוק רק אם באמת צריך (למשל יחידות משקל/נפח) כדי למנוע רעש במספרים.</p>
                    <p>בתצוגה אפסים לא משמעותיים בסוף יוסתרו.</p>
                  </>
                )}
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                {explainPopup === 'decimal' && (
                  <Button variant="outline" onClick={() => { openHelp('decimal-places'); setExplainPopup(null); }}>
                    מעבר להדרכה
                  </Button>
                )}
                <Button variant="outline" onClick={() => setExplainPopup(null)}>סגור</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg border-2 border-border">
              <p className="text-xs font-medium mb-1">סיכום החישוב:</p>
              <p className="text-xs text-muted-foreground">
                {Number(margin) > 0
                  ? useVat ? 'מחיר מכירה = עלות + רווח + מע"מ' : 'מחיר מכירה = עלות + רווח'
                  : useVat ? 'מחיר מכירה = עלות + מע"מ' : 'מחיר מכירה = עלות'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Column Layout Settings */}
      <Card className="shadow-md border-2">
        <CardHeader>
          <CardTitle className="text-lg font-bold">תבנית עמודות טבלת מחירים</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            בחר אילו עמודות יוצגו בראש כרטיס המוצר. לכל עמודה בחר שדה מהרשימה – גרור או לחץ לבחירה. שאר השדות יופיעו באזור המורחב (חץ).
          </p>
          <FieldLayoutEditor
            allFields={allFields}
            availableColumns={availableColumns}
            appSettings={appSettings}
            pinnedFieldIds={pinnedFieldIds}
            onChange={setPinnedFieldIds}
            loading={layoutLoading}
            saving={savingFieldLayout}
            onSave={async () => {
              if (!currentTenant?.id) return;
              try {
                setSavingFieldLayout(true);
                const payload = { pinnedFieldIds };
                const key = getTableLayoutProductsKey(currentTenant.id);
                queryClient.setQueryData(key, payload);
                await settingsApi.setPreference('table_layout_productsTable', payload);
                window.dispatchEvent(new Event('priceTableLayoutChanged'));
                navigate('/products');
              } finally {
                setSavingFieldLayout(false);
              }
            }}
            onReset={async () => {
              if (!currentTenant?.id) return;
              const resetPinned = normalizePinnedFieldIds(
                allFields.slice(0, 3).map((field) => field.id),
                allFields
              );
              setPinnedFieldIds(resetPinned);
              setSavingFieldLayout(true);
              try {
                const payload = { pinnedFieldIds: resetPinned };
                const key = getTableLayoutProductsKey(currentTenant.id);
                queryClient.setQueryData(key, payload);
                await settingsApi.setPreference('table_layout_productsTable', payload);
                window.dispatchEvent(new Event('priceTableLayoutChanged'));
              } finally {
                setSavingFieldLayout(false);
              }
            }}
          />
        </CardContent>
      </Card>

      {/* תמיכה מהירה - מעל הזמנת משתמשים */}
      <Card className="shadow-md border-2">
        <CardHeader>
          <CardTitle className="text-lg font-bold">תמיכה מהירה</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            אפשר לפתוח שיחת תמיכה דו-כיוונית ישירות מתוך המערכת, כולל צירוף קובץ או תמונה.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate('/support')} className="w-full sm:w-auto">
              פתח צ׳אט תמיכה
            </Button>
            {supportButtonHidden ? (
              <Button variant="outline" onClick={() => void showSupportButton()} className="w-full sm:w-auto">
                הצג כפתור תמיכה בפינה
              </Button>
            ) : (
              <span className="flex items-center self-center text-sm text-muted-foreground">
                כפתור התמיכה מוצג בפינה
              </span>
            )}
            <Button variant="outline" onClick={() => openHelp('add-participant')} className="w-full sm:w-auto">
              מדריך הזמנת משתמשים
            </Button>
            <Button variant="outline" onClick={() => showWelcome()} className="w-full sm:w-auto">
              צפה בסרטון ברוכים הבאים
            </Button>
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
                הזמן עובדים או שותפים לחנות הנוכחית באמצעות אימייל או מספר טלפון מאומת.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div className="space-y-2">
                  <Label htmlFor="inviteTargetType">סוג הזמנה</Label>
                  <select
                    id="inviteTargetType"
                    className="border-input bg-background px-3 py-2 rounded-md text-sm w-full"
                    value={inviteTargetType}
                    onChange={(e) => setInviteTargetType(e.target.value as 'email' | 'phone')}
                  >
                    <option value="email">אימייל</option>
                    <option value="phone">טלפון</option>
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="inviteTargetValue">
                    {inviteTargetType === 'email' ? 'אימייל של המוזמן' : 'טלפון של המוזמן'}
                  </Label>
                  <Input
                    id="inviteTargetValue"
                    type={inviteTargetType === 'email' ? 'email' : 'tel'}
                    value={inviteTargetType === 'email' ? inviteEmail : invitePhone}
                    onChange={(e) => {
                      if (inviteTargetType === 'email') setInviteEmail(e.target.value);
                      else setInvitePhone(e.target.value);
                    }}
                    placeholder={inviteTargetType === 'email' ? 'name@example.com' : '05XXXXXXXX'}
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
                      שלח קישור זה למוזמן, או שהוא יכול להתחבר עם אותו אימייל/טלפון שהוזן בהזמנה והמערכת תזהה אוטומטית.
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
                          <span className="font-medium break-all">{inv.email || inv.phone_e164 || 'יעד לא ידוע'}</span>
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
                placeholder={fullName ? fullName : 'שם משתמש '}
              />
            </div>
          </div>
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="space-y-2">
              <Label htmlFor="profilePhoneE164">מספר טלפון מאומת</Label>
              <Input
                id="profilePhoneE164"
                value={phoneStatusLoading ? 'טוען...' : (profilePhoneE164 || 'לא הוגדר עדיין')}
                disabled
                className="bg-muted cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground">
                המספר הזה משמש להתחברות/אימות ולזיהוי הזמנות לפי טלפון.
              </p>
            </div>

            {profilePhoneError ? (
              <p className="text-xs text-destructive">{profilePhoneError}</p>
            ) : null}
            {profilePhoneMessage ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">{profilePhoneMessage}</p>
            ) : null}

            {profilePhoneStep === 'idle' ? (
              <Button type="button" variant="outline" onClick={startPhoneChange}>
                {profilePhoneE164 ? 'החלף מספר טלפון' : 'אמת מספר טלפון'}
              </Button>
            ) : null}

            {profilePhoneStep === 'phone' ? (
              <div className="space-y-2">
                <Label htmlFor="profilePhoneInput">מספר טלפון חדש</Label>
                <Input
                  id="profilePhoneInput"
                  type="tel"
                  value={profilePhoneInput}
                  onChange={(e) => setProfilePhoneInput(e.target.value)}
                  placeholder="05XXXXXXXX"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={requestProfilePhoneOtp}
                    disabled={profilePhoneLoading || profilePhoneInput.trim().length === 0}
                  >
                    {profilePhoneLoading ? 'שולח קוד...' : 'שלח קוד אימות'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setProfilePhoneStep('idle');
                      setProfilePhoneInput('');
                      setProfilePhoneError(null);
                    }}
                    disabled={profilePhoneLoading}
                  >
                    ביטול
                  </Button>
                </div>
              </div>
            ) : null}

            {profilePhoneStep === 'code' ? (
              <div className="space-y-2">
                <Label htmlFor="profilePhoneCode">קוד אימות</Label>
                <Input
                  id="profilePhoneCode"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={profilePhoneCode}
                  onChange={(e) => setProfilePhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6 ספרות"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={verifyProfilePhoneOtp}
                    disabled={profilePhoneLoading || profilePhoneCode.length !== 6}
                  >
                    {profilePhoneLoading ? 'מאמת...' : 'אמת מספר'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={requestProfilePhoneOtp}
                    disabled={profilePhoneLoading || profilePhoneResendIn > 0}
                  >
                    {profilePhoneResendIn > 0 ? `שלח שוב בעוד ${profilePhoneResendIn} שניות` : 'שלח קוד שוב'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setProfilePhoneStep('phone');
                      setProfilePhoneCode('');
                      setProfilePhoneError(null);
                    }}
                    disabled={profilePhoneLoading}
                  >
                    שינוי מספר
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">סיסמה חדשה</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="סיסמה חדשה "
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
          <div className="mt-4 pt-4 border-t border-border">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={async () => {
                await supabase.auth.signOut();
                setTenantIdForApi(null);
                localStorage.removeItem('currentTenantId');
                queryClient.clear();
                window.location.href = '/login';
              }}
            >
              יציאה מהחשבון
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* אזור פעולות רגישות - הכי למטה */}
      <Card className="shadow-md border-2 border-destructive/40">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-destructive">אזור פעולות רגישות</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            פעולות אלה בלתי הפיכות. מומלץ לוודא לפני אישור.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setResetDialogOpen(true);
                setResetMessage(null);
              }}
            >
              אפס/מחק את כל נתוני החנות
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => {
                setDeleteAccountDialogOpen(true);
                setDeleteAccountError(null);
              }}
            >
              מחק את החשבון שלי
            </Button>
          </div>
          {dangerActionMessage ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">{dangerActionMessage}</p>
          ) : null}
        </CardContent>
      </Card>

    </div>
    <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>איפוס/מחיקת כל נתוני החנות</DialogTitle>
          <DialogDescription>
            פעולה זו מוחקת את כל המוצרים, הספקים והיסטוריית המחירים בחנות הנוכחית. כדי לאשר, הקלד "מחק".
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reset-confirm">אישור מחיקה</Label>
          <Input
            id="reset-confirm"
            value={resetConfirmationText}
            onChange={(e) => setResetConfirmationText(e.target.value)}
            placeholder='הקלד: מחק'
          />
          {resetMessage ? <p className="text-xs text-destructive">{resetMessage}</p> : null}
        </div>
        <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:items-stretch">
          <Button type="button" variant="destructive" onClick={handleResetTenantData} disabled={resetLoading}>
            {resetLoading ? 'מוחק נתונים...' : 'מחק את כל הנתונים'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setResetDialogOpen(false)} disabled={resetLoading}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={deleteAccountDialogOpen} onOpenChange={setDeleteAccountDialogOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>מחיקת החשבון שלי</DialogTitle>
          <DialogDescription>
            פעולה זו מוחקת את חשבון המשתמש. לפני המחיקה, נבקש ממך לבחור סיבה. כדי לאשר, הקלד "מחק".
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="delete-reason">סיבת עזיבה</Label>
            <select
              id="delete-reason"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value as typeof deleteReason)}
            >
              <option value="not_satisfied">לא מרוצה מהאפליקציה</option>
              <option value="too_expensive">יקר לי כרגע</option>
              <option value="stopped_working_with_suppliers">הפסקתי לעבוד עם ספקים</option>
              <option value="moved_to_other_system">עברתי למערכת אחרת</option>
              <option value="missing_features">חסרות לי יכולות</option>
              <option value="other">אחר</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="delete-message">הודעה נוספת (אופציונלי)</Label>
            <textarea
              id="delete-message"
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={deleteMessage}
              onChange={(e) => setDeleteMessage(e.target.value)}
              maxLength={500}
              placeholder="אפשר לרשום כאן מה היה חסר לך או למה החלטת לעזוב..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm">אישור מחיקה</Label>
            <Input
              id="delete-confirm"
              value={deleteConfirmationText}
              onChange={(e) => setDeleteConfirmationText(e.target.value)}
              placeholder='הקלד: מחק'
            />
          </div>
          {deleteAccountError ? <p className="text-xs text-destructive">{deleteAccountError}</p> : null}
        </div>
        <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:items-stretch">
          <Button type="button" variant="destructive" onClick={handleDeleteAccount} disabled={deleteAccountLoading}>
            {deleteAccountLoading ? 'מוחק חשבון...' : 'מחק את החשבון שלי'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setDeleteAccountDialogOpen(false)} disabled={deleteAccountLoading}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

