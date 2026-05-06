import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './lib/supabaseClient';
import { setTenantIdForApi } from './lib/api';
import { TenantProvider } from './contexts/TenantContext';
import { useTenant } from './hooks/useTenant';
import { useSuperAdmin } from './hooks/useSuperAdmin';
import { useBootstrap } from './hooks/useBootstrap';
import { useTenantSubscriptionStatus } from './hooks/useAdmin';
import { AppHeader } from './components/layout/AppHeader';
import { BottomTabs } from './components/layout/BottomTabs';
import { PublicAuthFooter } from './components/layout/PublicAuthFooter';
import { FloatingActionButton } from './components/ui/FloatingActionButton';

import Login from './pages/Login';
import Signup from './pages/Signup';
import Products from './pages/Products';
import NewProduct from './pages/NewProduct';
import Categories from './pages/Categories';
import Suppliers from './pages/Suppliers';
import Settings from './pages/Settings';
import EditProduct from './pages/EditProduct';
import StockAlerts from './pages/StockAlerts';
import ImportExport from './pages/ImportExport';
import Admin from './pages/Admin';
import SupportChat from './pages/SupportChat';
import AdminSupportInbox from './pages/AdminSupportInbox';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PublicLanding from './pages/PublicLanding';
import About from './pages/About';
import Contact from './pages/Contact';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import { OnboardingRouter } from './components/OnboardingRouter';
import { SplashScreen } from './components/SplashScreen';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './components/ui/dialog';
import { Label } from './components/ui/label';
import { Input } from './components/ui/input';
import { Button } from './components/ui/button';
import { authApi } from './lib/api';
import { RouteScrollToTop } from './components/RouteScrollToTop';
import { HelpCenterProvider, useHelpCenter } from './contexts/HelpCenterContext';
import { UnsavedChangesProvider } from './contexts/UnsavedChangesContext';
import { helpContent, WELCOME_VIDEO_URL } from './help/content';
import { getHelpArticleIdFromSearch } from './help/navigation';
import { WelcomeModal } from './components/help/WelcomeModal';
import { SupportButton } from './components/SupportButton';
import { AccessibilityBar } from './components/AccessibilityBar';
import { HelpDrawer } from './components/help/HelpDrawer';
import { AppToastProvider } from './contexts/AppToastContext';
import { LowStockToastMonitor } from './components/LowStockToastMonitor';
import { loadAccessibilityPreferences, applyAccessibilityToDocument } from './lib/accessibility';
import { AlertTriangle, CalendarClock, ShieldCheck } from 'lucide-react';
const PHONE_REMINDER_SESSION_KEY_PREFIX = 'stockly:phone-reminder-shown:';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInitialSplash, setShowInitialSplash] = useState(true);
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    const prefs = loadAccessibilityPreferences();
    applyAccessibilityToDocument(prefs);
  }, []);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
      })
      .catch((error) => {
        console.error('[app] failed to read session on startup:', error);
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setTenantIdForApi(null);
    localStorage.removeItem('currentTenantId');
    queryClient.clear();
    setUser(null);
    window.location.href = '/login';
  };

  // Intro splash – בכל רענון מלא של האפליקציה
  // הספלאש יקרא ל-onDone כשהאנימציה מסתיימת - אין צורך ב-timeout נפרד

  // Splash פתיחה – לפני שמגיעים בכלל למסכי לוגאין/רישום
  if (showInitialSplash && !user) {
    return <SplashScreen onDone={() => setShowInitialSplash(false)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">טוען את המערכת...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <TenantProvider>
        <RouteScrollToTop />
        <AppContent
          user={user}
          onLogout={handleLogout}
          theme={theme}
          onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        />
      </TenantProvider>
    </BrowserRouter>
  );
}

function AppContent({
  user,
  onLogout,
  theme,
  onToggleTheme,
}: {
  user: User | null;
  onLogout: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}) {
  const location = useLocation();
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [phoneValue, setPhoneValue] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpStep, setOtpStep] = useState<'phone' | 'code'>('phone');
  const [phoneFlowLoading, setPhoneFlowLoading] = useState(false);
  const [phoneFlowError, setPhoneFlowError] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [phoneVerificationPending, setPhoneVerificationPending] = useState(false);

  const toPhoneFlowErrorMessage = (err: unknown): string => {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('SECURITY_CHECK_FAILED')) {
      return 'אימות האבטחה נכשל. אפשר לנסות שוב עכשיו או לטפל בזה מאוחר יותר.';
    }
    if (message.includes('INVALID_CODE')) {
      return 'קוד האימות לא תקין או שפג תוקף הקוד.';
    }
    return message || 'שגיאה בשליחת קוד';
  };

  useEffect(() => {
    if (!user) {
      setPhoneDialogOpen(false);
      setPhoneVerificationPending(false);
      return;
    }

    let isMounted = true;
    const checkPhone = async () => {
      try {
        const status = await authApi.phoneStatus();
        const reminderKey = `${PHONE_REMINDER_SESSION_KEY_PREFIX}${user.id}`;
        const alreadyShownThisSession = sessionStorage.getItem(reminderKey) === '1';

        if (isMounted) {
          // Keep the top reminder banner visible whenever verification is required.
          setPhoneVerificationPending(status.phoneRequired);
        }

        if (isMounted && status.phoneRequired && !alreadyShownThisSession) {
          setPhoneDialogOpen(true);
          sessionStorage.setItem(reminderKey, '1');
        }
      } catch {
        // Keep app usable if phone status endpoint is temporarily unavailable.
      }
    };

    void checkPhone();
    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => {
      setResendIn((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  const requestPhoneOtp = async () => {
    setPhoneFlowError('');
    setPhoneFlowLoading(true);
    try {
      await authApi.requestOtp(phoneValue, null, { flow: 'verify_phone' });
      setOtpStep('code');
      setResendIn(60);
    } catch (err: unknown) {
      setPhoneFlowError(toPhoneFlowErrorMessage(err));
    } finally {
      setPhoneFlowLoading(false);
    }
  };

  const verifyPhoneOtp = async () => {
    setPhoneFlowError('');
    setPhoneFlowLoading(true);
    try {
      await authApi.verifyMyPhone(phoneValue, otpCode);
      setPhoneDialogOpen(false);
      setPhoneVerificationPending(false);
      setPhoneValue('');
      setOtpCode('');
      setOtpStep('phone');
      setResendIn(0);
    } catch (err: unknown) {
      setPhoneFlowError(toPhoneFlowErrorMessage(err));
    } finally {
      setPhoneFlowLoading(false);
    }
  };

  // Fetch bootstrap data once user is logged in
  // Bootstrap will automatically use current tenant if selected (via x-tenant-id header)
  // This seeds React Query cache so existing hooks can use cached data instantly
  useBootstrap(!!user);

  if (location.pathname === '/reset-password') {
    return <ResetPassword />;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div className="flex-1 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key="auth-shell"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="w-full max-w-md px-4"
            >
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/about" element={<About />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/" element={<PublicLanding />} />
                <Route path="*" element={<PublicLanding />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </div>
        <PublicAuthFooter />
        <AccessibilityBar />
      </div>
    );
  }

  return (
    <>
      <OnboardingRouter>
        <HelpCenterProvider userId={user.id}>
          <AppToastProvider>
            <UnsavedChangesProvider>
              <AppWithNavigation
                user={user}
                onLogout={onLogout}
                theme={theme}
                onToggleTheme={onToggleTheme}
                phoneVerificationPending={phoneVerificationPending}
                onRequestPhoneVerification={() => setPhoneDialogOpen(true)}
              />
              <LowStockToastMonitor />
              <HelpCenterShell />
            </UnsavedChangesProvider>
          </AppToastProvider>
        </HelpCenterProvider>
      </OnboardingRouter>

      <Dialog open={phoneDialogOpen} onOpenChange={setPhoneDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>אימות מספר טלפון נדרש</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              כדי להמשיך להשתמש במערכת צריך לאמת מספר טלפון לחשבון שלך.
            </p>
            {phoneFlowError ? (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {phoneFlowError}
              </div>
            ) : null}

            {otpStep === 'phone' ? (
              <div className="space-y-2">
                <Label htmlFor="verify-phone">מספר טלפון</Label>
                <Input
                  id="verify-phone"
                  type="tel"
                  value={phoneValue}
                  onChange={(e) => setPhoneValue(e.target.value)}
                  placeholder="05XXXXXXXX"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="verify-phone-code">קוד אימות</Label>
                <Input
                  id="verify-phone-code"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6 ספרות"
                />
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:items-stretch">
            {otpStep === 'phone' ? (
              <>
                <Button onClick={requestPhoneOtp} disabled={phoneFlowLoading || phoneValue.trim().length === 0}>
                  {phoneFlowLoading ? 'שולח קוד...' : 'שלח קוד אימות'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPhoneDialogOpen(false);
                  }}
                  disabled={phoneFlowLoading}
                >
                  תזכיר לי מאוחר יותר
                </Button>
              </>
            ) : (
              <>
                <Button onClick={verifyPhoneOtp} disabled={phoneFlowLoading || otpCode.length !== 6}>
                  {phoneFlowLoading ? 'מאמת...' : 'אמת מספר טלפון'}
                </Button>
                <Button
                  variant="outline"
                  onClick={requestPhoneOtp}
                  disabled={phoneFlowLoading || resendIn > 0}
                >
                  {resendIn > 0 ? `שלח שוב בעוד ${resendIn} שניות` : 'שלח קוד שוב'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setOtpStep('phone');
                    setOtpCode('');
                    setPhoneFlowError('');
                  }}
                  disabled={phoneFlowLoading}
                >
                  שינוי מספר
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPhoneDialogOpen(false);
                  }}
                  disabled={phoneFlowLoading}
                >
                 תזכיר לי מאוחר יותר
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function HelpCenterShell() {
  const location = useLocation();
  const {
    openHelp,
    closeHelp,
    isDrawerOpen,
    filteredArticles,
    markWelcomeSeen,
    selectedArticle,
    selectedCategoryId,
    searchTerm,
    setSearchTerm,
    setSelectedCategoryId,
    setSelectedArticleId,
    welcomeOpen,
  } = useHelpCenter();

  const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

  useEffect(() => {
    const articleId = getHelpArticleIdFromSearch(location.search);
    if (articleId) {
      openHelp(articleId);
    }
  }, [location.search, openHelp]);

  return (
    <>
      <WelcomeModal
        open={welcomeOpen}
        videoUrl={WELCOME_VIDEO_URL}
        onStart={() => void markWelcomeSeen()}
        onSkip={() => void markWelcomeSeen()}
      />
      <HelpDrawer
        open={isDrawerOpen}
        isRtl={isRtl}
        categories={helpContent.categories}
        articles={filteredArticles}
        selectedCategoryId={selectedCategoryId}
        selectedArticle={selectedArticle}
        searchTerm={searchTerm}
        onClose={closeHelp}
        onSearchChange={setSearchTerm}
        onCategoryChange={setSelectedCategoryId}
        onArticleSelect={setSelectedArticleId}
      />
    </>
  );
}

/**
 * AdminRouteGuard - Protects /admin route
 * 
 * CRITICAL SECURITY: If user is not super admin, redirects away from /admin
 * This ensures normal users cannot access admin pages even if they navigate directly
 */
function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const { data: isSuperAdmin, isLoading } = useSuperAdmin(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Only redirect if check is complete and user is NOT super admin
    if (!isLoading && isSuperAdmin === false) {
      // Redirect to home or no-access page
      navigate('/', { replace: true });
    }
  }, [isSuperAdmin, isLoading, navigate]);

  // Show nothing while checking (or if not admin)
  if (isLoading || isSuperAdmin !== true) {
    return null;
  }

  return <>{children}</>;
}

function AppWithNavigation({
  user,
  onLogout,
  theme,
  onToggleTheme,
  phoneVerificationPending,
  onRequestPhoneVerification,
}: {
  user: User;
  onLogout: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  phoneVerificationPending: boolean;
  onRequestPhoneVerification: () => void;
}) {
  const { currentTenant } = useTenant();
  const { data: isSuperAdmin } = useSuperAdmin();
  const { data: subscription } = useTenantSubscriptionStatus();
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin');
  const adminOnlyMode = isAdminPage && isSuperAdmin === true;
 
  // Super admin can access /admin without a tenant
  const canAccess = isAdminPage || currentTenant || (isSuperAdmin === true && isAdminPage);
  
  // Only show navigation if we have a tenant or if super admin accessing admin page
  if (!canAccess) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
        <AppHeader
            user={user}
            onLogout={onLogout}
            isSuperAdmin={isSuperAdmin === true}
            adminOnlyMode={adminOnlyMode}
        isDark={theme === 'dark'}
        onToggleTheme={onToggleTheme}
      />
      {phoneVerificationPending ? (
        <div className="w-full border-b-2 border-red-300 bg-red-50 text-red-900 dark:border-red-400 dark:bg-red-950/40 dark:text-red-200">
          <div className="mx-auto mt-2 flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2 text-sm">
            <span>חשוב: החשבון עדיין ללא מספר טלפון מאומת. מומלץ לאמת עכשיו.</span>
            <button
              type="button"
              className="rounded-md border-2 border-red-400 px-3 py-1 text-xs font-medium transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground dark:border-red-500 dark:hover:border-primary dark:hover:bg-primary dark:hover:text-primary-foreground"
              onClick={onRequestPhoneVerification}
            >
              אמת מספר טלפון
            </button>
          </div>
        </div>
      ) : null}
      {!isAdminPage && subscription ? (
        <div className="w-full border-b border-border/80 bg-muted/30 text-foreground">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-2.5 text-sm font-medium">
            {subscription.computed_status === 'expired' || subscription.computed_status === 'cancelled' ? (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            ) : subscription.isExpiringSoon ? (
              <CalendarClock className="h-4 w-4 shrink-0" />
            ) : (
              <ShieldCheck className="h-4 w-4 shrink-0" />
            )}
            <span>
              {subscription.computed_status === 'expired' || subscription.computed_status === 'cancelled'
                ? 'תוקף המנוי פג. יש להסדיר תשלום להמשך שימוש.'
                : subscription.isExpiringSoon
                ? `מנוי מסתיים בעוד ${Math.max(subscription.daysRemaining, 0)} ימים`
                : `מנוי פעיל עד ${new Date(subscription.valid_until).toLocaleDateString('he-IL')}`}
            </span>
          </div>
        </div>
      ) : null}
      <main className="w-full min-w-0 flex justify-center px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-36 sm:pb-8 overflow-x-hidden">
        <div className="w-full max-w-6xl min-w-0">
          <Routes>
            <Route path="/products" element={<Products />} />
            <Route path="/products/new" element={<NewProduct />} />
            <Route path="/products/:id/edit" element={<EditProduct />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/import-export" element={<ImportExport />} />
            <Route path="/stock-alerts" element={<StockAlerts />} />
            <Route path="/support" element={<SupportChat />} />
            <Route 
              path="/admin" 
              element={
                <AdminRouteGuard>
                  <Admin />
                </AdminRouteGuard>
              } 
            />
            <Route
              path="/admin/support"
              element={
                <AdminRouteGuard>
                  <AdminSupportInbox />
                </AdminRouteGuard>
              }
            />
            <Route path="/settings" element={<Settings />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/about" element={<About />} />
            <Route path="/" element={<Navigate to="/products" />} />
            <Route path="*" element={<Navigate to="/products" replace />} />
          </Routes>
        </div>
      </main>
      {!adminOnlyMode && <BottomTabs />}
      {!adminOnlyMode && <FloatingActionButton to="/products/new" ariaLabel="הוספת מוצר חדש" />}
      <SupportButton />
      <AccessibilityBar />
    </div>
  );
}

export default App;
