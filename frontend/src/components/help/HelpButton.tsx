import { useMemo } from 'react';

export function HelpButton({ onClick }: { onClick: () => void }) {
  const isRtl = useMemo(
    () => typeof document !== 'undefined' && document.documentElement.dir === 'rtl',
    []
  );

  return (
    <div className={`fixed top-20 z-40 ${isRtl ? 'left-4' : 'right-4'}`}>
      <button
        type="button"
        onClick={onClick}
        className="rounded-full border border-border bg-background px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-accent"
        aria-label="פתח מרכז עזרה"
      >
        ❓ עזרה
      </button>
    </div>
  );
}
