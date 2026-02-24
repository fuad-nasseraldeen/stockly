import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';
import { tenantsApi } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Building2, Loader2 } from 'lucide-react';
import { FlatPageLayout } from '../components/layout/FlatPageLayout';

export default function CreateTenant() {
  const navigate = useNavigate();
  const { setCurrentTenant, refetchTenants } = useTenant();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('חובה להזין שם חנות');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tenant = await tenantsApi.create({ name: name.trim() });
      
      // Set as current tenant
      setCurrentTenant(tenant);
      
      // Refetch tenants list
      await refetchTenants();
      
      // Navigate to products
      navigate('/products');
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
