type ProductsSkeletonProps = {
  rows?: number;
};

export function ProductsSkeleton({ rows = 10 }: ProductsSkeletonProps) {
  const safeRows = Number.isFinite(rows) && rows > 0 ? Math.min(Math.round(rows), 50) : 10;

  return (
    <div
      className="space-y-5"
      aria-busy="true"
      aria-live="polite"
      aria-label="טוען רשימת מוצרים"
    >
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-32 rounded-md bg-muted animate-pulse" />
          <div className="h-4 w-48 rounded-md bg-muted animate-pulse" />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="h-9 w-28 rounded-md bg-muted animate-pulse" />
          <div className="h-9 w-32 rounded-md bg-muted animate-pulse" />
          <div className="h-9 w-32 rounded-md bg-muted animate-pulse" />
        </div>
      </div>

      <div className="rounded-xl border-2 border-border bg-card shadow-md">
        <div className="border-b-2 border-border px-4 py-3 flex flex-wrap gap-3 items-center">
          <div className="h-9 w-full sm:w-64 rounded-md bg-muted animate-pulse" />
          <div className="h-9 w-40 rounded-md bg-muted animate-pulse" />
          <div className="h-9 w-40 rounded-md bg-muted animate-pulse" />
          <div className="h-9 w-40 rounded-md bg-muted animate-pulse" />
        </div>

        <div className="px-3 py-4 space-y-3">
          {Array.from({ length: safeRows }).map((_, index) => (
            <div
              key={index}
              className="rounded-lg border border-border/60 bg-muted/40 px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-pulse"
            >
              <div className="space-y-2 flex-1">
                <div className="h-4 w-40 rounded-md bg-muted" />
                <div className="flex flex-wrap gap-2">
                  <div className="h-5 w-24 rounded-full bg-muted" />
                  <div className="h-5 w-16 rounded-full bg-muted" />
                  <div className="h-5 w-24 rounded-full bg-muted" />
                  <div className="h-5 w-28 rounded-full bg-muted" />
                </div>
              </div>
              <div className="flex gap-2 justify-start sm:justify-end">
                <div className="h-8 w-20 rounded-md bg-muted" />
                <div className="h-8 w-20 rounded-md bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

