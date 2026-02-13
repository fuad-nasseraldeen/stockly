import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Input } from '../ui/input';
import type { FieldOption, PinnedFieldIds } from './fieldLayoutTypes';

type FieldPickerModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slotIndex: number | null;
  allFields: FieldOption[];
  pinnedFieldIds: PinnedFieldIds;
  onSelectField: (fieldId: string) => void;
};

export function FieldPickerModal({
  open,
  onOpenChange,
  slotIndex,
  allFields,
  pinnedFieldIds,
  onSelectField,
}: FieldPickerModalProps) {
  const [search, setSearch] = useState('');
  const usedByOtherSlots = useMemo(() => {
    if (slotIndex == null) return new Set<string>();
    return new Set(
      pinnedFieldIds
        .map((id, idx) => (idx !== slotIndex ? id : null))
        .filter((id): id is string => !!id)
    );
  }, [pinnedFieldIds, slotIndex]);

  const filteredFields = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return allFields;
    return allFields.filter((field) => field.label.toLowerCase().includes(term));
  }, [allFields, search]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) setSearch('');
      }}
    >
      <DialogContent className="max-w-none h-[85vh] sm:h-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>בחר שדה לעמודה</DialogTitle>
          <DialogDescription>
            בחירה של שדה שכבר בשימוש תבצע החלפה בין העמודות.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="חיפוש שדה..."
          className="min-h-11"
        />

        <div className="space-y-2 overflow-y-auto">
          {filteredFields.map((field) => {
            const used = usedByOtherSlots.has(field.id);
            return (
              <button
                key={field.id}
                type="button"
                onClick={() => onSelectField(field.id)}
                className="flex min-h-11 w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-right hover:bg-muted/50"
              >
                <span>{field.label}</span>
                {used ? <span className="text-xs text-muted-foreground">Already used</span> : null}
              </button>
            );
          })}
          {filteredFields.length === 0 ? (
            <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              לא נמצאו שדות
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
