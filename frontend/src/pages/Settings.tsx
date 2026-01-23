import { useState, useEffect } from 'react';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Eye, EyeOff } from 'lucide-react';

export default function Settings() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();

  const [vat, setVat] = useState<string>(() =>
    settings?.vat_percent != null ? String(settings.vat_percent) : ''
  );
  const [margin, setMargin] = useState<string>('');

  const [userEmail, setUserEmail] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        setUserEmail(session.user.email);
      }
    });
  }, []);

  const [savingVat, setSavingVat] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleSaveVat = async (): Promise<void> => {
    const vatValue = vat.trim() ? Number(vat) : NaN;
    if (Number.isNaN(vatValue) || vatValue < 0 || vatValue > 100) {
      setProfileMessage('מע״מ חייב להיות בין 0 ל‑100');
      return;
    }
    try {
      setSavingVat(true);
      setProfileMessage(null);
      await updateSettings.mutateAsync({ vat_percent: vatValue });
    } catch (error) {
      console.error('Error updating settings:', error);
      setProfileMessage('שגיאה בעדכון הגדרות מס/רווח');
    } finally {
      setSavingVat(false);
    }
  };

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

  return (
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vatPercent">מע&quot;מ (%)</Label>
              <Input
                id="vatPercent"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={vat}
                onChange={(e) => setVat(e.target.value)}
                placeholder={settings?.vat_percent != null ? String(settings.vat_percent) : '18'}
              />
              <p className="text-xs text-muted-foreground">
                ערך זה ישמש כברירת מחדל לחישוב מחיר מכירה בכל המערכת.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="globalMargin">אחוז רווח גלובלי (אופציונלי)</Label>
              <Input
                id="globalMargin"
                type="number"
                min="0"
                max="500"
                step="0.1"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
                placeholder="לדוגמה: 30"
              />
              <p className="text-xs text-muted-foreground">
                ערך זה יכול לשמש כברירת מחדל כשאין קטגוריה עם רווח מוגדר (כרגע לשימוש תצוגתי בלבד).
              </p>
            </div>
          </div>
          <Button onClick={handleSaveVat} disabled={savingVat || isLoading}>
            {savingVat ? 'שומר...' : 'שמור הגדרות מחירים'}
          </Button>
        </CardContent>
      </Card>

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
                placeholder="שם מלא חדש (אופציונלי)"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">סיסמה חדשה</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="סיסמה חדשה (אופציונלי)"
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
        </CardContent>
      </Card>
    </div>
  );
}

