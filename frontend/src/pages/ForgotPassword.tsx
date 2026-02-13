import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Label } from '../components/ui/label';

const GENERIC_SUCCESS_MESSAGE = 'אם האימייל קיים במערכת, נשלח אליו קישור לאיפוס סיסמה.';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        console.error('Failed to request password reset:', error);
      }
    } catch (error) {
      console.error('Unexpected forgot-password error:', error);
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-transparent">
      <Card className="w-full max-w-md shadow-xl border-2 bg-card/95 backdrop-blur">
        <CardHeader>
          <CardTitle>שחזור סיסמה</CardTitle>
          <CardDescription>הזן את האימייל שלך ונשלח קישור לאיפוס סיסמה.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {submitted && (
              <div className="p-3 text-sm text-green-700 bg-green-100 rounded-md">
                {GENERIC_SUCCESS_MESSAGE}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="forgot-email">אימייל</Label>
              <Input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder="your@email.com"
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'שולח...' : 'שלח קישור לאיפוס'}
            </Button>

            <div className="text-center text-sm">
              <Link to="/login" className="text-primary hover:underline">
                חזרה להתחברות
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
