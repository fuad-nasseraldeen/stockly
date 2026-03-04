import { useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronDown, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Button } from '../ui/button';
import type { PinnedFieldIds } from './fieldLayoutTypes';
import type { ColumnDefinition } from '../../lib/price-columns';
import type { Settings } from '../../lib/column-resolver';
import { MIN_PINNED_SLOTS } from './fieldLayoutUtils';

const MOCK_PRICE = {
  cost_price: 8.5,
  cost_price_after_discount: 8.5,
  package_quantity: 1,
  supplier_id: 'mock',
  supplier_name: 'דוגמה',
  created_at: new Date().toISOString(),
};

const MOCK_PRODUCT = { package_quantity: 1, unit: 'unit' as const };

type PreviewHeaderProps = {
  pinnedFieldIds: PinnedFieldIds;
  availableColumns: ColumnDefinition[];
  appSettings: Settings;
  onPickSlot: (slotIndex: number) => void;
  onAddColumn: () => void;
  onRemoveSlot: (slotIndex: number) => void;
};

function DroppableSlot({
  slotIndex,
  children,
  onClick,
}: {
  slotIndex: number;
  children: React.ReactNode;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${slotIndex}` });
  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
      className={`cursor-pointer transition-all ${isOver ? 'ring-2 ring-primary/30 ring-inset' : ''}`}
    >
      {children}
    </div>
  );
}

function ColumnMenu({
  canRemove,
  onPickField,
  onRemoveColumn,
}: {
  canRemove: boolean;
  onPickField: () => void;
  onRemoveColumn: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        aria-label="תפריט עמודה"
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 z-50 min-w-[140px] rounded-lg border border-border bg-popover shadow-lg py-1"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onPickField();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-right text-sm hover:bg-muted"
          >
            <Pencil className="h-4 w-4 shrink-0" />
            החלף שדה
          </button>
          {canRemove && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onRemoveColumn();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-right text-sm hover:bg-destructive/10 text-destructive"
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              מחק עמודה
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function PreviewHeader({
  pinnedFieldIds,
  availableColumns,
  appSettings,
  onPickSlot,
  onAddColumn,
  onRemoveSlot,
}: PreviewHeaderProps) {
  const columnMap = new Map<string, ColumnDefinition>(
    availableColumns.map((col) => [col.id, col])
  );
  const canRemove = pinnedFieldIds.length > MIN_PINNED_SLOTS;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">תצוגה מקדימה – בדיוק כמו בדף המוצר</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddColumn}
          className="gap-1"
        >
          <Plus className="h-4 w-4" />
          הוסף עמודה
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border">
              {pinnedFieldIds.map((fieldId, slotIndex) => {
                const col = fieldId ? columnMap.get(fieldId) : null;
                const label = col ? col.headerLabel : 'לא נבחר – לחץ לבחירה';
                return (
                  <TableHead key={`head-${slotIndex}`} className="font-semibold">
                    <div className="flex items-center justify-between gap-1">
                      <DroppableSlot slotIndex={slotIndex} onClick={() => onPickSlot(slotIndex)}>
                        <span className="text-muted-foreground">{label}</span>
                      </DroppableSlot>
                      <ColumnMenu
                        canRemove={canRemove}
                        onPickField={() => onPickSlot(slotIndex)}
                        onRemoveColumn={() => onRemoveSlot(slotIndex)}
                      />
                    </div>
                  </TableHead>
                );
              })}
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="border-b border-border hover:bg-muted/50">
              {pinnedFieldIds.map((fieldId, slotIndex) => {
                const col = fieldId ? columnMap.get(fieldId) : null;
                return (
                  <TableCell key={`cell-${slotIndex}`}>
                    <DroppableSlot slotIndex={slotIndex} onClick={() => onPickSlot(slotIndex)}>
                      {col ? (
                        col.renderCell(MOCK_PRICE, MOCK_PRODUCT, appSettings)
                      ) : (
                        <span className="text-muted-foreground text-sm flex items-center gap-1">
                          <Pencil className="h-3.5 w-3.5" />
                          לחץ לבחירה
                        </span>
                      )}
                    </DroppableSlot>
                  </TableCell>
                );
              })}
              <TableCell>
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
