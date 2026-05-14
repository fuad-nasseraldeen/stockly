type StocklyMarkProps = {
  size?: number;
  className?: string;
};

export function StocklyMark({ size = 40, className = '' }: StocklyMarkProps) {
  return (
    <div
      className={`flex items-center justify-center rounded-2xl bg-[#2f66e0] text-white shadow-lg shadow-[#2f66e0]/30 ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ width: Math.max(14, Math.round(size * 0.52)), height: Math.max(14, Math.round(size * 0.52)) }}
      >
        <path d="M12 2 3 7l9 5 9-5-9-5Z" />
        <path d="M3 17l9 5 9-5" />
        <path d="M3 12l9 5 9-5" />
        <path d="M12 12v10" />
      </svg>
    </div>
  );
}
