import type { UserHelpPreferences } from './types';

export function getUserHelpPreferencesStorageKey(userId: string): string {
  return `stockly:pref:${userId}`;
}

export function readUserHelpPreferences(userId: string): UserHelpPreferences {
  const raw = localStorage.getItem(getUserHelpPreferencesStorageKey(userId));
  if (!raw) return { hasSeenWelcome: false };

  try {
    const parsed = JSON.parse(raw) as UserHelpPreferences;
    return {
      hasSeenWelcome: parsed.hasSeenWelcome === true,
      lastHelpArticleId: parsed.lastHelpArticleId,
      supportButtonHidden: parsed.supportButtonHidden === true,
    };
  } catch {
    return { hasSeenWelcome: false };
  }
}

export function writeUserHelpPreferences(userId: string, value: UserHelpPreferences): void {
  localStorage.setItem(getUserHelpPreferencesStorageKey(userId), JSON.stringify(value));
}
