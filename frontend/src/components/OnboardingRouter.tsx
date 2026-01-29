import { useEffect, useState, useRef } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';
import { invitesApi } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useSuperAdmin } from '../hooks/useSuperAdmin';
import NoAccess from '../pages/NoAccess';
import CreateTenant from '../pages/CreateTenant';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Building2, Store, Loader2, Shield } from 'lucide-react';

type OnboardingStep = 'loading' | 'checking' | 'choice' | 'no-access' | 'create' | 'ready';

export function OnboardingRouter({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { tenants, isLoading, refetchTenants } = useTenant();
  const { data: isSuperAdmin, isLoading: checkingSuperAdmin } = useSuperAdmin();
  const [step, setStep] = useState<OnboardingStep>('loading');
  const [checkingInvites, setCheckingInvites] = useState(false);
  const hasCheckedInvitesRef = useRef(false);

  // Step 1: Accept pending invites and fetch tenants (only once)
  useEffect(() => {
    if (isLoading) {
      setStep('loading');
      return;
    }

    if (hasCheckedInvitesRef.current) {
      return;
    }

    const checkInvitesAndTenants = async () => {
      if (hasCheckedInvitesRef.current) return;
      
      try {
        hasCheckedInvitesRef.current = true;
        setCheckingInvites(true);
        
        // Step 1: Accept any pending invites (best-effort, ignore errors)
        try {
          await invitesApi.accept();
        } catch (error: any) {
          // Ignore 404 or other errors - endpoint might not exist or no invites
          // Don't log 404 errors to reduce console noise
          if (error?.message && !error.message.includes('404') && !error.message.includes('Not Found')) {
            console.log('Error accepting invites:', error.message);
          }
        }

        // Step 2: Refetch tenants after accepting invites
        await refetchTenants();
      } catch (error) {
        console.error('Error in onboarding check:', error);
      } finally {
        setCheckingInvites(false);
      }
    };

    checkInvitesAndTenants();
  }, [isLoading, refetchTenants]);

  // Step 2: Determine next step based on tenants
  useEffect(() => {
    if (isLoading || checkingInvites || checkingSuperAdmin) {
      setStep('loading');
      return;
    }

    // Super admin can access admin page even without tenants
    if (isSuperAdmin === true && location.pathname === '/admin') {
      setStep('ready');
      return;
    }

    if (tenants.length >= 1) {
      // User has tenants - TenantContext will set currentTenant automatically
      // Wait a bit for TenantContext to update currentTenant
      setTimeout(() => {
        setStep('ready');
      }, 100);
    } else if (tenants.length === 0 && step !== 'choice') {
      // No tenants - show choice screen
      setStep('choice');
    }
  }, [tenants, isLoading, checkingInvites, checkingSuperAdmin, isSuperAdmin, location.pathname, step]);

  // Show loading state
  if (step === 'loading' || checkingInvites || checkingSuperAdmin) {
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

  // User has tenants - show main app
  if (step === 'ready') {
    // If we have tenants but no currentTenant yet, TenantContext is still updating
    // Wait a moment and show app anyway (TenantContext will set it)
    if (tenants.length > 0) {
      return <>{children}</>;
    }
    // If step is ready but no tenants, something went wrong - show choice
    setStep('choice');
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
