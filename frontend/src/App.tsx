import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
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
const PHONE_REMINDER_SESSION_KEY_PREFIX = 'stockly:phone-reminder-shown:';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInitialSplash, setShowInitialSplash] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const queryClient = useQueryClient();

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

  // Intro splash – בכל רענון מלא של האפליקציה
  // הספלאש יקרא ל-onDone כשהאנימציה מסתיימת - אין צורך ב-timeout נפרד

  const handleLogout = async () => {
    // CRITICAL: Sign out from Supabase first
    await supabase.auth.signOut();
    
    // CRITICAL: Clear tenantId from module-level variable and localStorage
    // This prevents cross-tenant data leakage when switching users
    setTenantIdForApi(null);
    localStorage.removeItem('currentTenantId');
    
    // CRITICAL: Clear React Query cache to prevent cached tenant/admin data from leaking to next user
    queryClient.clear();
    
    setUser(null);
    
    // Navigate to login page (replace: true to prevent back button issues)
    window.location.href = '/login';
  };

  // Splash פתיחה – לפני שמגיעים בכלל למסכי לוגאין/רישום
  if (showInitialSplash && !user) {
    return <SplashScreen onDone={() => setShowInitialSplash(false)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-background via-primary/20 to-background">
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
      await authApi.requestOtp(phoneValue);
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
      <div className="min-h-screen flex flex-col bg-linear-to-br from-background via-primary/20 to-background">
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
      </div>
    );
  }

  return (
    <>
      <OnboardingRouter>
        <AppWithNavigation
          user={user}
          onLogout={onLogout}
          theme={theme}
          onToggleTheme={onToggleTheme}
          phoneVerificationPending={phoneVerificationPending}
          onRequestPhoneVerification={() => setPhoneDialogOpen(true)}
        />
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
  const location = useLocation();
  const navigate = useNavigate();
 
  // Super admin can access /admin without a tenant
  const isAdminPage = location.pathname === '/admin';
  const canAccess = isAdminPage || currentTenant || (isSuperAdmin === true && isAdminPage);
  
  // Only show navigation if we have a tenant or if super admin accessing admin page
  if (!canAccess) {
    return null;
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-primary/20 to-background">
      <AppHeader
        user={user}
        onLogout={onLogout}
        isSuperAdmin={isSuperAdmin === true}
        isDark={theme === 'dark'}
        onToggleTheme={onToggleTheme}
      />
      {phoneVerificationPending ? (
        <div className="w-full border-b border-amber-300 bg-amber-100 text-amber-900">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2 text-sm">
            <span>חשוב: החשבון עדיין ללא מספר טלפון מאומת. מומלץ לאמת עכשיו.</span>
            <button
              type="button"
              className="rounded-md border border-amber-500 px-3 py-1 text-xs font-medium hover:bg-amber-200"
              onClick={onRequestPhoneVerification}
            >
              אמת מספר טלפון
            </button>
          </div>
          <div className="mx-auto w-full max-w-6xl px-4 pb-2 text-xs text-amber-800">
            בינתיים הפיצ&apos;ר הזה עדיין תחת עיבוד.
          </div>
        </div>
      ) : null}
      <main className="w-full flex justify-center px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-36 sm:pb-8">
        <div className="w-full max-w-6xl">
          <Routes>
            <Route path="/products" element={<Products />} />
            <Route path="/products/new" element={<NewProduct />} />
            <Route path="/products/:id/edit" element={<EditProduct />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/import-export" element={<ImportExport />} />
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
      <div className="fixed inset-x-0 bottom-0 z-30 w-full border-t border-border/60 bg-background/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-2 text-xs text-muted-foreground">
          <span>© 2026 סטוקלי</span>
          <div className="flex items-center gap-2">
            <Link
              to="/privacy"
              className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-accent"
            >
              מדיניות פרטיות
            </Link>
            <Link
              to="/terms"
              className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-accent"
            >
              תנאי שימוש
            </Link>
            <Link
              to="/about"
              className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-accent"
            >
              Why Stockly
            </Link>
          </div>
        </div>
      </div>
      <BottomTabs />
      <FloatingActionButton to="/products/new" ariaLabel="הוספת מוצר חדש" />
      <div className="fixed bottom-24 left-4 z-40 sm:bottom-6">
        <button
          type="button"
          onClick={() => navigate('/support')}
          className="group h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-200 hover:scale-110 hover:shadow-xl"
          aria-label="פתח תמיכה"
          title="תמיכה"
        >
          <span className="text-lg font-bold transition-transform duration-200 group-hover:scale-110">?</span>
        </button>
      </div>
    </div>
  );
}

export default App;
