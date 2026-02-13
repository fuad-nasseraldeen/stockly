import { useDroppable } from '@dnd-kit/core';
import { Pencil, X } from 'lucide-react';
import type { FieldOption, PinnedFieldIds } from './fieldLayoutTypes';

type PreviewHeaderProps = {
  pinnedFieldIds: PinnedFieldIds;
  allFields: FieldOption[];
  onPickSlot: (slotIndex: number) => void;
  onClearSlot: (slotIndex: number) => void;
};

function Slot({
  slotIndex,
  fieldLabel,
  hasValue,
  onClick,
  onClear,
}: {
  slotIndex: number;
  fieldLabel: string;
  hasValue: boolean;
  onClick: () => void;
  onClear: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${slotIndex}`,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={`min-h-20 w-full rounded-lg border px-2 py-2 text-right transition-colors ${
        isOver ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted/50'
      }`}
      aria-label={`בחר שדה לעמודה ${slotIndex + 1}`}
    >
      <div className="flex h-full flex-col gap-2">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] text-muted-foreground">עמודה {slotIndex + 1}</span>
          <div className="flex items-center gap-1">
          {hasValue ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onClear();
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"
              aria-label={`מחק עמודה ${slotIndex + 1}`}
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          ) : null}
          <Pencil className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        <span className="whitespace-normal break-words text-right text-xs font-medium leading-tight sm:text-sm">
          {fieldLabel}
        </span>
      </div>
    </button>
  );
}

export function PreviewHeader({ pinnedFieldIds, allFields, onPickSlot, onClearSlot }: PreviewHeaderProps) {
  const fieldMap = new Map(allFields.map((field) => [field.id, field.label]));

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">הדמיה (תמיד מוצג למעלה)</div>
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {pinnedFieldIds.map((fieldId, slotIndex) => {
          const label = fieldId ? fieldMap.get(fieldId) ?? 'שדה לא זמין' : 'לא נבחר שדה';
          return (
            <Slot
              key={`slot-${slotIndex}`}
              slotIndex={slotIndex}
              fieldLabel={label}
              hasValue={!!fieldId}
              onClick={() => onPickSlot(slotIndex)}
              onClear={() => onClearSlot(slotIndex)}
            />
          );
        })}
      </div>
    </div>
  );
}
