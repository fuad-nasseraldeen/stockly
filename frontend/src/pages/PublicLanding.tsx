import { Link } from 'react-router-dom';
import { Boxes, Users, TrendingUp, ShieldCheck } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';

const features = [
  {
    title: 'ניהול מוצרים',
    description: 'עדכון מהיר של מלאי, יחידות ומחירים מכל מקום.',
    icon: Boxes,
  },
  {
    title: 'ניהול ספקים',
    description: 'מעקב מסודר אחרי ספקים, עלויות והזמנות שוטפות.',
    icon: Users,
  },
  {
    title: 'שליטה בתמחור',
    description: 'תמחור מדויק ושקוף עם נראות טובה לכל מוצר.',
    icon: TrendingUp,
  },
  {
    title: 'אמינות ואבטחה',
    description: 'מערכת יציבה עם תהליכי אבטחה והגנה על מידע.',
    icon: ShieldCheck,
  },
];

export default function PublicLanding() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="min-h-screen w-full bg-[#f5f5f7] text-[#0f172a]" dir="rtl">
      <header className="border-b border-slate-200 bg-[#e8edf6]">
        <div className="mx-auto max-w-6xl px-6 py-14 text-center">
          <span className="inline-flex rounded-full bg-[#dbe7fb] px-4 py-1 text-sm font-semibold text-[#2f66e0]">
            ברוכים הבאים
          </span>
          <h1 className="mt-5 text-5xl font-extrabold tracking-tight text-[#0b1f4b] sm:text-6xl">
            Stockly לניהול מלאי חכם
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-xl leading-8 text-slate-700">
            מערכת ניהול מלאי וספקים לעסקים קטנים ובינוניים בישראל. פשוטה, מהירה, ונוחה לשימוש יומיומי.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center rounded-xl bg-[#2f66e0] px-7 py-3 text-base font-bold text-white transition hover:bg-[#2558c9]"
            >
              פתח חשבון חינם
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-xl border border-[#2f66e0] bg-white px-7 py-3 text-base font-bold text-[#2f66e0] transition hover:bg-[#eef3ff]"
            >
              התחברות
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <section className="text-center">
          <h2 className="text-4xl font-extrabold text-[#0b1f4b]">מה תקבלו ב-Stockly</h2>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-600">
            כלים פרקטיים לניהול מוצרים, ספקים ותמחור במקום אחד.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {features.map(({ title, description, icon: Icon }, index) => (
              <motion.article
                key={title}
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 22, scale: 0.985 }}
                whileInView={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.55, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                whileHover={prefersReducedMotion ? undefined : { y: -8, scale: 1.012 }}
                className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-6 text-right shadow-[0_1px_0_rgba(15,23,42,0.02)] transition-[box-shadow,border-color] duration-300 hover:border-[#c8d9fa] hover:shadow-[0_20px_40px_-24px_rgba(24,59,138,0.5)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-extrabold text-[#0b1f4b]">{title}</h3>
                    <p className="mt-3 text-base leading-7 text-slate-600">{description}</p>
                  </div>
                  <span
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#dbe7fb] text-[#2f66e0] transition-colors duration-300 group-hover:bg-[#cfe0ff] group-hover:[animation:spin_0.7s_ease-in-out_1]"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-[#c8d9fa] bg-[#e8f0ff] px-6 py-6 text-center">
          <h3 className="text-2xl font-extrabold text-[#0b1f4b]">רוצים לראות איך זה עובד?</h3>
          <p className="mt-2 text-base text-slate-700">דברו איתנו ונעזור לכם להתחיל בצורה הכי מתאימה לעסק שלכם.</p>
          <Link to="/contact" className="mt-4 inline-flex font-semibold text-[#1d4ed8] hover:underline">
            מעבר לדף צור קשר
          </Link>
        </section>
      </main>
    </div>
  );
}
