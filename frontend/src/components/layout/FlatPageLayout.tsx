import type { ReactNode } from 'react';

type FlatPageLayoutProps = {
  title: string;
  description?: string;
  children: ReactNode;
  maxWidthClass?: string;
  titleClassName?: string;
  descriptionClassName?: string;
};

export function FlatPageLayout({
  title,
  description,
  children,
  maxWidthClass = 'max-w-xl',
  titleClassName = 'text-4xl font-bold tracking-tight',
  descriptionClassName = 'mt-2 text-muted-foreground',
}: FlatPageLayoutProps) {
  return (
    <div className="min-h-screen w-full bg-white dark:bg-slate-950">
      <div className={`mx-auto w-full ${maxWidthClass} px-4 py-10`}>
        <header className="mb-6 border-b border-border pb-4">
          <h1 className={titleClassName}>{title}</h1>
          {description ? (
            <p className={descriptionClassName}>{description}</p>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}
