/**
 * Column Management Dialog
 * 
 * Allows users to show/hide and reorder columns.
 */

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ColumnId, ColumnDefinition, PRICE_COLUMN_REGISTRY, DEFAULT_COLUMN_ORDER, DEFAULT_VISIBLE_COLUMNS } from '../../lib/price-columns';
import { ColumnLayout } from '../../lib/column-resolver';
import { Search, GripVertical, Eye, EyeOff } from 'lucide-react';

type ColumnManagerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentLayout: ColumnLayout;
  availableColumns: ColumnDefinition[];
  onSave: (layout: ColumnLayout) => void;
  onReset: () => void;
};

export function ColumnManager({
  open,
  onOpenChange,
  currentLayout,
  availableColumns,
  onSave,
  onReset,
}: ColumnManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [localLayout, setLocalLayout] = useState<ColumnLayout>(currentLayout);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setLocalLayout(currentLayout);
    }
  }, [open, currentLayout]);

  // Filter columns by search term
  const filteredColumns = availableColumns.filter((col) =>
    col.headerLabel.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get ordered columns based on current layout
  const orderedColumns = localLayout.order
    .map((id) => availableColumns.find((col) => col.id === id))
    .filter((col): col is ColumnDefinition => col !== undefined)
    .concat(availableColumns.filter((col) => !localLayout.order.includes(col.id)));

  const handleToggleVisibility = (columnId: ColumnId) => {
    setLocalLayout((prev) => ({
      ...prev,
      visible: {
        ...prev.visible,
        [columnId]: !prev.visible[columnId],
      },
    }));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...localLayout.order];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setLocalLayout((prev) => ({ ...prev, order: newOrder }));
  };

  const handleMoveDown = (index: number) => {
    if (index >= localLayout.order.length - 1) return;
    const newOrder = [...localLayout.order];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setLocalLayout((prev) => ({ ...prev, order: newOrder }));
  };

  const handleSave = () => {
    onSave(localLayout);
    onOpenChange(false);
  };

  const handleReset = () => {
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
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {orderedColumns
              .filter((col) => !searchTerm || filteredColumns.includes(col))
              .map((col, index) => {
                const isVisible = localLayout.visible[col.id] !== false;
                const isInOrder = localLayout.order.includes(col.id);
                const orderIndex = isInOrder ? localLayout.order.indexOf(col.id) : -1;

                return (
                  <div
                    key={col.id}
                    className="flex items-center gap-2 p-2 border rounded-lg hover:bg-muted/50"
                  >
                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-move" />
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility(col.id)}
                      className="flex items-center gap-2 flex-1 text-right"
                    >
                      {isVisible ? (
                        <Eye className="w-4 h-4 text-primary" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className={isVisible ? '' : 'text-muted-foreground line-through'}>
                        {col.headerLabel}
                      </span>
                      {col.headerSubLabel && (
                        <span className="text-xs text-muted-foreground">
                          {col.headerSubLabel}
                        </span>
                      )}
                    </button>
                    {isInOrder && (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMoveUp(orderIndex)}
                          disabled={orderIndex === 0}
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMoveDown(orderIndex)}
                          disabled={orderIndex >= localLayout.order.length - 1}
                        >
                          ↓
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

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
