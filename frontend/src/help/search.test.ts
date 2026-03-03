import { describe, expect, it } from 'vitest';
import { helpContent } from './content';
import { filterHelpArticles } from './search';

describe('help search filter', () => {
  it('filters by category and query', () => {
    const pricing = filterHelpArticles(helpContent.articles, 'pricing', 'דיוק');
    expect(pricing.length).toBe(1);
    expect(pricing[0].id).toBe('decimal-places');
  });
});
