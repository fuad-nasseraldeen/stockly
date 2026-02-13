import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Label } from '../components/ui/label';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים.');
      return;
    }

    if (password !== confirmPassword) {
      setError('הסיסמאות אינן תואמות.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        console.error('Failed to update password:', updateError);
        setError('לא ניתן לעדכן סיסמה כרגע. נסה שוב.');
        return;
      }

      setSuccess(true);
      setPassword('');
      setConfirmPassword('');
    } catch (unexpectedError) {
      console.error('Unexpected reset-password error:', unexpectedError);
      setError('לא ניתן לעדכן סיסמה כרגע. נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-transparent">
      <Card className="w-full max-w-md shadow-xl border-2 bg-card/95 backdrop-blur">
        <CardHeader>
          <CardTitle>איפוס סיסמה</CardTitle>
          <CardDescription>בחר סיסמה חדשה לחשבון שלך.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 text-sm text-green-700 bg-green-100 rounded-md">
                הסיסמה עודכנה בהצלחה.
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-password">סיסמה חדשה</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">אימות סיסמה</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={6}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'מעדכן...' : 'עדכן סיסמה'}
            </Button>

            {success && (
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">להתחברות</Link>
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
