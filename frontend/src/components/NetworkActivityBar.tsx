import { useEffect, useRef, useState } from 'react';
import { subscribeNetworkProgress } from '../lib/network-progress';

export function NetworkActivityBar() {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = subscribeNetworkProgress(({ active: nextActive }) => {
      setActive(nextActive);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (active > 0) {
      setVisible(true);
      if (progress < 10) setProgress(10);

      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }

      timerRef.current = window.setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return prev;
          const step = prev < 40 ? 6 : prev < 70 ? 3 : 1.2;
          return Math.min(90, prev + step);
        });
      }, 140);
      return;
    }

    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!visible) return;
    setProgress(100);
    const hideTimeout = window.setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 320);
    return () => window.clearTimeout(hideTimeout);
  }, [active, visible, progress]);

  return (
    <div
      className={`pointer-events-none fixed top-0 left-0 right-0 z-[120] h-1 transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      aria-hidden
    >
      <div
        className="h-full bg-linear-to-r from-sky-500 via-indigo-500 to-emerald-500 transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
