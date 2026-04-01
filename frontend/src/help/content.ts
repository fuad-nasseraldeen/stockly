import type { HelpContent } from './types';

export const WELCOME_VIDEO_URL = 'https://www.youtube.com/embed/XgX7dYi3dy8';

export const helpContent: HelpContent = {
  categories: [
    { id: 'import', title: 'ייבוא וייצוא' },
    { id: 'pricing', title: 'מחירים ומע"מ' },
    { id: 'team', title: 'ניהול משתמשים' },
  ],
  articles: [
    {
      id: 'import-guide',
      categoryId: 'import',
      title: 'מדריך ייבוא מלא',
      description: 'כך מבצעים ייבוא בצורה בטוחה ומהירה.',
      bullets: [
        'ודא שיש עמודת שם מוצר ועמודת מחיר אחת לפחות.',
        'חובה למפות עמודת ספק מהקובץ (או עמודה ידנית לספק), בדומה לקטגוריה.',
        'לפני Apply, בצע Validate כדי לראות טעויות נפוצות.',
      ],
      keywords: ['ייבוא', 'CSV', 'מיפוי', 'שדות חובה', 'טעויות נפוצות'],
      attachments: [{ label: 'Download CSV template', href: '/templates/import-template.csv' }],
    },
    {
      id: 'export-import',
      categoryId: 'import',
      title: 'ייצוא וייבוא חוזר',
      description: 'טיפים לעבודה מחזורית עם קבצי מחיר.',
      bullets: [
        'ייצוא היסטוריה שומר מעקב שינויים בין ספקים.',
        'בייבוא חוזר המערכת מוסיפה ומעדכנת לפי הקובץ — ללא מחיקת נתונים קיימים.',
      ],
      keywords: ['ייצוא', 'היסטוריה', 'ייבוא', 'מיזוג'],
    },
    {
      id: 'vat-on-off',
      categoryId: 'pricing',
      title: 'מע"מ פעיל או כבוי',
      description: 'מתי נכון לכבות מע"מ (לדוגמה עוסק פטור).',
      bullets: [
        'כאשר מע"מ כבוי, המערכת מתייחסת למחיר כמחיר סופי.',
        'כאשר מע"מ פעיל, מחיר מכירה יחושב לפי שיעור המע"מ בהגדרות.',
      ],
      keywords: ['מע"מ', 'VAT', 'עוסק פטור', 'הגדרות מחיר'],
    },
    {
      id: 'decimal-places',
      categoryId: 'pricing',
      title: 'דיוק עשרוני',
      description: 'ברירת המחדל היא 2 ספרות אחרי הנקודה.',
      bullets: [
        'לרוב עסקים 2 ספרות מספיקות.',
        'אפשר להעלות דיוק למוצרים שנמכרים במשקל או נפח.',
      ],
      keywords: ['דיוק עשרוני', 'decimal', 'מחיר', 'עיגול'],
    },
    {
      id: 'add-participant',
      categoryId: 'team',
      title: 'הוספת משתתף לחנות',
      description: 'איך מזמינים משתמשים חדשים לחנות.',
      bullets: [
        'במסך הגדרות אפשר להזמין באימייל או בטלפון.',
        'בחר תפקיד מתאים: עובד או בעלים נוסף.',
      ],
      keywords: ['משתמשים', 'הזמנה', 'owner', 'worker'],
    },
  ],
};
