type TenantLoadingBarProps = {
  label?: string;
};

export function TenantLoadingBar({ label = 'טוען הרשאות לחנויות…' }: TenantLoadingBarProps) {
  return (
    <div className="fixed top-0 inset-x-0 z-50 flex flex-col items-center pointer-events-none">
      <div className="h-0.5 w-full bg-primary/10 overflow-hidden">
        <div className="h-full w-1/3 bg-primary/80 animate-[pulse_1.1s_ease-in-out_infinite]" />
      </div>
      <div className="mt-1 px-3 py-0.5 rounded-full bg-background/90 border border-border text-[11px] text-muted-foreground shadow-sm">
        {label}
      </div>
    </div>
  );
}

