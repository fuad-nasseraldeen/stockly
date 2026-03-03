import { describe, expect, it } from 'vitest';
import { readUserHelpPreferences, writeUserHelpPreferences } from './preferences';

describe('help preferences', () => {
  it('stores welcome state per user', () => {
    writeUserHelpPreferences('user-a', { hasSeenWelcome: true, lastHelpArticleId: 'import-guide' });
    writeUserHelpPreferences('user-b', { hasSeenWelcome: false });

    expect(readUserHelpPreferences('user-a').hasSeenWelcome).toBe(true);
    expect(readUserHelpPreferences('user-a').lastHelpArticleId).toBe('import-guide');
    expect(readUserHelpPreferences('user-b').hasSeenWelcome).toBe(false);
  });
});
