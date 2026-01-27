import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../contexts/TenantContext';
import { invitesApi } from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { AlertCircle, RefreshCw, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function NoAccess() {
  const navigate = useNavigate();
  const { refetchTenants } = useTenant();
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Get user email
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email || null);
    });
  }, []);

  const handleCheckAgain = async () => {
    setLoading(true);
    try {
      // Accept any pending invites
      await invitesApi.accept();
      
      // Refetch tenants
      await refetchTenants();
      
      // If tenants were found, they'll be set automatically by TenantContext
      // and OnboardingRouter will navigate
    } catch (error: any) {
      console.error('Error checking invites:', error);
      // Ignore errors - just refetch tenants
      await refetchTenants();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <div>
              <CardTitle>אין גישה לחנות</CardTitle>
              <CardDescription>אין לך גישה לחנות במערכת</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-muted-foreground">
              כדי לקבל גישה לחנות קיימת, נא לבקש מבעל החנות להזמין אותך.
            </p>
            
            {userEmail && (
              <div className="p-3 bg-muted rounded-lg border-2 border-border">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">כתובת האימייל שלך:</span>
                </div>
                <p className="font-medium mt-1 break-all">{userEmail}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  שלח את כתובת האימייל הזו לבעל החנות כדי לקבל הזמנה
                </p>
              </div>
            )}

            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                <strong>הוראות:</strong>
              </p>
              <ol className="text-sm text-blue-800 dark:text-blue-200 mt-2 space-y-1 list-decimal list-inside">
                <li>צור קשר עם בעל החנות</li>
                <li>בקש ממנו להזמין את כתובת האימייל שלך</li>
                <li>לחץ על "בדוק שוב" לאחר שתקבל הזמנה</li>
              </ol>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={handleCheckAgain}
              disabled={loading}
              className="w-full gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  בודק...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  בדוק שוב
                </>
              )}
            </Button>
            
            <Button
              variant="outline"
              onClick={() => navigate('/onboarding')}
              className="w-full"
            >
              חזור
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

