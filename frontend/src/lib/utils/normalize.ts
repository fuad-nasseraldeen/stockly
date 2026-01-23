/**
 * Normalizes a product name for duplicate detection
 * - Trims whitespace
 * - Collapses multiple spaces
 * - Removes punctuation: . , - _ / \ ( ) [ ] { } ' " : ; ! ?
 * - Lowercases Latin characters; keeps Hebrew/Arabic as-is
 */
export function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .replace(/[.,\-_/\\()[\]{}'":;!?]/g, '') // Remove punctuation
    .toLowerCase();
}
