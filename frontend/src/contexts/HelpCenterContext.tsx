import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { settingsApi } from '../lib/api';
import { helpContent } from '../help/content';
import { filterHelpArticles } from '../help/search';
import type { HelpArticle, UserHelpPreferences } from '../help/types';
import { readUserHelpPreferences, writeUserHelpPreferences } from '../help/preferences';
import { useTenant } from '../hooks/useTenant';

const HELP_PREF_KEY = 'help_center';

type HelpCenterContextValue = {
  isReady: boolean;
  isDrawerOpen: boolean;
  searchTerm: string;
  selectedCategoryId: string | null;
  selectedArticleId: string | null;
  selectedArticle: HelpArticle | null;
  filteredArticles: HelpArticle[];
  preferences: UserHelpPreferences;
  welcomeOpen: boolean;
  supportButtonHidden: boolean;
  openHelp: (articleId?: string) => void;
  closeHelp: () => void;
  setSearchTerm: (value: string) => void;
  setSelectedCategoryId: (categoryId: string | null) => void;
  setSelectedArticleId: (articleId: string | null) => void;
  markWelcomeSeen: () => Promise<void>;
  resetWelcome: () => Promise<void>;
  hideSupportButton: () => Promise<void>;
  showSupportButton: () => Promise<void>;
};

const HelpCenterContext = createContext<HelpCenterContextValue | undefined>(undefined);

export function HelpCenterProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const { currentTenant } = useTenant();
  const [isReady, setIsReady] = useState(false);
  const [preferences, setPreferences] = useState<UserHelpPreferences>({ hasSeenWelcome: false });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  useEffect(() => {
    setIsReady(false);
    const localPrefs = readUserHelpPreferences(userId);
    setPreferences(localPrefs);
    setSelectedArticleId(localPrefs.lastHelpArticleId ?? null);
    setWelcomeOpen(!localPrefs.hasSeenWelcome);
    // setWelcomeOpen(false);
    setIsReady(true);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    if (!currentTenant?.id) return;

    const loadRemote = async () => {
      try {
        const remote = await settingsApi.getPreference<UserHelpPreferences>(HELP_PREF_KEY);
        if (cancelled || !remote) return;

        setPreferences((prev) => {
          const merged: UserHelpPreferences = {
            hasSeenWelcome: prev.hasSeenWelcome || remote.hasSeenWelcome === true,
            lastHelpArticleId: remote.lastHelpArticleId || prev.lastHelpArticleId,
            supportButtonHidden: remote.supportButtonHidden === true || prev.supportButtonHidden === true,
          };
          writeUserHelpPreferences(userId, merged);
          return merged;
        });
      } catch {
        // Keep app functional on preference endpoint issues.
      }
    };

    void loadRemote();
    return () => {
      cancelled = true;
    };
  }, [currentTenant?.id, userId]);

  const persistPreferences = useCallback(
    async (next: UserHelpPreferences) => {
      setPreferences(next);
      writeUserHelpPreferences(userId, next);
      if (currentTenant?.id) {
        try {
          await settingsApi.setPreference<UserHelpPreferences>(HELP_PREF_KEY, next);
        } catch {
          // localStorage fallback already persisted
        }
      }
    },
    [currentTenant?.id, userId]
  );

  const openHelp = useCallback(
    (articleId?: string) => {
      if (articleId) {
        setSelectedArticleId(articleId);
      } else if (!selectedArticleId && helpContent.articles.length > 0) {
        setSelectedArticleId(helpContent.articles[0].id);
      }
      setIsDrawerOpen(true);
    },
    [selectedArticleId]
  );

  const closeHelp = useCallback(() => setIsDrawerOpen(false), []);

  const filteredArticles = useMemo(
    () => filterHelpArticles(helpContent.articles, selectedCategoryId, searchTerm),
    [selectedCategoryId, searchTerm]
  );

  const selectedArticle = useMemo(
    () =>
      helpContent.articles.find((article) => article.id === selectedArticleId) ||
      filteredArticles[0] ||
      null,
    [filteredArticles, selectedArticleId]
  );

  useEffect(() => {
    if (!selectedArticle?.id) return;
    if (preferences.lastHelpArticleId === selectedArticle.id) return;
    const next = { ...preferences, lastHelpArticleId: selectedArticle.id };
    void persistPreferences(next);
  }, [persistPreferences, preferences, selectedArticle?.id]);

  const markWelcomeSeen = useCallback(async () => {
    const next = { ...preferences, hasSeenWelcome: true };
    setWelcomeOpen(false);
    await persistPreferences(next);
  }, [persistPreferences, preferences]);

  const resetWelcome = useCallback(async () => {
    const next = { ...preferences, hasSeenWelcome: false };
    await persistPreferences(next);
    setWelcomeOpen(true);
  }, [persistPreferences, preferences]);

  const hideSupportButton = useCallback(async () => {
    const next = { ...preferences, supportButtonHidden: true };
    await persistPreferences(next);
  }, [persistPreferences, preferences]);

  const showSupportButton = useCallback(async () => {
    const next = { ...preferences, supportButtonHidden: false };
    await persistPreferences(next);
  }, [persistPreferences, preferences]);

  const value = useMemo<HelpCenterContextValue>(
    () => ({
      isReady,
      isDrawerOpen,
      searchTerm,
      selectedCategoryId,
      selectedArticleId,
      selectedArticle,
      filteredArticles,
      preferences,
      welcomeOpen,
      supportButtonHidden: preferences.supportButtonHidden === true,
      openHelp,
      closeHelp,
      setSearchTerm,
      setSelectedCategoryId,
      setSelectedArticleId,
      markWelcomeSeen,
      resetWelcome,
      hideSupportButton,
      showSupportButton,
    }),
    [
      closeHelp,
      filteredArticles,
      hideSupportButton,
      isDrawerOpen,
      isReady,
      markWelcomeSeen,
      openHelp,
      preferences,
      resetWelcome,
      searchTerm,
      selectedArticle,
      selectedArticleId,
      selectedCategoryId,
      showSupportButton,
      welcomeOpen,
    ]
  );

  return <HelpCenterContext.Provider value={value}>{children}</HelpCenterContext.Provider>;
}

export function useHelpCenter(): HelpCenterContextValue {
  const context = useContext(HelpCenterContext);
  if (!context) {
    throw new Error('useHelpCenter must be used within HelpCenterProvider');
  }
  return context;
}
