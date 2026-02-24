import { Link } from 'react-router-dom';
import { FlatPageLayout } from '../components/layout/FlatPageLayout';

export default function PrivacyPolicy() {
  return (
    <FlatPageLayout
      title="מדיניות פרטיות"
      description="עודכן לאחרונה: פברואר 2026"
      maxWidthClass="max-w-3xl"
    >
      <div className="space-y-4 text-sm leading-6 rounded-xl border border-border bg-card/60 p-5">
          <p>
            Stockly אוספת מידע אישי מינימלי הנדרש לצורך אימות משתמשים וגישה לחשבון.
            בתהליך התחברות OTP אנו אוספים מספר טלפון ומידע טכני הקשור לאימות.
          </p>
          <p>
            המידע משמש אך ורק לאבטחת החשבון ולאימות התחברות. אנו לא מוכרים מידע אישי לצדדים שלישיים.
          </p>
          <p>
            מידע עשוי להיות מעובד על ידי ספקי תשתית הנדרשים להפעלת השירות
            (למשל ספקי אימות ושליחת הודעות SMS).
          </p>
          <p>
            ניתן לבקש עיון/מחיקה של מידע אישי באמצעות פנייה לכתובת{' '}
            <a className="text-primary hover:underline" href="mailto:auth@stockly-il.com">
              auth@stockly-il.com
            </a>.
          </p>
          <p>
            אנו מיישמים אמצעי אבטחה סבירים להגנה על נתוני אימות ולמניעת שימוש לרעה.
          </p>

          <div className="text-muted-foreground flex flex-wrap gap-4 pt-2">
            <Link className="hover:underline" to="/">עמוד הבית</Link>
            <Link className="hover:underline" to="/contact">צור קשר</Link>
            <Link className="hover:underline" to="/terms">תנאי שימוש</Link>
          </div>
      </div>
    </FlatPageLayout>
  );
}
