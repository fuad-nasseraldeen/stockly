/**
 * Column Management Dialog
 * 
 * Allows users to show/hide and reorder columns.
 * All columns are always shown in the modal (hidden ones appear grayed out).
 */

import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ColumnId, ColumnDefinition } from '../../lib/price-columns';
import { ColumnLayout, getDefaultLayout, type Settings } from '../../lib/column-resolver';
import { Search, GripVertical, Eye, EyeOff } from 'lucide-react';
import { DEFAULT_COLUMN_ORDER, DEFAULT_VISIBLE_COLUMNS } from '../../lib/price-columns';

type ColumnManagerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentLayout: ColumnLayout;
  availableColumns: ColumnDefinition[];
  settings: Settings;
  onSave: (layout: ColumnLayout) => void;
  onReset: () => void;
};

type SortableColumnItemProps = {
  column: ColumnDefinition;
  isVisible: boolean;
  onToggleVisibility: () => void;
};

function SortableColumnItem({ column, isVisible, onToggleVisibility }: SortableColumnItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };


  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-2 p-2 border rounded-lg hover:bg-muted/50 cursor-grab active:cursor-grabbing ${
        !isVisible ? 'opacity-50 bg-muted/30' : ''
      }`}
    >
      <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onToggleVisibility();
        }}
        className="flex items-center gap-2 flex-1 text-right cursor-pointer"
      >
        {isVisible ? (
          <Eye className="w-4 h-4 text-primary flex-shrink-0" />
        ) : (
          <EyeOff className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
        <span className={isVisible ? '' : 'text-muted-foreground'}>
          {column.headerLabel}
        </span>
        {column.headerSubLabel && (
          <span className={`text-xs ${isVisible ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
            {column.headerSubLabel}
          </span>
        )}
      </button>
    </div>
  );
}

export function ColumnManager({
  open,
  onOpenChange,
  currentLayout,
  availableColumns,
  settings,
  onSave,
  onReset,
}: ColumnManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [localLayout, setLocalLayout] = useState<ColumnLayout>(currentLayout);

  useEffect(() => {
    if (open) {
      setLocalLayout(currentLayout);
    }
  }, [open, currentLayout]);

  // Ensure all available columns are in the order array when modal opens
  useEffect(() => {
    if (open) {
      const availableIds = new Set(availableColumns.map((col) => col.id));
      const currentOrder = localLayout.order.filter((id) => availableIds.has(id));
      const missingIds = availableColumns
        .map((col) => col.id)
        .filter((id) => !currentOrder.includes(id));
      
      if (missingIds.length > 0) {
        // Add missing columns to the end, maintaining registry order
        const registryOrder = DEFAULT_COLUMN_ORDER.filter((id) => missingIds.includes(id));
        const otherMissing = missingIds.filter((id) => !registryOrder.includes(id));
        const newOrder = [...currentOrder, ...registryOrder, ...otherMissing];
        
        setLocalLayout((prev) => ({
          ...prev,
          order: newOrder,
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, availableColumns]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get ordered columns based on current layout order
  // All columns should be in the list, ordered by localLayout.order
  const columnMap = new Map(availableColumns.map((col) => [col.id, col]));
  const orderedColumns = localLayout.order
    .map((id) => columnMap.get(id))
    .filter((col): col is ColumnDefinition => col !== undefined);

  // Filter columns by search term (for display only, order remains unchanged)
  const filteredOrderedColumns = orderedColumns.filter((col) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      col.headerLabel.toLowerCase().includes(searchLower) ||
      (col.headerSubLabel && col.headerSubLabel.toLowerCase().includes(searchLower))
    );
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localLayout.order.indexOf(active.id as ColumnId);
      const newIndex = localLayout.order.indexOf(over.id as ColumnId);

      const newOrder = arrayMove(localLayout.order, oldIndex, newIndex);
      setLocalLayout((prev) => ({
        ...prev,
        order: newOrder,
      }));
    }
  };

  const handleToggleVisibility = (columnId: ColumnId) => {
    setLocalLayout((prev) => ({
      ...prev,
      visible: {
        ...prev.visible,
        [columnId]: !prev.visible[columnId],
      },
      // Do NOT modify order when toggling visibility
    }));
  };

  const handleSave = () => {
    onSave(localLayout);
    onOpenChange(false);
  };

  const handleReset = () => {
    const defaultLayout = getDefaultLayout(settings);
    setLocalLayout(defaultLayout);
    onReset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ניהול עמודות</DialogTitle>
          <DialogDescription>
            בחר אילו עמודות להציג וסדר אותן לפי העדפתך
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="חיפוש עמודה..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>

          {/* Column List */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={orderedColumns.map((col) => col.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredOrderedColumns.map((col) => {
                  const isVisible = localLayout.visible[col.id] !== false;
                  return (
                    <SortableColumnItem
                      key={col.id}
                      column={col}
                      isVisible={isVisible}
                      onToggleVisibility={() => handleToggleVisibility(col.id)}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>

          {/* Actions */}
          <div className="flex justify-between gap-2 pt-4 border-t">
            <Button variant="outline" onClick={handleReset}>
              איפוס לברירת מחדל
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                ביטול
              </Button>
              <Button onClick={handleSave}>שמור</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
