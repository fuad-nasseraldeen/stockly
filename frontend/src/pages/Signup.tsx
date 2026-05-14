import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { authApi } from '../lib/api';
import { Button } from '../components/ui/button';
import { GoogleIcon } from '../components/ui/google-icon';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { StocklyMark } from '../components/layout/StocklyMark';
import { CheckCircle2, Lock, Mail, Phone, Sparkles, UserRound } from 'lucide-react';

export default function Signup() {
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
      await authApi.requestOtp(phone, null, { flow: 'signup', email: email.trim() });
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
      await authApi.requestOtp(phone, null, { flow: 'signup', email: email.trim() });
      setResendIn(60);
      setInfo('קוד אימות נשלח שוב');
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'שגיאה בשליחת קוד'));
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div dir="ltr" className="mx-auto grid min-h-screen max-w-[1400px] lg:grid-cols-2">
        <section dir="rtl" className="flex items-center justify-center px-4 py-8 sm:px-8 lg:p-12">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6 space-y-3 text-center">
              <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-[#edf2ff] px-3 py-1 text-xs font-semibold text-[#2f66e0]">
                <Sparkles className="h-3.5 w-3.5" />
                חשבון חדש תוך דקה
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                הרשמה ל-Stockly
              </h1>
              <p className="text-sm text-slate-600 sm:text-base">
                פתיחת חשבון מהירה עם Google או עם מספר טלפון וקוד אימות
              </p>
            </div>

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
            <Button type="button" variant="outline" className="w-full border-slate-300 text-slate-900 [&_svg]:size-[15px]" onClick={handleGoogleSignup} disabled={googleLoading}>
          {googleLoading ? (
            'מעביר ל-Google...'
          ) : (
            <span className="inline-flex items-center gap-2 flex-row-reverse">
                  הרשמה עם Google
              <GoogleIcon />
            </span>
          )}
        </Button>
            <div className="my-5 flex items-center gap-2 text-xs text-slate-500">
              <span className="h-px flex-1 bg-slate-200" />
          <span>או הרשמה עם טלפון</span>
              <span className="h-px flex-1 bg-slate-200" />
        </div>

            <form onSubmit={otpStep === 'details' ? handleRequestOtpSignup : handleSignupWithOtp} className="space-y-3">
          {otpStep === 'details' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="firstName">שם פרטי</Label>
                    <div className="relative">
                      <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required placeholder="ישראל" className="h-12 border-slate-200 ps-10" />
                      <UserRound className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">שם משפחה</Label>
                    <div className="relative">
                      <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required placeholder="ישראלי" className="h-12 border-slate-200 ps-10" />
                      <UserRound className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">אימייל</Label>
                    <div className="relative">
                      <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@example.com" className="h-12 border-slate-200 ps-10" />
                      <Mail className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">סיסמה</Label>
                    <div className="relative">
                      <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="לפחות 6 תווים" className="h-12 border-slate-200 ps-10" />
                      <Lock className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">מספר טלפון</Label>
                    <div className="relative">
                      <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="05XXXXXXXX" className="h-12 border-slate-200 ps-10" />
                      <Phone className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
              </div>

                  <Button type="submit" className="h-12 w-full bg-[#2f66e0] text-white hover:bg-[#2558c9]" disabled={otpLoading}>
                {otpLoading ? 'שולח קוד...' : 'שלח קוד אימות להרשמה'}
              </Button>
                  <p className="pt-1 text-center text-sm text-slate-600">
                    בהרשמה למערכת את/ה מאשר/ת את{' '}
                    <Link to="/terms" className="font-bold uppercase text-slate-900 underline hover:text-[#2f66e0]">
                      תנאי השימוש
                    </Link>
                    .
                  </p>
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
                      className="h-12 border-slate-200"
                />
              </div>
                  <Button type="submit" className="h-12 w-full bg-[#2f66e0] text-white hover:bg-[#2558c9]" disabled={otpLoading || otpCode.length !== 6}>
                {otpLoading ? 'משלים הרשמה...' : 'אמת והשלם הרשמה'}
              </Button>
                  <Button type="button" variant="outline" className="h-12 w-full border-slate-300" disabled={otpLoading || resendIn > 0} onClick={handleResendOtp}>
                {resendIn > 0 ? `שלח שוב בעוד ${resendIn} שניות` : 'שלח קוד שוב'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                    className="h-12 w-full"
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

            <div className="mt-5 text-center text-sm">
              <span className="text-slate-600">כבר יש לך חשבון? </span>
              <Link to="/login" className="font-semibold text-[#2f66e0] hover:underline">
            התחבר כאן
          </Link>
            </div>
          </div>
        </section>

        <section dir="rtl" className="relative hidden overflow-hidden lg:flex">
          <div className="absolute inset-0 bg-gradient-to-b from-[#ecf2ff] via-[#f4f7ff] to-[#ffffff]" />
          <div className="absolute -start-20 top-20 h-72 w-72 rounded-full bg-[#2f66e0]/10 blur-3xl" />
          <div className="absolute -end-16 bottom-16 h-72 w-72 rounded-full bg-[#18b0a7]/10 blur-3xl" />
          <div className="relative z-10 flex w-full items-center justify-center p-10">
            <div className="max-w-md space-y-6 text-center text-slate-800">
              <StocklyMark size={64} className="mx-auto" />
              <h2 className="text-4xl font-extrabold leading-tight tracking-tight">
                מערכת אחת לכל ניהול
                <span className="block text-[#2f66e0]">המלאי והמחירים שלך</span>
              </h2>
              <p className="text-lg text-slate-600">
                קליטה מהירה, יבוא קבצים, חישובי מחיר מדויקים וניהול ספקים במקום אחד.
              </p>
              <div className="space-y-3 rounded-2xl border border-white/80 bg-white/80 p-5 text-right shadow-sm backdrop-blur">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-[#2f66e0]" />
                  <p className="text-sm">ייבוא Excel ו-PDF עם preview חכם לפני שמירה</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-[#2f66e0]" />
                  <p className="text-sm">היסטוריית מחירים מדויקת עם תמיכה במע&quot;מ ומרווח</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-[#2f66e0]" />
                  <p className="text-sm">עבודה נוחה לצוותים עם הרשאות ו-multi-tenant</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
