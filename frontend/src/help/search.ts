import type { HelpArticle } from './types';

export function filterHelpArticles(
  articles: HelpArticle[],
  categoryId: string | null,
  query: string
): HelpArticle[] {
  const q = query.trim().toLowerCase();

  return articles.filter((article) => {
    if (categoryId && article.categoryId !== categoryId) return false;
    if (!q) return true;

    const haystack = [
      article.title,
      article.description,
      article.keywords.join(' '),
      article.bullets.join(' '),
    ]
      .join(' ')
      .toLowerCase();

    return q.split(/\s+/).every((token) => haystack.includes(token));
  });
}
