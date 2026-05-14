import { PublicTopNav } from '../components/layout/PublicTopNav';

const sections: Array<{ title: string; items: string[] }> = [
  {
    title: '1. כללי',
    items: [
      'השימוש ב-Stockly כפוף לתנאים אלו ומהווה הסכמה מלאה אליהם.',
      'אם אינך מסכים לתנאים, יש להפסיק את השימוש בשירות.',
    ],
  },
  {
    title: '2. חשבון משתמש',
    items: [
      'המשתמש אחראי לשמירת פרטי ההתחברות ולכל פעולה שמתבצעת מתוך החשבון שלו.',
      'אין להעביר הרשאות גישה לצד שלישי ללא אישור מתאים.',
    ],
  },
  {
    title: '3. שימוש מותר ואסור',
    items: [
      'מותר להשתמש במערכת לצרכים עסקיים חוקיים בלבד.',
      'אסור לבצע שימוש לרעה, חדירה, הפצת קוד זדוני, או פגיעה בזכויות של אחרים.',
      'אסור לבצע הנדסה לאחור, העתקה או ניסיון לשחזר את קוד המערכת.',
    ],
  },
  {
    title: '4. נתונים ותוכן',
    items: [
      'המשתמש אחראי לנכונות הנתונים שהוא מזין למערכת (מוצרים, ספקים, מחירים וכו\').',
      'המשתמש מצהיר שיש לו הרשאה חוקית לכל תוכן שהוא מעלה לשירות.',
    ],
  },
  {
    title: '5. פרטיות ואבטחה',
    items: [
      'Stockly פועלת להגן על המידע באמצעי אבטחה סבירים ומתקדמים.',
      'השימוש במידע כפוף גם למדיניות הפרטיות של השירות.',
    ],
  },
  {
    title: '6. זמינות השירות',
    items: [
      'אנו עושים מאמץ לשמור על זמינות רציפה, אך ייתכנו תקלות, השבתות או עבודות תחזוקה.',
      'לא תהיה אחריות לנזק עקיף כתוצאה מהשבתה זמנית או תקלה שאינה בשליטתנו.',
    ],
  },
  {
    title: '7. תשלומים ומנוי',
    items: [
      'אם קיים מסלול בתשלום, החיוב יתבצע לפי התוכנית שנבחרה ובהתאם לתנאים שהוצגו בעת הרכישה.',
      'ניתן לעדכן מחירים ותוכניות מעת לעת, תוך הצגה מראש במערכת.',
    ],
  },
  {
    title: '8. קניין רוחני',
    items: [
      'כל זכויות הקניין הרוחני במערכת, בעיצוב, בתשתיות ובקוד שייכות ל-Stockly, אלא אם צוין אחרת.',
    ],
  },
  {
    title: '9. הגבלת אחריות',
    items: [
      'השירות מסופק כפי שהוא (AS IS).',
      'בכפוף לדין, אחריותנו מוגבלת לנזקים ישירים בלבד ולא תחול על נזקים עקיפים או אובדן רווחים.',
    ],
  },
  {
    title: '10. סיום או השעיית חשבון',
    items: [
      'אנו רשאים להשעות או לסגור חשבון במקרה של הפרת תנאים, שימוש אסור או פעילות חשודה.',
    ],
  },
  {
    title: '11. שינויים בתנאים',
    items: [
      'אנחנו רשאים לעדכן תנאים אלו מעת לעת.',
      'המשך שימוש בשירות לאחר עדכון מהווה הסכמה לתנאים המעודכנים.',
    ],
  },
  {
    title: '12. דין וסמכות שיפוט',
    items: [
      'התנאים כפופים לדין הישראלי, וכל מחלוקת תידון בבתי המשפט המוסמכים בישראל.',
    ],
  },
  {
    title: '13. Contact',
    items: [
      'Email: auth@stockly-il.com',
      'Website: https://www.stockly-il.com',
      'Support: דרך עמוד "צור קשר" באתר',
    ],
  },
];

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900" dir="rtl">
      <PublicTopNav />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="mb-2 text-sm font-semibold text-slate-500">Stockly</p>
          <h1 className="text-4xl font-extrabold tracking-tight text-[#2f66e0] sm:text-5xl">
            תנאי שימוש
          </h1>
          <p className="mt-4 text-sm text-slate-600">עודכן לאחרונה: 14 במאי 2026</p>

          <div className="mt-6 space-y-4 text-base leading-7 text-slate-800">
            <p>
              מסמך זה מגדיר את תנאי השימוש בשירות Stockly ואת הזכויות והחובות של המשתמשים במערכת.
            </p>
            <p>
              שימוש במערכת מהווה הסכמה לתנאי השימוש ולמדיניות הפרטיות.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {sections.map((section) => (
            <section key={section.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-bold text-[#0b1f4b]">{section.title}</h2>
              <div className="mt-3 space-y-2 text-sm leading-7 text-slate-700">
                {section.items.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
