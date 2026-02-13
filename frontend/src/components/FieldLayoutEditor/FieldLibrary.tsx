import { useDraggable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import type { FieldOption, PinnedFieldIds } from './fieldLayoutTypes';

type FieldLibraryProps = {
  allFields: FieldOption[];
  pinnedFieldIds: PinnedFieldIds;
};

function DraggableField({
  field,
  isPinned,
}: {
  field: FieldOption;
  isPinned: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `field:${field.id}`,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`flex min-h-11 w-full items-center justify-between rounded-lg border px-3 py-2 text-right ${
        isDragging ? 'opacity-50' : 'opacity-100'
      } ${isPinned ? 'border-primary/40 bg-primary/5' : 'border-border bg-background hover:bg-muted/50'}`}
      style={style}
      {...listeners}
      {...attributes}
    >
      <span className="max-h-10 overflow-hidden whitespace-normal break-words text-right text-sm leading-tight">
        {field.label}
      </span>
      <div className="flex items-center gap-2">
        {isPinned ? <span className="text-xs text-muted-foreground">מקובע</span> : null}
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  );
}

export function FieldLibrary({ allFields, pinnedFieldIds }: FieldLibraryProps) {
  const pinnedSet = new Set(pinnedFieldIds.filter((id): id is string => !!id));

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">ספריית שדות (גרור לעמודות למעלה)</div>
      <div className="grid grid-cols-2 gap-2">
        {allFields.map((field) => (
          <DraggableField key={field.id} field={field} isPinned={pinnedSet.has(field.id)} />
        ))}
      </div>
    </div>
  );
}
