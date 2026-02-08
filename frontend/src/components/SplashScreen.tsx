import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

type SplashScreenProps = {
  onDone?: () => void;
};

export function SplashScreen({ onDone }: SplashScreenProps) {
  const prefersReducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<'enter' | 'exit'>('enter');

  // Start exit after 0.5s enter + 2s hold = 2.5s
  useEffect(() => {
    const t = window.setTimeout(() => setPhase('exit'), prefersReducedMotion ? 120 : 2500);
    return () => window.clearTimeout(t);
  }, [prefersReducedMotion]);

  const overlayPointerEvents = phase === 'exit' ? 'none' : 'auto';

  const cardVariants = prefersReducedMotion
    ? {
        enter: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 1, transition: { duration: 0.2, ease: 'easeOut' } },
      }
    : {
        enter: {
          opacity: 1,
          scale: 1,
          transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
        },
        exit: {
          opacity: 0,
          scale: 0.9,
          transition: { duration: 1, ease: [0.16, 1, 0.3, 1] },
        },
      };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-background via-primary/20 to-background"
      style={{ pointerEvents: overlayPointerEvents }}
      aria-hidden={phase === 'exit' ? true : undefined}
    >
      <motion.div
        initial={prefersReducedMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.1 }}
        animate={phase}
        variants={cardVariants}
        onAnimationComplete={() => {
          if (phase === 'exit') onDone?.();
        }}
        className="relative flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-primary/40 bg-card/90 px-10 py-10 shadow-[0_0_120px_rgba(59,130,246,0.45)]"
        role="status"
        aria-label="Stockly נטען"
        style={{
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden',
          transformOrigin: 'center center',
        }}
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

        {!prefersReducedMotion && (
          <div className="mt-6 w-full max-w-xs h-1 overflow-hidden rounded-full bg-muted/30 relative">
            <motion.div
              className="h-full bg-primary absolute"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
              style={{ width: '40%', left: 0 }}
            />
          </div>
        )}
      </motion.div>
    </div>
  );
}
