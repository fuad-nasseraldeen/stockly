import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FlatPageLayout } from '../components/layout/FlatPageLayout';
import { Button } from '../components/ui/button';

const coreItems = [
  'ניהול מוצרים, ספקים וקטגוריות במקום אחד',
  'עדכוני מחירים מהירים עם היסטוריית מחירים',
  'תמיכה באריזות, כמות ליחידה ותמחור מדויק',
  'סידור דינמי של שדות בטבלת מוצרים עם drag & drop',
  'התאמות טננט: מע"מ, רווח גלובלי ודיוק עשרוני',
];

const importExportItems = [
  'ייבוא Excel מכל הגיליונות יחד',
  'ייבוא PDF – חילוץ טבלאות מקבצי PDF',
  'ייבוא CSV עם תבנית בעברית',
  'ייצוא Excel ו-PDF עם בחירת עמודות',
  'מצב Merge – שומר מידע קיים ומוסיף חדש',
  'שמירת מיפויים לייבוא חוזר',
];

const teamItems = [
  'הזמנת עובדים באימייל או בטלפון',
  'תפקידים: בעלים או עובד',
  'מעבר בין חנויות (Multi-tenant)',
];

const supportItems = [
  'צ׳אט תמיכה מובנה בתוך המערכת',
  'צירוף קבצים ותמונות לצ׳אט',
  'מרכז עזרה עם מדריכים וחיפוש',
];

const extraItems = [
  'התחברות בטלפון עם קוד SMS',
  'מצב לילה (Dark mode)',
  'ממשק מלא בעברית RTL',
];

export default function About() {
  return (
    <FlatPageLayout
      title="למה Stockly"
      description="מה האפליקציה שלנו עושה? הרבה מאוד - ובעיקר חוסכת זמן וכאב ראש בניהול היומיומי."
      maxWidthClass="max-w-5xl"
    >
      <div className="space-y-8">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="rounded-2xl border bg-card/60 p-5"
        >
          <h2 className="text-xl font-semibold">מה Stockly נותנת לך בפועל?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            במקום לעבוד עם קבצים מפוזרים, טעויות ידניות ומעקב קשה אחרי מחירים – הכל מנוהל במקום אחד,
            עם זרימה מהירה ונוחה שמתאימה לעבודה יומיומית בחנות אמיתית.
          </p>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05, ease: 'easeOut' }}
        >
          <h3 className="mb-3 text-lg font-semibold">ליבת המערכת</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {coreItems.map((text) => (
              <article
                key={text}
                className="rounded-xl border bg-background/70 p-4 shadow-sm transition-all hover:shadow-md"
              >
                <p className="text-sm leading-6">{text}</p>
              </article>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1, ease: 'easeOut' }}
        >
          <h3 className="mb-3 text-lg font-semibold">ייבוא וייצוא</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {importExportItems.map((text) => (
              <article
                key={text}
                className="rounded-xl border bg-background/70 p-4 shadow-sm transition-all hover:shadow-md"
              >
                <p className="text-sm leading-6">{text}</p>
              </article>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15, ease: 'easeOut' }}
        >
          <h3 className="mb-3 text-lg font-semibold">צוות וחנות</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {teamItems.map((text) => (
              <article
                key={text}
                className="rounded-xl border bg-background/70 p-4 shadow-sm transition-all hover:shadow-md"
              >
                <p className="text-sm leading-6">{text}</p>
              </article>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2, ease: 'easeOut' }}
        >
          <h3 className="mb-3 text-lg font-semibold">תמיכה ועזרה</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {supportItems.map((text) => (
              <article
                key={text}
                className="rounded-xl border bg-background/70 p-4 shadow-sm transition-all hover:shadow-md"
              >
                <p className="text-sm leading-6">{text}</p>
              </article>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.25, ease: 'easeOut' }}
        >
          <h3 className="mb-3 text-lg font-semibold">ועוד</h3>
          <div className="flex flex-wrap gap-2">
            {extraItems.map((text) => (
              <span
                key={text}
                className="rounded-lg border bg-muted/50 px-3 py-1.5 text-sm"
              >
                {text}
              </span>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.3, ease: 'easeOut' }}
          className="rounded-2xl border bg-primary/5 p-5"
        >
          <h3 className="text-lg font-semibold">דוגמאות למה אנשים אוהבים ב-Stockly</h3>
          <ul className="mt-3 list-disc space-y-1 pr-5 text-sm text-muted-foreground">
            <li>ייצוא דוח רק לפי מה שמעניין אותך באותו רגע</li>
            <li>עריכת מחירים בכמה קליקים במקום שעות של עבודה ידנית</li>
            <li>שליטה בנראות שדות המוצרים לפי סגנון העבודה שלך</li>
            <li>ייבוא מחירים מספק ב-PDF בלי להקליד ידנית</li>
          </ul>
        </motion.section>

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/login">התחל עכשיו</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/contact">דבר איתנו</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/">חזרה לדף הבית</Link>
          </Button>
        </div>
      </div>
    </FlatPageLayout>
  );
}
