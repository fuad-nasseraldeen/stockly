import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { publicApi } from '../lib/api';
import { FlatPageLayout } from '../components/layout/FlatPageLayout';

const WHATSAPP_LINK = 'https://wa.me/972503955900?text=Hi%20Stockly%2C%20I%20have%20a%20question';
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
    <FlatPageLayout
      title="צור קשר"
      description="יש שאלות על הקמה, תמחור או תמיכה? אפשר לפנות אלינו ישירות."
      maxWidthClass="max-w-xl"
    >
      <div className="space-y-4 rounded-xl border border-border bg-card/60 p-4">
          <form onSubmit={handleSubmit} className="rounded-lg border p-4 bg-background/60 space-y-3">
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
              <Label htmlFor="contact-name">שם</Label>
              <Input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="השם שלך"
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
                placeholder="you@example.com"
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
                className="w-full min-h-28 rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="כתוב כאן את הפנייה שלך..."
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
            <div className="">
              {TURNSTILE_SITE_KEY ? (
                <div
                  className="w-[109%] overflow-hidden origin-top-right"
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
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'שולח...' : 'שליחת פנייה'}
            </Button>
          </form>

          <div className="rounded-lg border p-4 bg-background/60 space-y-2">
            <p className="text-sm">
              <span className="font-medium">אימייל:</span>{' '}
              <a className="text-primary hover:underline" href="mailto:auth@stockly-il.com">
                auth@stockly-il.com
              </a>
            </p>
            <p className="text-sm">
              <span className="font-medium">וואטסאפ:</span> זמין להודעות תמיכה.
            </p>
            <p className="text-sm text-muted-foreground">
              תמיכה טלפונית זמינה לפי בקשה.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={WHATSAPP_LINK} target="_blank" rel="noreferrer">
                שליחה בוואטסאפ
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href="mailto:auth@stockly-il.com">שליחת אימייל</a>
            </Button>
          </div>

          <div className="text-sm text-muted-foreground flex flex-wrap gap-4">
            <Link className="hover:underline" to="/">חזרה לעמוד הבית</Link>
            <Link className="hover:underline" to="/privacy">מדיניות פרטיות</Link>
            <Link className="hover:underline" to="/terms">תנאי שימוש</Link>
          </div>
      </div>
    </FlatPageLayout>
  );
}
