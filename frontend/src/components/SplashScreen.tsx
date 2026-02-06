import { motion, useReducedMotion } from 'framer-motion';

type SplashScreenProps = {
  /**
   * How the splash should feel:
   * - "enter": first time app opens – card נופל מלמעלה, מתייצב במרכז.
   * - "exit": אחרי לוגאין/רישום – מופיע מלמטה, מרגיש כמו יציאה הפוכה.
   */
  mode?: 'enter' | 'exit';
};

export function SplashScreen({ mode = 'enter' }: SplashScreenProps) {
  const prefersReducedMotion = useReducedMotion();

  const containerProps = prefersReducedMotion
    ? {}
    : mode === 'enter'
    ? {
        initial: { opacity: 0, y: -40, scale: 0.96, rotateX: -8 },
        animate: { opacity: 1, y: 0, scale: 1, rotateX: 0 },
        transition: { duration: 0.6, ease: 'easeOut' },
      }
    : {
        initial: { opacity: 0, y: 40, scale: 0.96, rotateX: 8 },
        animate: { opacity: 1, y: 0, scale: 1, rotateX: 0 },
        transition: { duration: 0.6, ease: 'easeOut' },
      };

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-background via-primary/5 to-background">
      <motion.div
        {...containerProps}
        className="flex flex-col items-center justify-center gap-4 px-6 py-8 rounded-2xl bg-card/80 backdrop-blur border-2 border-border shadow-xl max-w-sm w-full"
        role="status"
        aria-label="Stockly נטען"
      >
        <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
          <span className="text-primary-foreground font-extrabold text-2xl">S</span>
        </div>
        <div className="text-center space-y-1">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            STOCK MANAGEMENT
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Stockly</h1>
          <p className="text-sm text-muted-foreground">
            ניהול מחירים חכם לפי ספק • מסך פתיחה
          </p>
        </div>
        <div className="mt-2 flex flex-col items-center gap-2">
          <div className="h-1.5 w-32 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-1/2 rounded-full bg-primary/80 animate-[pulse_1.1s_ease-in-out_infinite]" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            טוען את לוח המוצרים שלך...
          </p>
        </div>
      </motion.div>
    </div>
  );
}

