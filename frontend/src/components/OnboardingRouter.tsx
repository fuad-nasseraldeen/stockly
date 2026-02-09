import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useTenant } from '../hooks/useTenant';
import { supabase } from '../lib/supabase';
import { useSuperAdmin } from '../hooks/useSuperAdmin';
import { invitesApi } from '../lib/api';
import NoAccess from '../pages/NoAccess';
import CreateTenant from '../pages/CreateTenant';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Building2, Store, Shield } from 'lucide-react';
import { TenantLoadingBar } from './TenantLoadingBar';

type OnboardingStep = 'loading' | 'choice' | 'ready';

// Lightweight perf flag (can be toggled without external libs)
const DEBUG_PERF = import.meta.env.DEV && false;

export function OnboardingRouter({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { tenants, isLoading, refetchTenants } = useTenant();
  const isOnboardingRoute = location.pathname === '/onboarding';
  const isAdminRoute = location.pathname === '/admin';
  const isAdminContext = isAdminRoute || isOnboardingRoute;
  // Check super admin both on /admin and on /onboarding (כדי שכפתור ניהול יופיע במסך האונבורדינג)
  const { data: isSuperAdmin } = useSuperAdmin(isAdminContext);
  const hasCheckedInvitesRef = useRef(false);
  const mountTimeRef = useRef<number | null>(null);

  // Capture mount time once for "time to ready UI" measurement (inside an effect to keep render pure)
  useEffect(() => {
    if (!DEBUG_PERF || mountTimeRef.current !== null || typeof performance === 'undefined') return;
    mountTimeRef.current = performance.now();
  }, []);

  // Accept tenant invites in the background, ONLY when user actually has an invite token in URL.
  useEffect(() => {
    if (!isOnboardingRoute || hasCheckedInvitesRef.current) return;

    const search = location.search || '';
    const params = new URLSearchParams(search);
    const hasInviteParam =
      params.has('invite') || params.has('token') || params.has('invite_token');

    // No invite in URL -> completely skip /api/invites/accept (saves an extra network roundtrip)
    if (!hasInviteParam) return;

    const checkInvites = async () => {
      hasCheckedInvitesRef.current = true;
      try {
        const { accepted } = await invitesApi.accept();
        // Only refetch tenants if an invite was actually accepted
        if (accepted) {
          await refetchTenants();
        }
      } catch (error) {
        // Best-effort: ignore errors (404, network, etc.)
        const errorMessage =
          error && typeof error === 'object' && 'message' in error
            ? String((error as { message?: string }).message)
            : '';
        if (errorMessage && !errorMessage.includes('404') && !errorMessage.includes('Not Found')) {
          console.log('Error accepting invites (non-blocking):', errorMessage);
        }
      }
    };

    checkInvites();
  }, [isOnboardingRoute, location.search, refetchTenants]);

  // Derive the current onboarding step purely from query state.
  const step: OnboardingStep = (() => {
    // IMPORTANT: React Query's `isLoading` is only true when there's no cached data.
    // This means cached tenants from a previous session will be treated as "ready"
    // and we won't block the UI on background refetches.
    if (isLoading) return 'loading';

    // Super admin can access admin page even without tenants
    if (isSuperAdmin === true && location.pathname === '/admin') return 'ready';

    if (tenants.length >= 1) return 'ready';

    return 'choice';
  })();

  const showTenantLoadingUi = isLoading || step === 'loading';

  const withTenantLoader = (node: React.ReactNode) => (
    <>
      {showTenantLoadingUi && <TenantLoadingBar />}
      {node}
    </>
  );

  // Log time from app mount to "ready" UI (first time step becomes 'ready')
  useEffect(() => {
    if (!DEBUG_PERF || !mountTimeRef.current || typeof performance === 'undefined') return;
    if (step === 'ready') {
      const dt = performance.now() - mountTimeRef.current;
      console.log('[perf] onboarding ready in', Math.round(dt), 'ms');
    }
  }, [step]);

  const renderOnboardingChoice = (isInitialLoading: boolean) =>
    withTenantLoader(
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-center">ברוכים הבאים ל-Stockly</CardTitle>
            <CardDescription className="text-center">
              {isInitialLoading ? 'טוען חנויות קיימות…' : 'בחר את האפשרות המתאימה לך'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Super Admin Option - Only visible to super admin (fuad@owner.com) */}
            {isSuperAdmin === true && (
              <Button
                onClick={() => navigate('/admin')}
                className="w-full h-auto p-6 flex flex-col items-start gap-3 bg-primary border-2 border-primary"
                size="lg"
                variant="default"
                disabled={isInitialLoading}
              >
                <div className="flex items-center gap-3 w-full">
                  <Shield className="w-6 h-6" />
                  <div className="flex-1 text-right">
                    <div className="font-semibold text-lg">ניהול מערכת</div>
                    <div className="text-sm opacity-90">
                      גש לדף הניהול - צפה בכל החנויות והמשתמשים
                    </div>
                  </div>
                </div>
              </Button>
            )}

            <Button
              onClick={() => navigate('/create-tenant')}
              className="w-full h-auto p-6 flex flex-col items-start gap-3"
              size="lg"
              variant={isSuperAdmin ? 'outline' : 'default'}
              disabled={isInitialLoading}
            >
              <div className="flex items-center gap-3 w-full">
                <Building2 className="w-6 h-6" />
                <div className="flex-1 text-right">
                  <div className="font-semibold text-lg">זה חנות חדשה</div>
                  <div className="text-sm opacity-90">צור חנות חדשה והתחל לנהל אותה</div>
                </div>
              </div>
            </Button>

            <Button
              onClick={() => navigate('/no-access')}
              variant="outline"
              className="w-full h-auto p-6 flex flex-col items-start gap-3"
              size="lg"
              disabled={isInitialLoading}
            >
              <div className="flex items-center gap-3 w-full">
                <Store className="w-6 h-6" />
                <div className="flex-1 text-right">
                  <div className="font-semibold text-lg">זה חנות קיימת</div>
                  <div className="text-sm opacity-90">
                    קבל הזמנה מבעל החנות כדי לקבל גישה
                  </div>
                </div>
              </div>
            </Button>

            <div className="pt-2 border-t border-border flex flex-col gap-2">
              <p className="text-xs text-muted-foreground text-center">
                התחברת עם אימייל לא נכון?
              </p>
              <Button
                variant="ghost"
                className="w-full text-sm"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate('/login', { replace: true });
                }}
                disabled={isInitialLoading}
              >
                החלף משתמש (יציאה והתחברות מחדש)
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );

  // Handle specific routes
  if (location.pathname === '/create-tenant') {
    return withTenantLoader(<CreateTenant />);
  }
  if (location.pathname === '/no-access') {
    return withTenantLoader(<NoAccess />);
  }

  // Super admin can access /admin even without tenants
  if (isSuperAdmin === true && location.pathname === '/admin') {
    return withTenantLoader(<>{children}</>);
  }

  // User has tenants - show main app immediately (no setTimeout delays)
  if (step === 'ready') {
    if (tenants.length > 0) {
      return withTenantLoader(<>{children}</>);
    }
    // If step is ready but no tenants, something went wrong - show choice
    // This shouldn't happen, but handle gracefully
    return <Navigate to="/onboarding" replace />;
  }

  // If we're still loading and user is on /onboarding, show the onboarding UI but in "loading" mode
  if (step === 'loading' && isOnboardingRoute) {
    return renderOnboardingChoice(true);
  }

  // Choice screen - new store vs existing store
  if (step === 'choice') {
    // Redirect to onboarding if not already there
    if (location.pathname !== '/onboarding') {
      return <Navigate to="/onboarding" replace />;
    }

    return renderOnboardingChoice(false);
  }

  // While still loading tenants and not on /onboarding, render the app (children) with a subtle loader
  if (step === 'loading') {
    return withTenantLoader(<>{children}</>);
  }

  // Default: redirect to onboarding
  return <Navigate to="/onboarding" replace />;
}
