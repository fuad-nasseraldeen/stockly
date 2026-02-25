import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/button';
import { FlatPageLayout } from '../components/layout/FlatPageLayout';

export default function Signup() {
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const appUrl = (import.meta.env.VITE_APP_URL ?? '').trim().replace(/\/+$/, '');
  const oauthRedirectTo = `${appUrl || window.location.origin}/`;

  const toErrorMessage = (err: unknown, fallback: string): string => {
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  };

  const handleGoogleSignup = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: oauthRedirectTo,
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'שגיאה בהרשמה עם Google'));
      setGoogleLoading(false);
    }
  };

  return (
    <FlatPageLayout
      title="הרשמה"
      description="הרשמה מהירה עם Google בלבד"
      maxWidthClass="max-w-md"
    >
      <div className="rounded-xl border border-border bg-card/60 p-4">
        {error && (
          <div className="mb-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <Button type="button" className="w-full" onClick={handleGoogleSignup} disabled={googleLoading}>
          {googleLoading ? 'מעביר ל-Google...' : 'המשך עם Google'}
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          הרשמה וכניסה נעשות דרך Google בלבד.
        </p>
        <div className="mt-4 text-center text-sm">
          <span className="text-muted-foreground">כבר יש לך חשבון? </span>
          <Link to="/login" className="text-primary hover:underline">
            התחבר כאן
          </Link>
        </div>
      </div>
    </FlatPageLayout>
  );
}
