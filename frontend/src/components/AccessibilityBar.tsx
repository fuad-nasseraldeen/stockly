import { useState, useEffect } from 'react';
import { Accessibility, Contrast, Type, Space, Rows3, Link2, MousePointer2, RotateCcw, X } from 'lucide-react';
import { Button } from './ui/button';
import {
  loadAccessibilityPreferences,
  saveAccessibilityPreferences,
  applyAccessibilityToDocument,
  type AccessibilityPreferences,
  DEFAULT_PREFERENCES,
} from '../lib/accessibility';

export function AccessibilityBar() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<AccessibilityPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    const loaded = loadAccessibilityPreferences();
    setPrefs(loaded);
    applyAccessibilityToDocument(loaded);
  }, []);

  const updatePrefs = (updates: Partial<AccessibilityPreferences>) => {
    const next = { ...prefs, ...updates };
    setPrefs(next);
    saveAccessibilityPreferences(next);
    applyAccessibilityToDocument(next);
  };

  const reset = () => {
    updatePrefs(DEFAULT_PREFERENCES);
  };

  const hasChanges = JSON.stringify(prefs) !== JSON.stringify(DEFAULT_PREFERENCES);

  return (
    <div className="fixed left-4 z-40 max-sm:bottom-[calc(env(safe-area-inset-bottom,0px)+4.75rem)] sm:bottom-6">
      <div className="relative">
        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div
              className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border bg-popover p-4 shadow-xl z-50"
              role="dialog"
              aria-label="הגדרות הנגשה"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">הנגשה</h3>
                <div className="flex gap-1">
                  {hasChanges && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={reset}
                    >
                      <RotateCcw className="h-3.5 w-3.5 ml-1" />
                      איפוס
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setOpen(false)}
                    aria-label="סגור"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <label className="flex items-center gap-2 font-medium mb-1.5">
                    <Contrast className="h-4 w-4" />
                    ניגודיות
                  </label>
                  <div className="flex gap-2">
                    {(['default', 'high', 'invert'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => updatePrefs({ contrast: v })}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                          prefs.contrast === v
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:bg-muted'
                        }`}
                      >
                        {v === 'default' ? 'רגיל' : v === 'high' ? 'גבוה' : 'הפוך'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 font-medium mb-1.5">
                    <Type className="h-4 w-4" />
                    גודל טקסט
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updatePrefs({ fontSize: Math.max(0.875, prefs.fontSize - 0.125) })}
                      className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      −
                    </button>
                    <span className="flex-1 text-center text-xs">
                      {Math.round(prefs.fontSize * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => updatePrefs({ fontSize: Math.min(1.5, prefs.fontSize + 0.125) })}
                      className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <ToggleRow
                    icon={<Space className="h-4 w-4" />}
                    label="מרווח בין אותיות"
                    checked={prefs.letterSpacing}
                    onToggle={() => updatePrefs({ letterSpacing: !prefs.letterSpacing })}
                  />
                  <ToggleRow
                    icon={<Rows3 className="h-4 w-4" />}
                    label="מרווח בין שורות"
                    checked={prefs.lineHeight}
                    onToggle={() => updatePrefs({ lineHeight: !prefs.lineHeight })}
                  />
                  <ToggleRow
                    icon={<Link2 className="h-4 w-4" />}
                    label="קו תחתון לקישורים"
                    checked={prefs.underlineLinks}
                    onToggle={() => updatePrefs({ underlineLinks: !prefs.underlineLinks })}
                  />
                  <ToggleRow
                    icon={<MousePointer2 className="h-4 w-4" />}
                    label="סמן עכבר גדול"
                    checked={prefs.largeCursor}
                    onToggle={() => updatePrefs({ largeCursor: !prefs.largeCursor })}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-12 w-12 rounded-full border-2 bg-background shadow-lg hover:bg-accent"
          onClick={() => setOpen(!open)}
          aria-label="הגדרות הנגשה"
          aria-expanded={open}
          title="הנגשה"
        >
          <Accessibility className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  checked,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 hover:bg-muted/50">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onToggle}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
          checked ? 'border-primary bg-primary' : 'border-border bg-muted'
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full border bg-background shadow transition-transform ${
            checked ? 'right-1' : 'left-1'
          }`}
        />
      </button>
    </label>
  );
}
