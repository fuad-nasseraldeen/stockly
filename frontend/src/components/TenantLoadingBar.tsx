import { useEffect, useState } from 'react';

type TenantLoadingBarProps = {
  label?: string;
};

export function TenantLoadingBar({ label = 'בודק גישה לחנויות…' }: TenantLoadingBarProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let direction: 1 | -1 = 1;
    const id = window.setInterval(() => {
      setProgress((prev) => {
        let next = prev + direction * 4;
        if (next >= 100) {
          next = 100;
          direction = -1;
        } else if (next <= 0) {
          next = 0;
          direction = 1;
        }
        return next;
      });
    }, 80);

    return () => window.clearInterval(id);
  }, []);

  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="fixed bottom-6 inset-x-0 z-50 flex justify-center pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-background/95 px-3 py-1.5 shadow-lg">
        <div className="relative h-10 w-10">
          <svg className="h-10 w-10 -rotate-90" viewBox="0 0 40 40">
            <circle
              cx="20"
              cy="20"
              r={radius}
              className="stroke-muted"
              strokeWidth="3"
              fill="transparent"
            />
            <circle
              cx="20"
              cy="20"
              r={radius}
              className="stroke-primary"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums">
            {progress}%
          </div>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      </div>
    </div>
  );
}

