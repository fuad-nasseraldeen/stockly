import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { PublicTopNav } from '../components/layout/PublicTopNav';

export default function PrivacyPolicy() {
  const sections = [
    {
      title: '1. איזה מידע אנחנו אוספים?',
      lines: [
        'אנחנו אוספים מידע אישי בסיסי כאשר נרשמים ומשתמשים בשירות, לרבות:',
        '• שם עסק או כתובת אימייל',
        '• שם העסק ופרטי התקשרות',
        '• מידע קשור לניהול מלאי (מוצרים, ספקים, הזמנות)',
        '• נתוני שימוש במערכת (לוגים, מועדי שימוש, פעולות שבוצעו)',
      ],
    },
    {
      title: '2. כיצד אנחנו משתמשים במידע?',
      lines: [
        'המידע שנאסף משמש אותנו לצורך:',
        '• הפעלה ושיפור השירות',
        '• שליחת עדכונים, הודעות שירות ומידע רלוונטי',
        '• מניעת הונאות ותמיכה טכנית',
        '• ניתוח דפוסי שימוש לשיפור חוויית המשתמש',
        '• עמידה בדרישות החוק',
      ],
    },
    {
      title: '3. שיתוף מידע עם צדדים שלישיים',
      lines: [
        'אנחנו לא מוכרים, סוחרים, או מעבירים את המידע האישי שלך לצדדים שלישיים, למעט:',
        '• ספקי שירות הפועלים מטעמנו (כגון אחסון ענן, שירותי אימייל)',
        '• כאשר נדרש על פי חוק או צו שיפוטי',
        '• בהסכמתך המפורשת',
      ],
    },
    {
      title: '4. אבטחת המידע',
      lines: [
        'אנחנו מיישמים אמצעי אבטחה מתקדמים להגנה על המידע שלך, כולל:',
        '• הצפנת SSL בכל התקשורת',
        '• גיבויים שוטפים ומאובטחים',
        '• בקרת גישה מוגבלת',
        '• ניטור רציף של המערכות',
        '',
        'עם זאת, אין שיטה שידועה לנו לאחסון אלקטרוני שהיא 100% מאובטחת.',
      ],
    },
    {
      title: '5. עוגיות (Cookies)',
      lines: [
        'האתר שלנו משתמש בעוגיות בכוונה לצורך:',
        '• שמירת פרטי ההתחברות שלך',
        '• שיפור חוויית השימוש',
        '• ניתוח סטטיסטי אנונימי של תנועת המשתמשים',
        '',
        'ניתן לנהל ולמחוק עוגיות דרך הגדרות הדפדפן שלך.',
      ],
    },
    {
      title: '6. זכויות המשתמש',
      lines: [
        'כמשתמש בשירות, יש לך הזכות:',
        '• לעיין במידע האישי שלך',
        '• לתקן מידע שגוי',
        '• לבקש מחיקה מהמערכת שלך (בכפוף לדרישות חוק)',
        '• להגביל שימוש במידע במקרים מסוימים',
        '• לקבל את המידע שלך בפורמט נייד',
        '',
        'למימוש זכויות אלה, צור קשר בכתובת: auth@stockly-il.com',
      ],
    },
    {
      title: '7. שמירת מידע',
      lines: [
        'אנחנו שומרים את המידע שלך כל עוד החשבון פעיל, או כפי שנדרש לצורך מתן השירות. לאחר סגירת חשבון, המידע יימחק בתוך 90 יום, אלא אם כן נדרש שיימור על פי חוק.',
      ],
    },
    {
      title: '8. שינויים במדיניות',
      lines: [
        'אנחנו עשויים לעדכן מדיניות פרטיות זו מעת לעת. שינויים מהותיים יפורסמו באתר וישלחו (ככל הניתן) באימייל הרשום. המשך שימוש בשירות לאחר פרסום שינויים מהווה הסכמה למדיניות המעודכנת.',
      ],
    },
    {
      title: '9. יצירת קשר',
      lines: [
        'לכל שאלה בנושא פרטיות, ניתן לפנות אלינו:',
        '• אימייל: auth@stockly-il.com',
        '• LinkedIn: fuad-naseraldeen',
        '• דרך טופס יצירת קשר באתר',
      ],
    },
  ];

  return (
    <div className="min-h-screen w-full bg-[#f5f5f7] text-[#0f172a]" dir="rtl">
      <PublicTopNav />
      <header className="border-b border-slate-200 bg-[#e8edf6]">
        <div className="mx-auto max-w-3xl px-6 py-14 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#dbe7fb]">
            <ShieldCheck className="h-7 w-7 text-[#2563eb]" />
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight text-[#0b1f4b]">מדיניות פרטיות</h1>
          <p className="mt-3 text-sm text-slate-600">עודכן לאחרונה: ינואר 2025</p>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-700">
            הפרטיות שלך חשובה לנו. מסמך זה מסביר כיצד אפליקציית Stockly אוספת, משתמשת ומגינה על המידע שלך.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        {sections.map((section, index) => (
          <motion.section
            key={section.title}
            className={index > 0 ? 'border-t border-slate-200 py-12' : 'py-4'}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <h2 className="text-4xl font-extrabold text-[#0b1f4b]">{section.title}</h2>
            <div className="mt-5 space-y-1 text-base leading-8 text-slate-700">
              {section.lines.map((line, lineIndex) => (
                <p key={`${section.title}-${lineIndex}`}>
                  {line === '' ? (
                    '\u00A0'
                  ) : line === 'למימוש זכויות אלה, צור קשר בכתובת: auth@stockly-il.com' ? (
                    <>
                      למימוש זכויות אלה,{' '}
                      <Link className="font-semibold text-[#1d4ed8] hover:underline" to="/contact">
                        צור קשר
                      </Link>
                      .
                    </>
                  ) : (
                    line
                  )}
                </p>
              ))}
            </div>
          </motion.section>
        ))}

        <div className="mt-10 rounded-2xl border border-[#c8d9fa] bg-[#e8f0ff] px-6 py-5 text-center text-base text-[#1f3c74]">
          יש לך שאלה לגבי המדיניות שלנו?{' '}
          <Link className="font-semibold text-[#1d4ed8] hover:underline" to="/contact">
            צור קשר
          </Link>
        </div>
      </main>

    </div>
  );
}
