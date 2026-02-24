import { Link } from 'react-router-dom';
import { FlatPageLayout } from '../components/layout/FlatPageLayout';

export default function TermsOfService() {
  return (
    <FlatPageLayout
      title="תנאי שימוש"
      description="עודכן לאחרונה: פברואר 2026"
      maxWidthClass="max-w-3xl"
    >
      <div className="space-y-4 text-sm leading-6 rounded-xl border border-border bg-card/60 p-5">
          <p>
            השימוש ב-Stockly מהווה הסכמה לשימוש חוקי בשירות ולשמירה על אבטחת פרטי ההתחברות לחשבון.
          </p>
          <p>
            האחריות על נכונות הנתונים שמוזנים למערכת (מוצרים, מחירים, ספקים ועוד) היא של המשתמש.
          </p>
          <p>
            Stockly רשאית לעדכן פיצ'רים ומדיניות מעת לעת. המשך שימוש בשירות מהווה הסכמה לתנאים המעודכנים.
          </p>
          <p>
            לפניות תמיכה או פניות משפטיות ניתן ליצור קשר בכתובת{' '}
            <a className="text-primary hover:underline" href="mailto:auth@stockly-il.com">
              auth@stockly-il.com
            </a>.
          </p>

          <div className="text-muted-foreground flex flex-wrap gap-4 pt-2">
            <Link className="hover:underline" to="/">עמוד הבית</Link>
            <Link className="hover:underline" to="/contact">צור קשר</Link>
            <Link className="hover:underline" to="/privacy">מדיניות פרטיות</Link>
          </div>
      </div>
    </FlatPageLayout>
  );
}
