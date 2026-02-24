import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { FlatPageLayout } from '../components/layout/FlatPageLayout';

export default function PublicLanding() {
  return (
    <FlatPageLayout
      title="Stockly - ניהול מלאי וספקים לעסקים קטנים"
      description="מערכת ניהול מלאי מבוססת ווב לחנויות קמעונאיות ומכולות בישראל."
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-6 rounded-xl border border-border bg-card/60 p-5">
        <section id="about" className="space-y-2">
          <h2 className="text-lg font-semibold">מי אנחנו</h2>
          <p className="text-sm text-muted-foreground">
            Stockly היא מערכת ניהול מלאי מבוססת ווב לחנויות קמעונאיות ומכולות בישראל.
            ניהול מוצרים, ספקים, מחירים ותהליכי מלאי - במקום אחד.
          </p>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <section id="why-stockly" className="rounded-lg border bg-background/60 p-4">
            <h3 className="mb-1 font-medium">למה Stockly</h3>
            <p className="text-sm text-muted-foreground">
              מעקב מוצרים, ניהול ספקים, עדכוני מחירים ושיפור זרימת העבודה השוטפת.
            </p>
          </section>
          <section id="who-its-for" className="rounded-lg border bg-background/60 p-4">
            <h3 className="mb-1 font-medium">למי זה מתאים</h3>
            <p className="text-sm text-muted-foreground">
              לעסקים קטנים ובינוניים שצריכים ניהול מלאי פשוט, מהיר ואמין ביום-יום.
            </p>
          </section>
        </div>

        <div className="rounded-lg border bg-background/60 p-4 space-y-1">
          <p className="text-sm"><span className="font-medium">מופעל על ידי:</span> Fuad Nasseraldeen</p>
          <p className="text-sm"><span className="font-medium">מיקום:</span> ישראל</p>
          <p className="text-sm">
            <span className="font-medium">יצירת קשר:</span>{' '}
            <a className="text-primary hover:underline" href="mailto:auth@stockly-il.com">
              auth@stockly-il.com
            </a>
          </p>
          <p className="text-sm">
            <span className="font-medium">LinkedIn:</span>{' '}
            <a
              className="text-primary hover:underline"
              href="https://www.linkedin.com/in/fuad-nasseraldeen/"
              target="_blank"
              rel="noreferrer"
            >
              fuad-nasseraldeen
            </a>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/login">התחברות</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/signup">פתיחת חשבון</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/contact">צור קשר</Link>
          </Button>
        </div>

      </div>
    </FlatPageLayout>
  );
}
