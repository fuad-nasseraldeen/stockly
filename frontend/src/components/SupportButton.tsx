import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, X } from 'lucide-react';
import { useHelpCenter } from '../contexts/HelpCenterContext';

export function SupportButton() {
  const navigate = useNavigate();
  const { supportButtonHidden, hideSupportButton } = useHelpCenter();
  const [dismissHintVisible, setDismissHintVisible] = useState(false);

  useEffect(() => {
    if (!dismissHintVisible) return;
    const t = window.setTimeout(() => setDismissHintVisible(false), 4000);
    return () => window.clearTimeout(t);
  }, [dismissHintVisible]);

  const handleDismiss = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await hideSupportButton();
    setDismissHintVisible(true);
  };

  if (supportButtonHidden && !dismissHintVisible) return null;

  return (
    <div className="fixed bottom-24 left-20 z-40 flex flex-col gap-2 sm:bottom-6 sm:left-20">
      {dismissHintVisible && (
        <div className="rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground shadow-md">
          אפשר להציג שוב בהגדרות
        </div>
      )}
      {!supportButtonHidden && (
        <div className="relative">
          <button
            type="button"
            onClick={() => navigate('/support')}
            className="group flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-200 hover:scale-110 hover:shadow-xl"
            aria-label="פתח תמיכה"
            title="תמיכה"
          >
            <MessageCircle className="h-6 w-6 shrink-0 transition-transform duration-200 group-hover:scale-110" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground shadow-sm transition hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
            aria-label="הסתר כפתור תמיכה"
            title="הסתר"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
}
