const STORAGE_KEY = 'stockly:accessibility';

export type AccessibilityPreferences = {
  contrast: 'default' | 'high' | 'invert';
  fontSize: number; // 1 = 100%, 1.25 = 125%, etc.
  letterSpacing: boolean;
  lineHeight: boolean;
  underlineLinks: boolean;
  largeCursor: boolean;
};

export const DEFAULT_PREFERENCES: AccessibilityPreferences = {
  contrast: 'default',
  fontSize: 1,
  letterSpacing: false,
  lineHeight: false,
  underlineLinks: false,
  largeCursor: false,
};

export function loadAccessibilityPreferences(): AccessibilityPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AccessibilityPreferences>;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      fontSize: Math.max(0.875, Math.min(1.5, Number(parsed.fontSize) || 1)),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function saveAccessibilityPreferences(prefs: AccessibilityPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function applyAccessibilityToDocument(prefs: AccessibilityPreferences): void {
  const root = document.documentElement;

  root.classList.remove('a11y-contrast-high', 'a11y-contrast-invert');
  if (prefs.contrast === 'high') root.classList.add('a11y-contrast-high');
  if (prefs.contrast === 'invert') root.classList.add('a11y-contrast-invert');

  root.style.setProperty('--a11y-font-scale', String(prefs.fontSize));

  root.classList.toggle('a11y-letter-spacing', prefs.letterSpacing);
  root.classList.toggle('a11y-line-height', prefs.lineHeight);
  root.classList.toggle('a11y-underline-links', prefs.underlineLinks);
  root.classList.toggle('a11y-large-cursor', prefs.largeCursor);
}
