import { useState } from 'react';
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { Button } from '../ui/button';
import { PreviewHeader } from './PreviewHeader';
import { FieldLibrary } from './FieldLibrary';
import { FieldPickerModal } from './FieldPickerModal';
import type { FieldOption, PinnedFieldIds } from './fieldLayoutTypes';
import { addPinnedSlot, assignPinnedField, removePinnedSlot } from './fieldLayoutUtils';
import type { ColumnDefinition } from '../../lib/price-columns';
import type { Settings } from '../../lib/column-resolver';

type FieldLayoutEditorProps = {
  allFields: FieldOption[];
  availableColumns: ColumnDefinition[];
  appSettings: Settings;
  pinnedFieldIds: PinnedFieldIds;
  onChange: (next: PinnedFieldIds) => void;
  onSave: () => Promise<void>;
  onReset: () => Promise<void>;
  saving?: boolean;
  loading?: boolean;
};

export function FieldLayoutEditor({
  allFields,
  availableColumns,
  appSettings,
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

  return (
    <DndContext sensors={sensors} onDragEnd={handleDrop} modifiers={[restrictToWindowEdges]}>
      <div className="space-y-5">
        <PreviewHeader
          availableColumns={availableColumns}
          appSettings={appSettings}
          pinnedFieldIds={pinnedFieldIds}
          onPickSlot={(slotIndex) => setPickerSlotIndex(slotIndex)}
          onAddColumn={() => onChange(addPinnedSlot(pinnedFieldIds))}
          onRemoveSlot={(slotIndex) => onChange(removePinnedSlot(pinnedFieldIds, slotIndex))}
        />
        <p className="text-xs text-muted-foreground">
          נבחרו {selectedCount} עמודות. לחץ על עמודה או גרור שדה מהרשימה למטה.
        </p>

        <FieldLibrary allFields={allFields} pinnedFieldIds={pinnedFieldIds} />

        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="order-2 sm:order-1">
            {!canSave ? (
              <p className="text-xs text-muted-foreground">נדרשות לפחות 2 עמודות לשמירה.</p>
            ) : null}
          </div>
          <div className="flex gap-2 order-1 sm:order-2">
            <Button variant="outline" size="sm" disabled={loading || saving} onClick={() => void onReset()}>
              איפוס
            </Button>
            <Button size="sm" disabled={loading || saving || !canSave} onClick={() => void onSave()}>
              {saving ? 'שומר...' : 'שמור'}
            </Button>
          </div>
        </div>
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
