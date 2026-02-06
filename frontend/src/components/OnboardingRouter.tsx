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
import { Building2, Store, Loader2, Shield } from 'lucide-react';

type OnboardingStep = 'loading' | 'choice' | 'ready';

export function OnboardingRouter({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { tenants, isLoading, refetchTenants } = useTenant();
  const isAdminRoute = location.pathname === '/admin';
  const isOnboardingRoute = location.pathname === '/onboarding';
  // Only check super admin when on admin route (non-blocking)
  const { data: isSuperAdmin } = useSuperAdmin(isAdminRoute);
  const hasCheckedInvitesRef = useRef(false);

  // Only call invitesApi.accept when on /onboarding route (non-blocking, best-effort)
  useEffect(() => {
    if (!isOnboardingRoute || hasCheckedInvitesRef.current || isLoading) return;

    const checkInvites = async () => {
      hasCheckedInvitesRef.current = true;
      try {
        await invitesApi.accept();
        // Only refetch tenants if an invite was actually accepted
        await refetchTenants();
      } catch (error) {
        // Best-effort: ignore errors (404, network, etc.)
        // Don't log 404 errors to reduce console noise
        const errorMessage = error && typeof error === 'object' && 'message' in error ? String((error as { message?: string }).message) : '';
        if (errorMessage && !errorMessage.includes('404') && !errorMessage.includes('Not Found')) {
          console.log('Error accepting invites (non-blocking):', errorMessage);
        }
      }
    };

    checkInvites();
  }, [isOnboardingRoute, isLoading, refetchTenants]);

  // Derive the current onboarding step purely from query state.
  // Only block on tenants loading; super admin check is non-blocking.
  const step: OnboardingStep = (() => {
    if (isLoading) return 'loading';

    // Super admin can access admin page even without tenants
    if (isSuperAdmin === true && location.pathname === '/admin') return 'ready';

    if (tenants.length >= 1) return 'ready';

    return 'choice';
  })();

  // Show loading state ONLY while we fetch tenants the first time.
  // Do NOT block on checkingSuperAdmin (it's non-blocking and gated by enabled flag).
  if (isLoading || step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">בודק גישה...</p>
        </div>
      </div>
    );
  }

  // Handle specific routes
  if (location.pathname === '/create-tenant') {
    return <CreateTenant />;
  }
  if (location.pathname === '/no-access') {
    return <NoAccess />;
  }

  // Super admin can access /admin even without tenants
  if (isSuperAdmin === true && location.pathname === '/admin') {
    return <>{children}</>;
  }

  // User has tenants - show main app immediately (no setTimeout delays)
  if (step === 'ready') {
    if (tenants.length > 0) {
      return <>{children}</>;
    }
    // If step is ready but no tenants, something went wrong - show choice
    // This shouldn't happen, but handle gracefully
    return <Navigate to="/onboarding" replace />;
  }

  // Choice screen - new store vs existing store
  if (step === 'choice') {
    // Redirect to onboarding if not already there
    if (location.pathname !== '/onboarding') {
      return <Navigate to="/onboarding" replace />;
    }
    
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-center">ברוכים הבאים ל-Stockly</CardTitle>
            <CardDescription className="text-center">
              בחר את האפשרות המתאימה לך
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
              >
                <div className="flex items-center gap-3 w-full">
                  <Shield className="w-6 h-6" />
                  <div className="flex-1 text-right">
                    <div className="font-semibold text-lg">ניהול מערכת</div>
                    <div className="text-sm opacity-90">גש לדף הניהול - צפה בכל החנויות והמשתמשים</div>
                  </div>
                </div>
              </Button>
            )}

            <Button
              onClick={() => navigate('/create-tenant')}
              className="w-full h-auto p-6 flex flex-col items-start gap-3"
              size="lg"
              variant={isSuperAdmin ? "outline" : "default"}
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
            >
              <div className="flex items-center gap-3 w-full">
                <Store className="w-6 h-6" />
                <div className="flex-1 text-right">
                  <div className="font-semibold text-lg">זה חנות קיימת</div>
                  <div className="text-sm opacity-90">קבל הזמנה מבעל החנות כדי לקבל גישה</div>
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
              >
                החלף משתמש (יציאה והתחברות מחדש)
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Default: redirect to onboarding
  return <Navigate to="/onboarding" replace />;
}
