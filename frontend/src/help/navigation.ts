export function getHelpArticleIdFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  const value = params.get('help');
  if (!value) return null;
  return value.trim() || null;
}
