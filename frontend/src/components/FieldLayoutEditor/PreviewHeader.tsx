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
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">עמודה {slotIndex + 1}</span>
        {hasValue ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"
            aria-label={`מחק עמודה ${slotIndex + 1}`}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        ) : null}
      </div>
      <button
        ref={setNodeRef}
        type="button"
        onClick={onClick}
        className={`min-h-20 w-full rounded-lg border px-2 py-2 text-right transition-colors ${
          isOver ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted/50'
        }`}
        aria-label={`בחר שדה לעמודה ${slotIndex + 1}`}
      >
        <div className="flex h-full items-start justify-between ">
          <span className="whitespace-normal wrap-break-word text-right text-xs font-medium leading-tight sm:text-sm">
            {fieldLabel}
          </span>
          <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </button>
    </div>
  );
}

export function PreviewHeader({ pinnedFieldIds, allFields, onPickSlot, onClearSlot }: PreviewHeaderProps) {
  const fieldMap = new Map(allFields.map((field) => [field.id, field.label]));

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">הדמיה (תמיד מוצג למעלה)</div>
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
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
