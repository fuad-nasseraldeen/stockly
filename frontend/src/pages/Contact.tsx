import { useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { Mail, Linkedin, MapPin, Send } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { publicApi } from '../lib/api';
import { PublicTopNav } from '../components/layout/PublicTopNav';
const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '').trim();

export default function Contact() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot field
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStatusMessage('');
    setLoading(true);
    try {
      if (!turnstileToken) {
        throw new Error('נא להשלים אימות אבטחה לפני שליחה');
      }
      await publicApi.contact({ name, email, message, website, turnstileToken });
      setStatusMessage('הפנייה נשלחה בהצלחה. נחזור אליך בהקדם.');
      setName('');
      setEmail('');
      setMessage('');
      setWebsite('');
      setTurnstileToken(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'לא הצלחנו לשלוח כרגע, נסה שוב.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f5f5f7] text-[#0f172a]" dir="rtl">
      <PublicTopNav />
      <header className="border-b border-slate-200 bg-[#e8edf6]">
        <div className="mx-auto max-w-6xl px-6 py-14 text-center">
          <span className="inline-flex rounded-full bg-[#dbe7fb] px-4 py-1 text-sm font-semibold text-[#2f66e0]">
            דברו איתנו
          </span>
          <h1 className="mt-5 text-6xl font-extrabold tracking-tight text-[#0b1f4b]">צור קשר</h1>
          <p className="mx-auto mt-4 max-w-2xl text-2xl text-slate-700">
            שאלה? הצעה? רוצה לדעת עוד? אנחנו כאן בשבילך.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 md:grid-cols-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}
            {statusMessage && (
              <div className="p-3 text-sm text-primary bg-primary/10 rounded-md">
                {statusMessage}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="contact-name">שם מלא</Label>
              <Input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="ישראל ישראלי"
                className="h-11 rounded-xl border border-slate-300 bg-white shadow-none hover:shadow-none focus-visible:ring-1 focus-visible:ring-[#2f66e0] focus-visible:ring-offset-0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email">אימייל</Label>
              <Input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="israel@example.com"
                className="h-11 rounded-xl border border-slate-300 bg-white shadow-none hover:shadow-none focus-visible:ring-1 focus-visible:ring-[#2f66e0] focus-visible:ring-offset-0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-message">הודעה</Label>
              <textarea
                id="contact-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                minLength={10}
                className="min-h-40 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-none outline-none focus:ring-1 focus:ring-[#2f66e0]"
                placeholder="כתוב את ההודעה שלך כאן..."
              />
            </div>
            <div className="hidden" aria-hidden>
              <Label htmlFor="contact-website">Website</Label>
              <Input
                id="contact-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>
            <div>
              {TURNSTILE_SITE_KEY ? (
                <div
                  className="w-[109%] origin-top-right overflow-hidden"
                  style={{ transform: 'scale(0.92)' }}
                >
                  <Turnstile
                    siteKey={TURNSTILE_SITE_KEY}
                    onSuccess={(token) => setTurnstileToken(token)}
                    onExpire={() => setTurnstileToken(null)}
                    onError={() => setTurnstileToken(null)}
                    options={{
                      language: 'he',
                      theme: 'light',
                      size: 'flexible',
                      appearance: 'interaction-only',
                    }}
                  />
                </div>
              ) : (
                <p className="text-sm text-destructive">חסר VITE_TURNSTILE_SITE_KEY בהגדרות ה-frontend.</p>
              )}
            </div>
            <Button type="submit" className="h-11 w-full rounded-xl bg-[#2f66e0] text-base font-bold hover:bg-[#2558c9]" disabled={loading}>
              <span className="inline-flex items-center gap-2">
                <Send className="h-4 w-4" />
                {loading ? 'שולח...' : 'שלח הודעה'}
              </span>
            </Button>
          </form>

          <aside className="space-y-6 pt-2">
            <h2 className="text-4xl font-extrabold text-[#0b1f4b]">פרטי יצירת קשר</h2>

            <div className="space-y-5">
              <div className="flex items-center justify-between rounded-xl p-2">
                <div>
                  <p className="text-lg font-bold">אימייל</p>
                  <a className="text-sm text-[#1d4ed8] hover:underline" href="mailto:auth@stockly-il.com">auth@stockly-il.com</a>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#dbe7fb] text-[#2f66e0]">
                  <Mail className="h-4 w-4" />
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl p-2">
                <div>
                  <p className="text-lg font-bold">LinkedIn</p>
                  <p className="text-sm text-[#1d4ed8]">fuad-nasseraldeen</p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#dbe7fb] text-[#2f66e0]">
                  <Linkedin className="h-4 w-4" />
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl p-2">
                <div>
                  <p className="text-lg font-bold">מיקום</p>
                  <p className="text-sm text-slate-600">ישראל</p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#dbe7fb] text-[#2f66e0]">
                  <MapPin className="h-4 w-4" />
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-[#c8d9fa] bg-[#e8f0ff] px-6 py-5">
              <p className="text-2xl font-bold text-[#0b1f4b]">זמן תגובה</p>
              <p className="mt-2 text-sm text-slate-700">אנחנו מגיבים בכל פנייה תוך 24 שעות בימי עסקים.</p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
