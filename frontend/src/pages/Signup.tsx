import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { authApi } from '../lib/api';
import { Turnstile } from '@marsidev/react-turnstile';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { FlatPageLayout } from '../components/layout/FlatPageLayout';
import { Eye, EyeOff } from 'lucide-react';

export default function Signup() {
  const turnstileSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '').trim();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpStep, setOtpStep] = useState<'phone' | 'code'>('phone');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [genericInfo, setGenericInfo] = useState('');
  const [otpTurnstileToken, setOtpTurnstileToken] = useState<string | null>(null);
  const navigate = useNavigate();

  const toErrorMessage = (err: unknown, fallback: string): string => {
    if (err instanceof Error && err.message) {
      if (err.message.includes('SECURITY_CHECK_FAILED')) {
        return 'אימות האבטחה נכשל. נא לנסות שוב.';
      }
      return err.message;
    }
    return fallback;
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
      await authApi.requestOtp(phone, otpTurnstileToken);
      setOtpStep('code');
      setResendIn(60);
      setGenericInfo('אם המספר תקין, קוד אימות נשלח אליך');
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'שגיאה בשליחת קוד'));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (otpCode.length !== 6) {
        throw new Error('יש להזין קוד אימות בן 6 ספרות');
      }

      const result = await authApi.signupWithOtp({
        email,
        password,
        fullName,
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

      if (setSessionError) {
        throw setSessionError;
      }

      navigate('/products');
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'שגיאה בהרשמה'));
    } finally {
      setLoading(false);
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
      await authApi.requestOtp(phone, otpTurnstileToken);
      setResendIn(60);
      setGenericInfo('אם המספר תקין, קוד אימות נשלח אליך');
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'שגיאה בשליחת קוד'));
    } finally {
      setOtpLoading(false);
    }
  };

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => {
      setResendIn((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  return (
    <FlatPageLayout
      title="הרשמה"
      description="צור חשבון חדש"
      maxWidthClass="max-w-md"
    >
      <div className="rounded-xl border border-border bg-card/60 p-4">
          <form onSubmit={otpStep === 'phone' ? handleRequestOtp : handleSignup} className="space-y-4">
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
            <div className="space-y-2">
              <Label htmlFor="fullName">שם משתמש</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">אימייל</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">מספר טלפון</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="05XXXXXXXX"
                disabled={otpStep === 'code'}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">סיסמה</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
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
            {otpStep === 'phone' ? (
              <>
                {turnstileSiteKey ? (
                  <div className="flex justify-center">
                    <div className="w-full max-w-[320px]">
                      <Turnstile
                        siteKey={turnstileSiteKey}
                        onSuccess={(token) => setOtpTurnstileToken(token)}
                        onExpire={() => setOtpTurnstileToken(null)}
                        onError={() => setOtpTurnstileToken(null)}
                        options={{
                          language: 'he',
                          theme: 'light',
                          size: 'flexible',
                          appearance: 'interaction-only',
                        }}
                      />
                    </div>
                  </div>
                ) : null}
                <Button type="submit" className="w-full" disabled={otpLoading}>
                  {otpLoading ? 'שולח קוד...' : 'שלח קוד אימות לטלפון'}
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
                <Button type="submit" className="w-full" disabled={loading || otpCode.length !== 6}>
                  {loading ? 'נרשם...' : 'השלם הרשמה'}
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
                  }}
                >
                  שינוי מספר טלפון
                </Button>
              </>
            )}
            <div className="text-center text-sm">
              <span className="text-muted-foreground">כבר יש לך חשבון? </span>
              <Link to="/login" className="text-primary hover:underline">
                התחבר כאן
              </Link>
            </div>
          </form>
      </div>
    </FlatPageLayout>
  );
}
