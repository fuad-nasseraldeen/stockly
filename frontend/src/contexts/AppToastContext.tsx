import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export type AppToastInput = {
  title: string;
  description?: string;
  /** milliseconds, default 5000 */
  duration?: number;
};

type ToastItem = AppToastInput & { id: string; duration: number };

type AppToastContextValue = {
  push: (t: AppToastInput) => void;
};

const AppToastContext = createContext<AppToastContextValue | null>(null);

export function AppToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((t: AppToastInput) => {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const duration = t.duration ?? 5000;
    setToasts((prev) => [...prev, { ...t, id, duration }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, duration);
  }, []);

  return (
    <AppToastContext.Provider value={{ push }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-28 left-1/2 z-[100] flex w-[min(100vw-2rem,28rem)] -translate-x-1/2 flex-col gap-2 sm:bottom-8"
        dir="rtl"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="pointer-events-auto overflow-hidden rounded-lg border border-border bg-background/95 shadow-lg backdrop-blur"
            >
              <div className="px-4 py-3">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.description ? (
                  <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{t.description}</p>
                ) : null}
              </div>
              <div className="h-1 w-full bg-muted">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: t.duration / 1000, ease: 'linear' }}
                  style={{ transformOrigin: 'right' }}
                />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </AppToastContext.Provider>
  );
}

export function useAppToast(): AppToastContextValue {
  const ctx = useContext(AppToastContext);
  if (!ctx) {
    throw new Error('useAppToast must be used within AppToastProvider');
  }
  return ctx;
}
