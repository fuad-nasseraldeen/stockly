import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';
import { subscriptionApi, tenantsApi } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Building2, Loader2 } from 'lucide-react';
import { FlatPageLayout } from '../components/layout/FlatPageLayout';

export default function CreateTenant() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setCurrentTenant, refetchTenants } = useTenant();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialPlan = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const queryPlan = params.get('plan');
    if (queryPlan === 'monthly_199' || queryPlan === 'annual_49' || queryPlan === 'trial_free') return queryPlan;
    const stored = localStorage.getItem('stockly:selected-plan');
    if (stored === 'monthly_199' || stored === 'annual_49' || stored === 'trial_free') return stored;
    return 'trial_free';
  }, [location.search]);
  const [plan, setPlan] = useState<'trial_free' | 'monthly_199' | 'annual_49'>(initialPlan);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('חובה להזין שם חנות');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tenant = await tenantsApi.create({ name: name.trim(), initial_plan: plan });
      
      // Set as current tenant
      setCurrentTenant(tenant);
      
      // Refetch tenants list
      await refetchTenants();
      
      if (plan === 'trial_free') {
        localStorage.removeItem('stockly:selected-plan');
        navigate('/products');
        return;
      }

      const checkout = await subscriptionApi.createCheckoutSession(plan);
      if (!checkout?.url) {
        throw new Error('לא התקבל קישור תשלום מ-Stripe');
      }
      localStorage.removeItem('stockly:selected-plan');
      window.location.href = checkout.url;
    } catch (err: unknown) {
      console.error('Create tenant error:', err);
      const errorMessage = err instanceof Error ? err.message : 'שגיאה ביצירת חנות';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <FlatPageLayout
      title="צור חנות חדשה"
      description="התחל לנהל את החנות שלך"
      maxWidthClass="max-w-md"
    >
      <div className="w-full rounded-xl border border-border bg-card/60 p-5">
        <div className="mb-4">
          <div className="flex items-center gap-3">
            <Building2 className="w-8 h-8 text-primary" />
            <div>
              <h2 className="text-xl font-semibold">צור חנות חדשה</h2>
              <p className="text-sm text-muted-foreground">התחל לנהל את החנות שלך</p>
            </div>
          </div>
        </div>
        <div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">שם החנות *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="לדוגמה: סופרמרקט המרכז"
                required
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>בחר מסלול</Label>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => setPlan('trial_free')}
                  className={`rounded-lg border p-3 text-right ${plan === 'trial_free' ? 'border-primary bg-primary/5' : 'border-border'}`}
                >
                  <p className="font-semibold">חודש ניסיון חינם</p>
                  <p className="text-xs text-muted-foreground">ללא כרטיס אשראי, עם תזכורות חכמות</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPlan('monthly_199')}
                  className={`rounded-lg border p-3 text-right ${plan === 'monthly_199' ? 'border-primary bg-primary/5' : 'border-border'}`}
                >
                  <p className="font-semibold">מנוי חודשי - ₪199</p>
                  <p className="text-xs text-muted-foreground">ניתן לבטל בכל שלב (בסוף תקופת החיוב)</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPlan('annual_49')}
                  className={`rounded-lg border p-3 text-right ${plan === 'annual_49' ? 'border-primary bg-primary/5' : 'border-border'}`}
                >
                  <p className="font-semibold">מסלול שנתי - ₪149 × 12</p>
                  <p className="text-xs text-muted-foreground">חיוב חד פעמי מראש לשנה (₪1,788), ביטול בסוף התקופה או בהסדרת ההפרש</p>
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border-2 border-destructive/20 rounded-lg text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={loading || !name.trim()}
                className="flex-1 gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    יוצר...
                  </>
                ) : (
                  'צור חנות'
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/onboarding')}
                disabled={loading}
              >
                ביטול
              </Button>
            </div>
          </form>
        </div>
      </div>
    </FlatPageLayout>
  );
}
