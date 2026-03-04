import type { FieldOption, PinnedFieldId, PinnedFieldIds } from './fieldLayoutTypes';

const DEFAULT_SLOTS_COUNT = 3;

function isFieldId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function emptyPinnedFieldIds(): PinnedFieldIds {
  return Array.from({ length: DEFAULT_SLOTS_COUNT }, () => null);
}

export function normalizePinnedFieldIds(input: unknown, allFields: FieldOption[]): PinnedFieldIds {
  const validIds = new Set(allFields.map((field) => field.id));

  if (!Array.isArray(input)) {
    return emptyPinnedFieldIds();
  }

  const used = new Set<string>();
  const result: PinnedFieldId[] = [];
  for (const raw of input) {
    if (!isFieldId(raw) || !validIds.has(raw) || used.has(raw)) {
      result.push(null);
      continue;
    }
    used.add(raw);
    result.push(raw);
  }

  if (result.length === 0) {
    return emptyPinnedFieldIds();
  }
  return result;
}

export function parsePinnedFieldIdsFromSavedLayout(
  savedLayout: unknown,
  allFields: FieldOption[]
): PinnedFieldIds {
  if (savedLayout && typeof savedLayout === 'object' && 'pinnedFieldIds' in savedLayout) {
    const pinned = (savedLayout as { pinnedFieldIds?: unknown }).pinnedFieldIds;
    return normalizePinnedFieldIds(pinned, allFields);
  }

  // Backward compatibility: migrate legacy { visible, order } shape to pinnedFieldIds.
  if (
    savedLayout &&
    typeof savedLayout === 'object' &&
    'order' in savedLayout &&
    Array.isArray((savedLayout as { order?: unknown }).order)
  ) {
    const legacy = savedLayout as {
      order?: unknown[];
      visible?: Record<string, boolean> | undefined;
    };
    const visible = legacy.visible ?? {};
    const preferred = (legacy.order ?? []).filter(
      (id): id is string => isFieldId(id) && id !== 'actions' && visible[id] !== false
    );
    return normalizePinnedFieldIds(preferred, allFields);
  }

  return emptyPinnedFieldIds();
}

export function assignPinnedField(
  pinnedFieldIds: PinnedFieldIds,
  slotIndex: number,
  nextFieldId: string | null
): PinnedFieldIds {
  if (slotIndex < 0 || slotIndex >= pinnedFieldIds.length) {
    return [...pinnedFieldIds];
  }

  const next = [...pinnedFieldIds];

  if (!nextFieldId) {
    next[slotIndex] = null;
    return next;
  }

  const currentIndex = next.findIndex((id, idx) => id === nextFieldId && idx !== slotIndex);
  if (currentIndex >= 0) {
    const temp = next[slotIndex];
    next[slotIndex] = nextFieldId;
    next[currentIndex] = temp;
    return next;
  }

  next[slotIndex] = nextFieldId;
  return next;
}

export const MIN_PINNED_SLOTS = 2;

export function addPinnedSlot(pinnedFieldIds: PinnedFieldIds): PinnedFieldIds {
  return [...pinnedFieldIds, null];
}

export function removePinnedSlot(
  pinnedFieldIds: PinnedFieldIds,
  slotIndex: number
): PinnedFieldIds {
  if (pinnedFieldIds.length <= MIN_PINNED_SLOTS) return pinnedFieldIds;
  const next = [...pinnedFieldIds];
  next.splice(slotIndex, 1);
  return next;
}

export function deriveHiddenFields(allFields: FieldOption[], pinnedFieldIds: PinnedFieldIds): FieldOption[] {
  const pinnedSet = new Set(pinnedFieldIds.filter((id): id is string => !!id));
  return allFields.filter((field) => !pinnedSet.has(field.id));
}

export function isPinnedComplete(pinnedFieldIds: PinnedFieldIds): boolean {
  return pinnedFieldIds.every((id) => !!id);
}
