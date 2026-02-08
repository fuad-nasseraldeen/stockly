import { motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';

type SplashScreenProps = {
  onDone?: () => void;
};

export function SplashScreen({ onDone }: SplashScreenProps) {
  const prefersReducedMotion = useReducedMotion();
  const [finished, setFinished] = useState(false);

  const animationProps = prefersReducedMotion
    ? {
        initial: { opacity: 1 },
        animate: { opacity: 0 },
        transition: { duration: 0.2, ease: 'easeOut' },
      }
      : {
        initial: { scale: 0.1, opacity: 0 },
        animate: { 
          scale: [0.1, 1, 1, 0.5], 
          opacity: [0, 1, 1, 0] 
        },
        transition: { 
          duration: 3.5, // 0.5s גדילה + 2s נשאר + 1s נעלם
          ease: [0.4, 0, 0.2, 1], 
          times: [0, 0.14, 0.71, 1] // 0.5s גדילה, 2s נשאר, 1s נעלם
        },
        style: {
          transformOrigin: 'center center', // גדילה מהמרכז
        },
      };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-linear-to-br from-background via-primary/20 to-background"
      style={{ pointerEvents: finished ? 'none' : 'auto' }}
    >
      <motion.div
        {...animationProps}
        onAnimationComplete={() => {
          setFinished(true);
          onDone?.();
        }}
        className="relative flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-primary/40 bg-card/90 px-10 py-10 shadow-[0_0_120px_rgba(59,130,246,0.45)]"
        role="status"
        aria-label="Stockly נטען"
        style={{
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden',
          transformOrigin: 'center center', // גדילה מהמרכז
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
      </motion.div>
    </div>
  );
}
