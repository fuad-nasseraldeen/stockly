import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEffect } from 'react';
import {
  BarChart3,
  Boxes,
  DollarSign,
  ShieldCheck,
  Star,
  Truck,
  Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { setTenantIdForApi } from '../lib/api';

const features = [
  {
    icon: Boxes,
    title: 'ניהול מוצרים',
    description: 'עקוב אחרי כל המוצרים שלך בזמן אמת - כמויות, פרטים ותמונות במקום אחד.',
  },
  {
    icon: Users,
    title: 'ניהול ספקים',
    description: 'שמור את כל פרטי הספקים שלך במקום אחד, כולל היסטוריית הזמנות.',
  },
  {
    icon: DollarSign,
    title: 'עדכוני מחירים',
    description: 'עדכן מחירים ועלויות בקלות ובאופן מרכזי לכל המוצרים.',
  },
  {
    icon: BarChart3,
    title: 'דוחות וניתוחים',
    description: 'קבל תובנות מהירות על מצב המלאי שלך עם דוחות חכמים ואינטואיטיביים.',
  },
  {
    icon: Truck,
    title: 'מעקב הזמנות',
    description: 'נהל הזמנות נכנסות ויוצאות בצורה חלקה ומסודרת.',
  },
  {
    icon: ShieldCheck,
    title: 'אמין ומאובטח',
    description: 'הנתונים שלך מאובטחים ברמה גבוהה, עם גיבוי רציף ושקט נפשי.',
  },
];

const testimonials = [
  {
    quote: 'מאז שעברנו ל-Stockly חסכנו שעות בשבוע בניהול המלאי והספקים.',
    name: 'אחמד ס.',
    role: 'סופרמרקט, חיפה',
  },
  {
    quote: 'סוף סוף מערכת שמדברת עברית ומתאימה באמת לעסקים בישראל.',
    name: 'מרים ד.',
    role: 'חנות חיות מחמד, תל אביב',
  },
  {
    quote: 'פשוט לשימוש, קל להטמעה, ועם תמיכה מעולה לאורך הדרך.',
    name: 'יוסי ק.',
    role: 'מכולת שכונתית, עכו',
  },
];

const steps = [
  {
    number: '1',
    title: 'פתח חשבון חינם',
    description: 'הרשמה מהירה ב-30 שניות ללא כרטיס אשראי',
  },
  {
    number: '2',
    title: 'הוסף את המוצרים שלך',
    description: 'הזן ידנית או יבא קובץ Excel קיים',
  },
  {
    number: '3',
    title: 'נהל בקלות',
    description: 'עקוב אחרי המלאי, הספקים והמחירים בזמן אמת',
  },
];

const stats = [
  { value: '+241', label: 'עסקים רשומים' },
  { value: '+8K', label: 'מוצרים מנוהלים' },
  { value: '99.9%', label: 'זמינות מערכת' },
  { value: '4.9', label: 'דירוג ממוצע', isRating: true },
];

const cardReveal = {
  initial: { opacity: 0, y: 18, scale: 0.98 },
  whileInView: { opacity: 1, y: 0, scale: 1 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.48, ease: [0.22, 1, 0.36, 1] as const },
};

export default function Ad() {
  useEffect(() => {
    const forcePublicMode = async () => {
      localStorage.removeItem('currentTenantId');
      setTenantIdForApi(null);
      try {
        await supabase.auth.signOut();
      } catch {
        // Keep page usable even if sign-out request fails.
      }
    };
    void forcePublicMode();
  }, []);

  const redirectToFreeSignup = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    localStorage.setItem('stockly:selected-plan', 'trial_free');
    localStorage.removeItem('currentTenantId');
    setTenantIdForApi(null);
    try {
      await supabase.auth.signOut();
    } catch {
      // Continue redirect even if sign-out request fails.
    }
    window.location.href = '/signup?plan=trial_free';
  };

  return (
    <div className="min-h-screen bg-[#f4f7fc] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <h1 className="text-3xl font-extrabold ml-5 text-[#2f66e0]">Stockly</h1>
          <div className="flex items-center gap-2">
            <Link to="/signup?plan=trial_free" onClick={redirectToFreeSignup} className="inline-flex min-w-[88px] items-center justify-center rounded-lg px-2 py-2 text-center text-sm font-medium leading-tight text-slate-700 transition hover:bg-slate-100">
               פתח חשבון חינם
            </Link>
            {/* <Link to="/signup" className="rounded-lg bg-[#2f66e0] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#2558c9]">
              פתח חשבון חינם
            </Link> */}
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto w-full max-w-6xl px-4 pb-0 py-16 text-center">
          {/* <span className="inline-flex rounded-full bg-[#dfeafe] px-4 py-1 text-sm font-semibold text-[#2f66e0]">
            נבנה בישראל, בשביל ישראל
          </span> */}
          <h2 className="mt-6 text-4xl font-extrabold leading-tight sm:text-6xl">
            ניהול מלאי חכם
            <br />
            <span className="text-[#2f66e0]">לעסקים קטנים</span>
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-lg text-slate-600">
            Stockly היא מערכת מקצועית לניהול מלאי, מוצרים וספקים - בעברית, מהירה ופשוטה לשימוש יומיומי.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/signup?plan=trial_free" onClick={redirectToFreeSignup} className="rounded-xl bg-[#2f66e0] px-7 py-3 text-base font-bold text-white shadow hover:bg-[#2558c9]">
              התחל בחינם עכשיו
            </Link>
            <Link to="/contact" className="rounded-xl border border-[#2f66e0] bg-white px-7 py-3 text-base font-bold text-[#2f66e0] hover:bg-[#eef3ff]">
              צפה בדמו
            </Link>
          </div>
          <p className="mt-3 text-sm text-slate-500">ללא כרטיס אשראי • ביטול בכל עת</p>

          <div className="relative mx-auto mt-12 min-h-[350px] w-full max-w-[920px] overflow-hidden sm:min-h-[520px]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(47,102,224,0.2),transparent_55%)]" />

            <motion.img
              src="/picture/LAPTOP-DEMO.png"
              alt="דשבורד במחשב"
              initial={{ opacity: 0, x: 40, y: 20, rotate: 1.5, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, y: [0, -20, 0], rotate: [1.5, 0.3, 1.5], scale: 1 }}
              transition={{
                opacity: { duration: 0.5, ease: 'easeOut' },
                x: { duration: 0.6, ease: 'easeOut' },
                y: { duration: 5, repeat: Infinity, ease: 'easeInOut' },
                rotate: { duration: 5, repeat: Infinity, ease: 'easeInOut' },
                scale: { duration: 0.5, ease: 'easeOut' },
              }}
              className="absolute right-0 top-6 z-10 w-[88%] shadow-[0_30px_60px_-28px_rgba(15,23,42,0.35)]"
            />

            <motion.img
              src="/picture/mobile-demo.png"
              alt="דשבורד במובייל"
              initial={{ opacity: 0, x: -36, y: 26, rotate: -7, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, y: [0, 10, 0], rotate: [-7, -30, -7], scale: 1 }}
              transition={{
                opacity: { duration: 0.55, delay: 0.08, ease: 'easeOut' },
                x: { duration: 0.62, delay: 0.08, ease: 'easeOut' },
                y: { duration: 4.6, repeat: Infinity, ease: 'easeInOut' },
                rotate: { duration: 4.6, repeat: Infinity, ease: 'easeInOut' },
                scale: { duration: 0.55, delay: 0.08, ease: 'easeOut' },
              }}
              className="absolute left-2 top-10 z-20 w-[22%] min-w-[88px] left-10 top-25 shadow-[0_28px_50px_-24px_rgba(15,23,42,0.4)] sm:left-10 sm:top-20 sm:w-[26%] sm:min-w-[140px]"
            />
          </div>
        </section>

        <section className="bg-[#2f66e0] py-8">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-6 px-4 text-center text-white sm:grid-cols-4">
            {stats.map((item) => (
              <div key={item.label}>
                {item.isRating ? (
                  <p className="flex items-center justify-center gap-1 text-3xl font-extrabold">
                    <span>{item.value}</span>
                    <span className="flex items-center text-[#ffd949]">
                      <Star className="h-5 w-5 fill-current" />
                      <Star className="h-4 w-4 -ml-1 fill-current opacity-90" />
                      <Star className="h-3 w-3 -ml-1 fill-current opacity-80" />
                    </span>
                  </p>
                ) : (
                  <p className="text-3xl font-extrabold">{item.value}</p>
                )}
                <p className="mt-1 text-sm text-blue-100">{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pt-12">
          <div className="text-center">
            <h3 className="text-4xl font-extrabold">כל מה שהעסק שלך צריך</h3>
            <p className="mt-3 text-lg text-slate-500">כלים חכמים שחוסכים לך זמן וכסף כל יום</p>
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <motion.article
                key={title}
                {...cardReveal}
                whileHover={{ y: -6, scale: 1.01, boxShadow: '0 24px 45px -24px rgba(15,23,42,0.35)' }}
                className="group rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm transition-shadow duration-300"
              >
                <div className="relative mx-auto inline-flex rounded-lg bg-[#e8f0ff] p-2 text-[#2f66e0] transition-transform duration-700 ease-in-out group-hover:rotate-[360deg]">
                  <Icon className="h-5 w-5" />
                </div>
                <h4 className="mt-4 text-2xl font-bold">{title}</h4>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="bg-[#f0f4fb] pt-16">
          <div className="mx-auto w-full max-w-6xl px-4 text-center">
            <h3 className="text-4xl font-extrabold">איך זה עובד?</h3>
            <p className="mt-3 text-lg text-slate-500">3 צעדים פשוטים להתחיל</p>
            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {steps.map((step) => (
                <motion.article
                  key={step.number}
                  {...cardReveal}
                  whileHover={{ y: -5, scale: 1.01, boxShadow: '0 20px 40px -26px rgba(15,23,42,0.3)' }}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#2f66e0] text-xl font-extrabold text-white">
                    {step.number}
                  </div>
                  <h4 className="mt-4 text-2xl font-bold">{step.title}</h4>
                  <p className="mt-2 text-sm text-slate-600">{step.description}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl pt-16 text-center">
          <h3 className="text-4xl font-extrabold">מה אומרים הלקוחות שלנו</h3>
          <div className="mt-10 grid gap-5 md:grid-cols-3 px-4 pb-8">
            {testimonials.map((item) => (
              <motion.article
                key={item.name}
                {...cardReveal}
                whileHover={{ y: -5, scale: 1.01, boxShadow: '0 22px 42px -26px rgba(15,23,42,0.3)' }}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <p className="text-xl text-[#f6b800]">★★★★★</p>
                <p className="mt-4 text-sm text-slate-700">"{item.quote}"</p>
                <p className="mt-5 font-bold">{item.name}</p>
                <p className="text-xs text-slate-500">{item.role}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="bg-[#e9eef8] py-16">
          <div className="mx-auto w-full max-w-4xl px-4">
            <div className="text-center">
              <h3 className="text-4xl font-extrabold">מחירים שמתאימים לעסק שלך</h3>
              <p className="mt-3 text-lg text-slate-500">שקוף, פשוט, ללא הפתעות</p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              <motion.article
                {...cardReveal}
                whileHover={{ y: -6, scale: 1.01, boxShadow: '0 24px 46px -26px rgba(15,23,42,0.28)' }}
                className="rounded-2xl border border-slate-200 bg-white p-8"
              >
                <h4 className="text-3xl font-extrabold">ניסיון חינם</h4>
                <p className="mt-2 text-4xl font-extrabold">₪0</p>
                <p className="text-sm text-slate-500">ל-30 יום, ללא כרטיס אשראי</p>
                <ul className="mt-5 space-y-2 text-sm text-slate-700">
                  <li>גישה מלאה לכל הפיצ'רים</li>
                  <li>ללא הגבלת מוצרים</li>
                  <li>ללא הגבלת ספקים</li>
                  <li>תזכורות חכמות לפני סיום הניסיון</li>
                </ul>
                <Link to="/signup?plan=trial_free" onClick={redirectToFreeSignup} className="mt-6 block rounded-xl bg-[#2f66e0] px-5 py-3 text-center font-bold text-white hover:bg-[#2558c9]">
                  התחל בחינם
                </Link>
              </motion.article>
              <motion.article
                {...cardReveal}
                whileHover={{ y: -8, scale: 1.015, boxShadow: '0 28px 56px -26px rgba(47,102,224,0.55)' }}
                className="rounded-2xl border border-[#2f66e0] bg-[#2f66e0] p-8 text-white shadow-xl"
              >
                <span className="inline-block rounded-full bg-[#ffd949] px-3 py-1 text-xs font-bold text-slate-900">הכי פופולרי</span>
                <h4 className="mt-3 text-3xl font-extrabold">עסקי</h4>
                <p className="mt-2 text-5xl font-extrabold">₪199</p>
                <p className="text-sm text-blue-100">לחודש • או שנתי בתשלום מראש ₪1,788 (₪149 × 12)</p>
                <ul className="mt-5 space-y-2 text-sm">
                  <li>מוצרים ללא הגבלה</li>
                  <li>ספקים ללא הגבלה</li>
                  <li>דוחות מתקדמים</li>
                  <li>תמיכה מועדפת</li>
                  <li>במסלול חודשי: ביטול בכל שלב</li>
                </ul>
                <Link to="/signup?plan=trial_free" onClick={redirectToFreeSignup} className="mt-6 block rounded-xl bg-white px-5 py-3 text-center font-bold text-[#2f66e0] hover:bg-slate-100">
                  נסה 14 יום חינם
                </Link>
              </motion.article>
            </div>
          </div>
        </section>

        <section className="bg-[#2f66e0] py-16 text-center text-white">
          <h3 className="text-4xl font-extrabold">מוכן להפסיק לנהל מלאי באקסל?</h3>
          <p className="mt-3 text-lg text-blue-100">הצטרף לעסקים שכבר מנהלים את המלאי שלהם עם Stockly</p>
          <Link to="/signup?plan=trial_free" onClick={redirectToFreeSignup} className="mt-7 inline-block rounded-xl bg-white px-8 py-4 text-lg font-bold text-[#2f66e0] hover:bg-slate-100">
            התחל בחינם עכשיו
          </Link>
          <p className="mt-3 text-sm text-blue-100">ללא כרטיס אשראי • ביטול בכל עת</p>
        </section>
      </main>

    </div>
  );
}
