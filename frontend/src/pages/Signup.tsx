import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { authApi } from '../lib/api';
import { Turnstile } from '@marsidev/react-turnstile';
import { Button } from '../components/ui/button';
import { GoogleIcon } from '../components/ui/google-icon';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { FlatPageLayout } from '../components/layout/FlatPageLayout';

export default function Signup() {
  const turnstileSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '').trim();
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpStep, setOtpStep] = useState<'details' | 'code'>('details');
  const [resendIn, setResendIn] = useState(0);
  const [otpTurnstileToken, setOtpTurnstileToken] = useState<string | null>(null);
  const [captchaConfirmed, setCaptchaConfirmed] = useState(false);
  const navigate = useNavigate();
  const oauthRedirectTo = (() => {
    const configured = (import.meta.env.VITE_APP_URL ?? '').trim().replace(/\/+$/, '');
    if (configured) return configured;
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1') {
        return window.location.origin.replace(/\/+$/, '');
      }
      if (host.endsWith('stockly-il.com')) {
        return 'https://www.stockly-il.com';
      }
      return window.location.origin.replace(/\/+$/, '');
    }
    return 'https://www.stockly-il.com';
  })();

  const toErrorMessage = (err: unknown, fallback: string): string => {
    if (err instanceof Error && err.message) {
      const raw = err.message.toLowerCase();
      if (raw.includes('email already exists') || raw.includes('כתובת האימייל כבר קיימת')) {
        return 'כתובת האימייל כבר קיימת במערכת.';
      }
      if (raw.includes('phone already exists') || raw.includes('מספר הטלפון כבר קיים')) {
        return 'מספר הטלפון כבר קיים במערכת. אפשר להתחבר לחשבון הקיים.';
      }
      if (raw.includes('security_check_failed')) {
        return 'אימות האבטחה נכשל. נא לנסות שוב.';
      }
      return err.message;
    }
    return fallback;
  };

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => {
      setResendIn((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  const handleGoogleSignup = async () => {
    setError('');
    setInfo('');
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

  const handleRequestOtpSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setOtpLoading(true);

    try {
      if (!firstName.trim()) throw new Error('נא להזין שם פרטי');
      if (!lastName.trim()) throw new Error('נא להזין שם משפחה');
      if (!email.trim()) throw new Error('נא להזין אימייל');
      if (!password.trim() || password.trim().length < 6) throw new Error('הסיסמה חייבת להכיל לפחות 6 תווים');
      if (turnstileSiteKey && !otpTurnstileToken) throw new Error('נא להשלים אימות אבטחה לפני שליחת הקוד');
      if (turnstileSiteKey && !captchaConfirmed) throw new Error('יש לאשר ידנית את אימות האבטחה לפני שליחת הקוד');

      await authApi.requestOtp(phone, otpTurnstileToken, { flow: 'signup', email: email.trim() });
      setOtpStep('code');
      setResendIn(60);
      setInfo('קוד אימות נשלח לטלפון שלך');
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'שגיאה בשליחת קוד'));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSignupWithOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setOtpLoading(true);

    try {
      const result = await authApi.signupWithOtp({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password: password.trim(),
        phone,
        code: otpCode,
      });

      const accessToken = result?.session?.access_token;
      const refreshToken = result?.session?.refresh_token;
      if (!accessToken || !refreshToken) {
        throw new Error('לא התקבלה התחברות תקינה מהשרת');
      }

      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (setSessionError) throw setSessionError;
      navigate('/');
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'שגיאה בהשלמת ההרשמה'));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendIn > 0) return;
    setError('');
    setInfo('');
    setOtpLoading(true);

    try {
      if (turnstileSiteKey && !otpTurnstileToken) throw new Error('נא להשלים אימות אבטחה לפני שליחת הקוד');
      if (turnstileSiteKey && !captchaConfirmed) throw new Error('יש לאשר ידנית את אימות האבטחה לפני שליחת הקוד');
      await authApi.requestOtp(phone, otpTurnstileToken, { flow: 'signup', email: email.trim() });
      setResendIn(60);
      setInfo('קוד אימות נשלח שוב');
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'שגיאה בשליחת קוד'));
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <FlatPageLayout
      title="הרשמה"
      description="אפשר להירשם עם Google או עם טלפון"
      maxWidthClass="max-w-md"
    >
      <div className="rounded-xl border border-border bg-card/60 p-4">
        {error ? (
          <div className="mb-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {info ? (
          <div className="mb-3 rounded-md bg-primary/10 p-3 text-sm text-primary">
            {info}
          </div>
        ) : null}
        <Button type="button" className="w-full [&_svg]:size-[15px]" onClick={handleGoogleSignup} disabled={googleLoading}>
          {googleLoading ? (
            'מעביר ל-Google...'
          ) : (
            <span className="inline-flex items-center gap-2 flex-row-reverse">
              המשך עם Google
              <GoogleIcon />
            </span>
          )}
        </Button>
        <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>או הרשמה עם טלפון</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={otpStep === 'details' ? handleRequestOtpSignup : handleSignupWithOtp} className="space-y-3">
          {otpStep === 'details' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="firstName">שם פרטי</Label>
                <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required placeholder="ישראל" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">שם משפחה</Label>
                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required placeholder="ישראלי" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">אימייל</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">סיסמה</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="לפחות 6 תווים" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">מספר טלפון</Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="05XXXXXXXX" />
              </div>

              {turnstileSiteKey ? (
                <div className="flex justify-center">
                  <div className="w-full max-w-[320px]">
                    <Turnstile
                      siteKey={turnstileSiteKey}
                      onSuccess={(token) => {
                        setOtpTurnstileToken(token);
                        setCaptchaConfirmed(false);
                      }}
                      onExpire={() => {
                        setOtpTurnstileToken(null);
                        setCaptchaConfirmed(false);
                      }}
                      onError={() => {
                        setOtpTurnstileToken(null);
                        setCaptchaConfirmed(false);
                      }}
                      options={{
                        language: 'he',
                        theme: 'light',
                        size: 'flexible',
                        appearance: 'always',
                      }}
                    />
                  </div>
                </div>
              ) : null}
              {turnstileSiteKey ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={captchaConfirmed}
                    onChange={(e) => setCaptchaConfirmed(e.target.checked)}
                    disabled={!otpTurnstileToken}
                  />
                  <span>אישרתי ידנית את אימות האבטחה</span>
                </label>
              ) : null}

              <Button type="submit" className="w-full" disabled={otpLoading}>
                {otpLoading ? 'שולח קוד...' : 'שלח קוד אימות להרשמה'}
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="otp-code">קוד אימות</Label>
                <Input
                  id="otp-code"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  placeholder="6 ספרות"
                />
              </div>
              <Button type="submit" className="w-full" disabled={otpLoading || otpCode.length !== 6}>
                {otpLoading ? 'משלים הרשמה...' : 'אמת והשלם הרשמה'}
              </Button>
              <Button type="button" variant="outline" className="w-full" disabled={otpLoading || resendIn > 0} onClick={handleResendOtp}>
                {resendIn > 0 ? `שלח שוב בעוד ${resendIn} שניות` : 'שלח קוד שוב'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setOtpStep('details');
                  setOtpCode('');
                  setInfo('');
                  setError('');
                }}
              >
                חזרה לפרטים
              </Button>
            </>
          )}
        </form>

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
