import type { FieldOption, PinnedFieldIds } from './fieldLayoutTypes';

export const PINNED_SLOTS_COUNT = 4;

function isFieldId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function emptyPinnedFieldIds(): PinnedFieldIds {
  return [null, null, null, null];
}

export function normalizePinnedFieldIds(input: unknown, allFields: FieldOption[]): PinnedFieldIds {
  const validIds = new Set(allFields.map((field) => field.id));
  const result: Array<string | null> = [null, null, null, null];

  if (!Array.isArray(input)) {
    return result as PinnedFieldIds;
  }

  const used = new Set<string>();
  for (let index = 0; index < PINNED_SLOTS_COUNT; index += 1) {
    const raw = input[index];
    if (!isFieldId(raw) || !validIds.has(raw) || used.has(raw)) {
      result[index] = null;
      continue;
    }
    used.add(raw);
    result[index] = raw;
  }

  return result as PinnedFieldIds;
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
    return normalizePinnedFieldIds(preferred.slice(0, 4), allFields);
  }

  return emptyPinnedFieldIds();
}

export function assignPinnedField(
  pinnedFieldIds: PinnedFieldIds,
  slotIndex: number,
  nextFieldId: string | null
): PinnedFieldIds {
  if (slotIndex < 0 || slotIndex >= PINNED_SLOTS_COUNT) {
    return [...pinnedFieldIds] as PinnedFieldIds;
  }

  const next = [...pinnedFieldIds] as PinnedFieldIds;

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

export function deriveHiddenFields(allFields: FieldOption[], pinnedFieldIds: PinnedFieldIds): FieldOption[] {
  const pinnedSet = new Set(pinnedFieldIds.filter((id): id is string => !!id));
  return allFields.filter((field) => !pinnedSet.has(field.id));
}

export function isPinnedComplete(pinnedFieldIds: PinnedFieldIds): boolean {
  return pinnedFieldIds.every((id) => !!id);
}
