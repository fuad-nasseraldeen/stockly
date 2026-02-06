import { motion, useReducedMotion } from 'framer-motion';

type SplashScreenProps = {
  /**
   * מסך פתיחה ראשוני בלבד.
   * גדל מהמרכז על כל המסך ~2 שניות ואז מתכווץ לכיוון המרכז.
   */
  mode?: 'enter';
};

export function SplashScreen({ mode = 'enter' }: SplashScreenProps) {
  const prefersReducedMotion = useReducedMotion();

  const animationProps = prefersReducedMotion
    ? {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
      }
    : {
        initial: { scale: 0.1, opacity: 0 },
        animate: {
          scale: [0.1, 1.05, 1, 0.75, 0.5],
          opacity: [0, 1, 1, 1, 0],
        },
        transition: {
          duration: 2,
          ease: 'easeInOut',
          times: [0, 0.35, 0.6, 0.8, 1],
        },
      };

  if (mode !== 'enter') {
    // Future‑proof – כרגע אנחנו משתמשים רק ב-enter
    // אבל לא שוברים קריאות קיימות אם יישארו.
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-linear-to-br from-background via-primary/20 to-background">
      <motion.div
        {...animationProps}
        className="relative flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-primary/40 bg-card/90 px-10 py-10 shadow-[0_0_120px_rgba(59,130,246,0.45)]"
        role="status"
        aria-label="Stockly נטען"
      >
        <div className="h-20 w-20 rounded-3xl bg-primary flex items-center justify-center shadow-xl">
          <span className="text-primary-foreground font-extrabold text-4xl">S</span>
        </div>
        <div className="text-center space-y-1 mt-2">
          <p className="text-[11px] uppercase tracking-[0.35em] text-muted-foreground">
            STOCK MANAGEMENT
          </p>
          <h1 className="text-4xl font-black tracking-tight text-foreground">Stockly</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול מחירים חכם לפי ספק</p>
        </div>
      </motion.div>
    </div>
  );
}

