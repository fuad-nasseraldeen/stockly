import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { authApi } from '../lib/api';
import { Turnstile } from '@marsidev/react-turnstile';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { FlatPageLayout } from '../components/layout/FlatPageLayout';

export default function Login() {
  const turnstileSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '').trim();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpStep, setOtpStep] = useState<'phone' | 'code'>('phone');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [genericInfo, setGenericInfo] = useState('');
  const [otpTurnstileToken, setOtpTurnstileToken] = useState<string | null>(null);
  const [captchaConfirmed, setCaptchaConfirmed] = useState(false);
  const navigate = useNavigate();
  const oauthRedirectTo = (() => {
    const configured = (import.meta.env.VITE_APP_URL ?? '').trim().replace(/\/+$/, '');
    if (configured) return `${configured}/`;
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1') {
        return `${window.location.origin.replace(/\/+$/, '')}/`;
      }
      if (host.endsWith('stockly-il.com')) {
        return 'https://www.stockly-il.com/';
      }
      return `${window.location.origin.replace(/\/+$/, '')}/`;
    }
    return 'https://www.stockly-il.com/';
  })();

  const toErrorMessage = (err: unknown, fallback: string): string => {
    if (err instanceof Error && err.message) {
      const raw = err.message.toLowerCase();
      if (raw.includes('invalid login credentials')) {
        return 'האימייל לא רשום במערכת או שהסיסמה שגויה.';
      }
      if (err.message.includes('SECURITY_CHECK_FAILED')) {
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

  const handleGoogleLogin = async () => {
    setError('');
    setGenericInfo('');
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
      setError(toErrorMessage(err, 'שגיאה בהתחברות עם Google'));
      setGoogleLoading(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setGenericInfo('');
    setOtpLoading(true);

    try {
      if (turnstileSiteKey && !otpTurnstileToken) {
        throw new Error('נא להשלים אימות אבטחה לפני שליחת הקוד');
      }
      if (turnstileSiteKey && !captchaConfirmed) {
        throw new Error('יש לאשר ידנית את אימות האבטחה לפני שליחת הקוד');
      }
      await authApi.requestOtp(phone, otpTurnstileToken);
      setOtpStep('code');
      setResendIn(60);
      setGenericInfo('If the number is valid, you’ll receive a code');
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'שגיאה בשליחת קוד'));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOtpLoading(true);

    try {
      const result = await authApi.verifyOtp(phone, otpCode);
      const accessToken = result?.session?.access_token;
      const refreshToken = result?.session?.refresh_token;

      if (!accessToken || !refreshToken) {
        throw new Error('לא התקבלה התחברות תקינה מהשרת');
      }

      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (setSessionError) {
        throw setSessionError;
      }

      navigate('/');
    } catch {
      setError('קוד לא תקין או שפג תוקף הקוד');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0) return;
    setError('');
    setGenericInfo('');
    setOtpLoading(true);

    try {
      if (turnstileSiteKey && !otpTurnstileToken) {
        throw new Error('נא להשלים אימות אבטחה לפני שליחת הקוד');
      }
      if (turnstileSiteKey && !captchaConfirmed) {
        throw new Error('יש לאשר ידנית את אימות האבטחה לפני שליחת הקוד');
      }
      await authApi.requestOtp(phone, otpTurnstileToken);
      setResendIn(60);
      setGenericInfo('If the number is valid, you’ll receive a code');
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'שגיאה בשליחת קוד'));
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <FlatPageLayout
      title={`היי,\nטוב לראות אותך שוב`}
      description="המשך עם Google או טלפון"
      maxWidthClass="max-w-md"
      titleClassName="whitespace-pre-line text-3xl font-semibold tracking-tight text-center leading-tight"
      descriptionClassName="mt-1 text-sm text-muted-foreground text-center"
    >
      <div className="rounded-xl border border-border bg-card/60 p-4">
          <div className="mb-3">
            <Button type="button" variant="outline" className="w-full" onClick={handleGoogleLogin} disabled={googleLoading}>
              {googleLoading ? 'מעביר ל-Google...' : 'המשך עם Google'}
            </Button>
          </div>
          <form onSubmit={otpStep === 'phone' ? handleRequestOtp : handleVerifyOtp} className="space-y-4 mt-4">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}
            {genericInfo && (
              <div className="p-3 text-sm text-primary bg-primary/10 rounded-md">
                {genericInfo}
              </div>
            )}

            {otpStep === 'phone' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="phone">מספר טלפון</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    placeholder="05XXXXXXXX"
                  />
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
                  {otpLoading ? 'שולח קוד...' : 'שלח קוד אימות'}
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
                  {otpLoading ? 'מאמת...' : 'אמת והתחבר'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={otpLoading || resendIn > 0}
                  onClick={handleResend}
                >
                  {resendIn > 0 ? `שלח שוב בעוד ${resendIn} שניות` : 'שלח קוד שוב'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setOtpStep('phone');
                    setOtpCode('');
                    setGenericInfo('');
                    setError('');
                    setCaptchaConfirmed(false);
                  }}
                >
                  שינוי מספר טלפון
                </Button>
              </>
            )}
            <div className="text-center text-sm">
              <span className="text-muted-foreground">אין לך חשבון? </span>
              <Link to="/signup" className="text-primary hover:underline">
                הירשם כאן
              </Link>
            </div>
          </form>
      </div>
    </FlatPageLayout>
  );
}
