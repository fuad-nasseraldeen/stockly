import { Link } from 'react-router-dom';

export function PublicAuthFooter() {
  return (
    <footer className="mt-8 w-full border-t border-slate-700 bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid grid-cols-2 gap-6 text-sm lg:grid-cols-3">
          <div className="space-y-2">
            <h4 className="font-semibold text-emerald-300">מי אנחנו</h4>
            <p className="text-slate-300">
              פלטפורמת ניהול מלאי וספקים לעסקים קטנים ובינוניים בישראל.
            </p>
            <Link to="/#about" className="text-sky-300 hover:underline">
              קרא עוד
            </Link>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-emerald-300">למה Stockly</h4>
            <p className="text-slate-300">
              ניהול פשוט ומהיר של מוצרים, ספקים ותמחור במקום אחד.
            </p>
            <Link to="/#why-stockly" className="text-sky-300 hover:underline">
              למה זה חשוב
            </Link>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-emerald-300">למי זה מתאים</h4>
            <p className="text-slate-300">
              לבעלי עסקים, מכולות וחנויות שרוצים סדר, שליטה וחיסכון בזמן.
            </p>
            <Link to="/#who-its-for" className="text-sky-300 hover:underline">
              למי השירות מתאים
            </Link>
          </div>
          <div className="mt-4 grid gap-x-2  text-sm sm:flex sm:flex-wrap">
            <Link to="/privacy" className="text-sky-300 hover:underline">מדיניות פרטיות</Link>
            <Link to="/terms" className="text-sky-300 hover:underline">תנאי שימוש</Link>
            <Link to="/contact" className="text-sky-300 hover:underline">צור קשר</Link>
        </div>
        </div>


      </div>

      <div className="w-full border-t border-slate-700 bg-slate-950/70">
        <div className="mx-auto max-w-6xl px-4 py-3 text-center text-xs text-slate-300">
          © 2026 סטוקלי. כל הזכויות שמורות.
        </div>
      </div>
    </footer>
  );
}
