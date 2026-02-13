import { useState } from 'react';
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { Button } from '../ui/button';
import { PreviewHeader } from './PreviewHeader';
import { FieldLibrary } from './FieldLibrary';
import { FieldPickerModal } from './FieldPickerModal';
import type { FieldOption, PinnedFieldIds } from './fieldLayoutTypes';
import { assignPinnedField } from './fieldLayoutUtils';

type FieldLayoutEditorProps = {
  allFields: FieldOption[];
  pinnedFieldIds: PinnedFieldIds;
  onChange: (next: PinnedFieldIds) => void;
  onSave: () => Promise<void>;
  onReset: () => Promise<void>;
  saving?: boolean;
  loading?: boolean;
};

export function FieldLayoutEditor({
  allFields,
  pinnedFieldIds,
  onChange,
  onSave,
  onReset,
  saving = false,
  loading = false,
}: FieldLayoutEditorProps) {
  const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 10 },
    })
  );

  const handleDrop = (event: DragEndEvent) => {
    const activeId = String(event.active.id || '');
    const overId = String(event.over?.id || '');
    if (!activeId.startsWith('field:') || !overId.startsWith('slot:')) return;

    const fieldId = activeId.replace('field:', '');
    const slotIndex = Number(overId.replace('slot:', ''));
    if (!fieldId || Number.isNaN(slotIndex)) return;

    onChange(assignPinnedField(pinnedFieldIds, slotIndex, fieldId));
  };

  const selectedCount = pinnedFieldIds.filter((id) => !!id).length;
  const canSave = selectedCount >= 2;
  const fieldMap = new Map(allFields.map((field) => [field.id, field.label]));

  return (
    <DndContext sensors={sensors} onDragEnd={handleDrop} modifiers={[restrictToWindowEdges]}>
      <div className="space-y-4">
        <PreviewHeader
          allFields={allFields}
          pinnedFieldIds={pinnedFieldIds}
          onPickSlot={(slotIndex) => setPickerSlotIndex(slotIndex)}
          onClearSlot={(slotIndex) => onChange(assignPinnedField(pinnedFieldIds, slotIndex, null))}
        />
        <p className="text-xs text-muted-foreground">
          אפשר לבחור בין 2 ל־4 עמודות למעלה. כרגע נבחרו {selectedCount}/4.
        </p>
        <div className="rounded-lg border p-3">
          <div className="mb-2 text-xs font-semibold text-muted-foreground">נבחר כרגע:</div>
          <div className="space-y-1 text-sm">
            {pinnedFieldIds.map((fieldId, index) => (
              <div key={`selected-${index}`} className="flex items-start justify-between gap-2">
                <span className="text-xs text-muted-foreground">עמודה {index + 1}</span>
                <span className="text-right leading-tight">
                  {fieldId ? fieldMap.get(fieldId) ?? 'שדה לא זמין' : 'לא נבחר שדה'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <FieldLibrary allFields={allFields} pinnedFieldIds={pinnedFieldIds} />

        <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:justify-between">
          <Button variant="outline" disabled={loading || saving} onClick={() => void onReset()}>
            איפוס
          </Button>
          <Button disabled={loading || saving || !canSave} onClick={() => void onSave()}>
            {saving ? 'שומר...' : 'שמור'}
          </Button>
        </div>

        {!canSave ? <p className="text-xs text-muted-foreground">צריך לבחור לפחות 2 עמודות לפני שמירה.</p> : null}
      </div>

      <FieldPickerModal
        open={pickerSlotIndex !== null}
        onOpenChange={(open) => {
          if (!open) setPickerSlotIndex(null);
        }}
        slotIndex={pickerSlotIndex}
        allFields={allFields}
        pinnedFieldIds={pinnedFieldIds}
        onSelectField={(fieldId) => {
          if (pickerSlotIndex == null) return;
          onChange(assignPinnedField(pinnedFieldIds, pickerSlotIndex, fieldId));
          setPickerSlotIndex(null);
        }}
      />
    </DndContext>
  );
}
