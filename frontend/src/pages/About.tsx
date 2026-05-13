import { Link } from 'react-router-dom';
import { Eye, Target, Users, Shield } from 'lucide-react';
import { PublicTopNav } from '../components/layout/PublicTopNav';

const values = [
  {
    title: 'שקיפות',
    description: 'אין מחירים נסתרים, אין הפתעות. מה שרואים זה מה שמקבלים.',
    icon: Eye,
  },
  {
    title: 'פשטות',
    description: 'אנחנו מאמינים שתוכנה טובה לא צריכה הסבר ארוך. Stockly נבנתה כך שכל אחד יוכל להשתמש בה מהיום הראשון.',
    icon: Target,
  },
  {
    title: 'קהילה',
    description: 'אנחנו בונים את Stockly יחד עם הלקוחות שלנו - הפידבק שלכם מניע כל פיצ׳ר חדש.',
    icon: Users,
  },
  {
    title: 'אמינות',
    description: 'המידע שלך תמיד זמין, מגובה ומאובטח. אנחנו כאן בשבילך.',
    icon: Shield,
  },
];

export default function About() {
  return (
    <div className="min-h-screen w-full bg-[#f5f5f7] text-[#0f172a]" dir="rtl">
      <PublicTopNav />
      <header className="border-b border-slate-200 bg-[#e8edf6]">
        <div className="mx-auto max-w-6xl px-6 py-14 text-center">
          <span className="inline-flex rounded-full bg-[#dbe7fb] px-4 py-1 text-sm font-semibold text-[#2f66e0]">
            מי אנחנו
          </span>
          <h1 className="mt-5 text-5xl font-extrabold tracking-tight text-[#0b1f4b]">
            הסיפור מאחורי <span className="text-[#2f66e0]">Stockly</span>
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-xl leading-8 text-slate-700">
            נולדנו מתוך ההבנה שבעלי עסקים קטנים בישראל מגיעים לעבוד בבוקר - ולא להתעסק עם גיליונות אקסל.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <section className="text-center">
          <h2 className="text-4xl font-extrabold text-[#0b1f4b]">הסיפור שלנו</h2>
          <div className="mx-auto mt-6 max-w-4xl space-y-4 text-lg leading-8 text-slate-700">
            <p>
              Stockly נוסדה על ידי פואד נאסראלדין, יזם ופותר בעיות מישראל, שזיהה שעסקים קטנים - חנויות מכולת, ועסקי
              מזון - מתמודדים יום-יום עם ניהול מלאי כאוטי: שעות ידניות, טעויות במלאי, ואיבוד שליטה על מה יש במחסן.
            </p>
            <p>
              הפתרונות הקיימים היו יקרים מדי, מסובכים מדי, ולא מותאמים לשוק הישראלי. אז בנינו את Stockly - מערכת
              חכמה, בעברית, שמתחילים להשתמש בה ביום הראשון.
            </p>
            <p>
              היום Stockly משרתת מאות עסקים ברחבי ישראל, ואנחנו ממשיכים לבנות, לשפר, ולהקשיב ללקוחות שלנו כל יום.
            </p>
          </div>
        </section>

        <section className="mt-16 border-t border-slate-200 pt-12">
          <h2 className="text-center text-5xl font-extrabold text-[#0b1f4b]">הערכים שמנחים אותנו</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {values.map(({ title, description, icon: Icon }) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-3xl font-extrabold text-[#0b1f4b]">{title}</h3>
                    <p className="mt-3 text-base leading-7 text-slate-600">{description}</p>
                  </div>
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#dbe7fb] text-[#2f66e0]">
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      <section className="bg-[#2f66e0] py-10 text-center text-white sm:py-12">
        <h2 className="text-3xl font-extrabold sm:text-4xl">מוכן להצטרף?</h2>
        <p className="mt-3 text-lg text-blue-100 sm:text-xl">התחל לנהל את המלאי שלך בחכמה - היום</p>
        <Link
          to="/signup"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-white px-6 py-2.5 text-base font-bold text-[#2f66e0] transition hover:bg-slate-100 sm:mt-7 sm:px-8 sm:py-3 sm:text-lg"
        >
          פתח חשבון חינם
        </Link>
      </section>
    </div>
  );
}
