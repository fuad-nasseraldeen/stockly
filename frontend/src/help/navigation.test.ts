import { describe, expect, it } from 'vitest';
import { getHelpArticleIdFromSearch } from './navigation';

describe('help deep link parser', () => {
  it('resolves article id from URL query', () => {
    expect(getHelpArticleIdFromSearch('?help=import-guide')).toBe('import-guide');
    expect(getHelpArticleIdFromSearch('?a=1&help=vat-on-off')).toBe('vat-on-off');
    expect(getHelpArticleIdFromSearch('?a=1')).toBe(null);
  });
});
