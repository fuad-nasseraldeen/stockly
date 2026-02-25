import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FlatPageLayout } from '../components/layout/FlatPageLayout';
import { Button } from '../components/ui/button';

const items = [
  'ניהול מוצרים, ספקים וקטגוריות במקום אחד',
  'ייבוא וייצוא חכם עם סינון מותאם אישית',
  'עדכוני מחירים מהירים עם היסטוריית מחירים',
  'תמיכה באריזות, כמות ליחידה ותמחור מדויק',
  'סידור דינמי של שדות בטבלת מוצרים עם drag & drop',
  'התאמות טננט: מע"מ, רווח גלובלי ודיוק עשרוני',
];

export default function About() {
  return (
    <FlatPageLayout
      title="Why Stockly / About"
      description="מה האפליקציה שלנו עושה? הרבה מאוד - ובעיקר חוסכת זמן וכאב ראש בניהול היומיומי."
      maxWidthClass="max-w-5xl"
    >
      <div className="space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="rounded-2xl border bg-card/60 p-5"
        >
          <h2 className="text-xl font-semibold">מה Stockly נותנת לך בפועל?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            במקום לעבוד עם קבצים מפוזרים, טעויות ידניות ומעקב קשה אחרי מחירים - הכל מנוהל במקום אחד,
            עם זרימה מהירה ונוחה שמתאימה לעבודה יומיומית בחנות אמיתית.
          </p>
        </motion.section>

        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((text, idx) => (
            <motion.article
              key={text}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: idx * 0.05, ease: 'easeOut' }}
              className="rounded-xl border bg-background/70 p-4 shadow-sm hover:shadow-md transition-all"
            >
              <p className="text-sm leading-6">{text}</p>
            </motion.article>
          ))}
        </div>

        <motion.section
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.2, ease: 'easeOut' }}
          className="rounded-2xl border bg-primary/5 p-5"
        >
          <h3 className="text-lg font-semibold">דוגמאות למה אנשים אוהבים ב-Stockly</h3>
          <ul className="mt-3 list-disc space-y-1 pr-5 text-sm text-muted-foreground">
            <li>ייצוא דוח רק לפי מה שמעניין אותך באותו רגע</li>
            <li>עריכת מחירים בכמה קליקים במקום שעות של עבודה ידנית</li>
            <li>שליטה בנראות שדות המוצרים לפי סגנון העבודה שלך</li>
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
