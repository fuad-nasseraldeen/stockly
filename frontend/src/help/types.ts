export type HelpAttachment = {
  label: string;
  href: string;
};

export type HelpArticle = {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  bullets: string[];
  keywords: string[];
  videoUrl?: string;
  attachments?: HelpAttachment[];
};

export type HelpCategory = {
  id: string;
  title: string;
  description?: string;
};

export type HelpContent = {
  categories: HelpCategory[];
  articles: HelpArticle[];
};

export type UserHelpPreferences = {
  hasSeenWelcome: boolean;
  lastHelpArticleId?: string;
  supportButtonHidden?: boolean;
};
