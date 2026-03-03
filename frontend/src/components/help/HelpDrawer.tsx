import { useEffect, useMemo, useRef } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import type { HelpArticle, HelpCategory } from '../../help/types';

type HelpDrawerProps = {
  open: boolean;
  isRtl: boolean;
  categories: HelpCategory[];
  articles: HelpArticle[];
  selectedCategoryId: string | null;
  selectedArticle: HelpArticle | null;
  searchTerm: string;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onCategoryChange: (categoryId: string | null) => void;
  onArticleSelect: (articleId: string) => void;
};

export function HelpDrawer({
  open,
  isRtl,
  categories,
  articles,
  selectedCategoryId,
  selectedArticle,
  searchTerm,
  onClose,
  onSearchChange,
  onCategoryChange,
  onArticleSelect,
}: HelpDrawerProps) {
  const drawerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;

      const nodes = drawerRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        last.focus();
        event.preventDefault();
      } else if (!event.shiftKey && active === last) {
        first.focus();
        event.preventDefault();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const firstFocusable = drawerRef.current?.querySelector<HTMLElement>('input, button, [href]');
    firstFocusable?.focus();
  }, [open]);

  const sideClasses = useMemo(() => (isRtl ? 'left-0' : 'right-0'), [isRtl]);
  const transformClasses = useMemo(
    () => (open ? 'translate-x-0' : isRtl ? '-translate-x-full' : 'translate-x-full'),
    [isRtl, open]
  );

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-label="מרכז עזרה"
        aria-modal="true"
        className={`fixed ${sideClasses} top-0 z-60 h-full w-full max-w-3xl border-l bg-background shadow-2xl transition-transform ${transformClasses}`}
      >
        <div className="grid h-full grid-cols-1 md:grid-cols-[260px,1fr]">
          <div className="border-b p-3 md:border-b-0 md:border-l">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">מרכז עזרה</h2>
              <Button variant="ghost" size="sm" onClick={onClose}>
                סגור
              </Button>
            </div>
            <Input
              placeholder="חיפוש מדריכים..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant={selectedCategoryId === null ? 'default' : 'outline'}
                size="sm"
                onClick={() => onCategoryChange(null)}
              >
                הכל
              </Button>
              {categories.map((category) => (
                <Button
                  key={category.id}
                  variant={selectedCategoryId === category.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onCategoryChange(category.id)}
                >
                  {category.title}
                </Button>
              ))}
            </div>
            <div className="mt-4 max-h-[55vh] space-y-1 overflow-y-auto pr-1">
              {articles.map((article) => (
                <button
                  key={article.id}
                  type="button"
                  className={`w-full rounded-md border px-3 py-2 text-right text-sm transition hover:bg-accent ${
                    selectedArticle?.id === article.id ? 'border-primary bg-primary/5' : ''
                  }`}
                  onClick={() => onArticleSelect(article.id)}
                >
                  {article.title}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-y-auto p-4">
            {!selectedArticle ? (
              <p className="text-sm text-muted-foreground">לא נמצאו מאמרים עבור החיפוש הנוכחי.</p>
            ) : (
              <article className="space-y-3">
                <h3 className="text-xl font-bold">{selectedArticle.title}</h3>
                <p className="text-sm text-muted-foreground">{selectedArticle.description}</p>
                <ul className="list-disc space-y-1 pr-5 text-sm">
                  {selectedArticle.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {selectedArticle.videoUrl ? (
                  <div className="overflow-hidden rounded-lg border">
                    <iframe
                      title={selectedArticle.title}
                      src={selectedArticle.videoUrl}
                      className="aspect-video w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                ) : null}
                {selectedArticle.attachments?.length ? (
                  <div className="space-y-2">
                    {selectedArticle.attachments.map((attachment) => (
                      <a
                        key={`${selectedArticle.id}-${attachment.href}`}
                        href={attachment.href}
                        className="inline-flex rounded-md border px-3 py-2 text-sm hover:bg-accent"
                        download={attachment.href.toLowerCase().endsWith('.csv')}
                      >
                        {attachment.label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </article>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
