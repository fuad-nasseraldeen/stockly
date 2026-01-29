import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';
import { tenantsApi } from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Building2, Loader2 } from 'lucide-react';

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
    } catch (err: any) {
      console.error('Create tenant error:', err);
      const errorMessage = err?.message || 'שגיאה ביצירת חנות';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Building2 className="w-8 h-8 text-primary" />
            <div>
              <CardTitle>צור חנות חדשה</CardTitle>
              <CardDescription>התחל לנהל את החנות שלך</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
