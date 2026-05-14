import { useState } from 'react';
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '../hooks/useCategories';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, Search, Edit, Trash2, Tag } from 'lucide-react';

type CategoryFormState = {
  id?: string;
  name: string;
  default_margin_percent: string;
};

export default function Categories() {
  const fieldClassName =
    'border border-border/60 hover:border-border/70 focus-visible:border-primary/40 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none';
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [form, setForm] = useState<CategoryFormState>({ name: '', default_margin_percent: '' });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<{ id: string; name: string } | null>(null);

  const { data: categories = [], isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const visibleCategories = categories.filter((c) => {
    const name = String(c?.name ?? '').trim();
    return !!name && name.toLowerCase() !== 'null';
  });

  const filteredCategories =
    visibleCategories.filter((c) =>
      String(c.name).toLowerCase().includes(search.toLowerCase())
    );
  const totalCategories = visibleCategories.length;

  const resetForm = () => {
    setForm({ id: undefined, name: '', default_margin_percent: '' });
    setErrorMessage(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (c: any) => {
    setForm({
      id: c.id,
      name: c.name ?? '',
      default_margin_percent: c.default_margin_percent != null ? String(c.default_margin_percent) : '',
    });
    setErrorMessage(null);
    setDialogOpen(true);
  };

  const handleSave = async (): Promise<void> => {
    if (!form.name.trim()) {
      setErrorMessage('חובה להזין שם קטגוריה');
      return;
    }

    const marginValue = form.default_margin_percent.trim()
      ? Number(form.default_margin_percent)
      : undefined;

    if (marginValue != null && (marginValue < 0 || marginValue > 500)) {
      setErrorMessage('אחוז רווח חייב להיות בין 0 ל‑500');
      return;
    }

    try {
      setErrorMessage(null);
      const payload = {
        name: form.name.trim(),
        default_margin_percent: marginValue,
      };

      if (form.id) {
        await updateCategory.mutateAsync({
          id: form.id,
          data: payload,
        });
      } else {
        await createCategory.mutateAsync(payload);
      }
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving category:', error);
      const message = error && typeof error === 'object' && 'message' in error ? String((error as any).message) : null;
      setErrorMessage(message || 'שגיאה בשמירת קטגוריה');
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!categoryToDelete) return;
    try {
      await deleteCategory.mutateAsync(categoryToDelete.id);
      setDeleteDialogOpen(false);
      setCategoryToDelete(null);
    } catch (error) {
      console.error('Error deleting category:', error);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-hero">
        <div>
          <h1 className="page-title">קטגוריות</h1>
          <p className="page-subtitle">
            נהל קטגוריות ומסלולי רווח ברירת מחדל • סה״כ {totalCategories} קטגוריות
          </p>
        </div>
        <Button onClick={openCreate} size="lg" className="shadow-md hover:shadow-lg">
          <Plus className="w-4 h-4 ml-2" />
          קטגוריה חדשה
        </Button>
      </div>

      <div className="flex items-center justify-start">
        <div className="relative w-full max-w-xl">
          <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="חיפוש קטגוריות..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10 bg-background/80 text-right border border-border/60 hover:border-border/70 focus-visible:border-primary/40 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
            dir="rtl"
          />
        </div>
      </div>

      {isLoading ? (
        <Card className="data-card">
          <CardContent className="py-12 text-center">
            <div className="inline-block h-8 w-8 border-3 border-primary border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-medium text-muted-foreground">טוען קטגוריות...</p>
          </CardContent>
        </Card>
      ) : filteredCategories.length === 0 ? (
        <Card className="data-card border-dashed">
          <CardContent className="py-16 text-center">
            <div className="text-5xl mb-4">🏷️</div>
            <p className="text-lg font-bold text-foreground mb-2">לא נמצאו קטגוריות</p>
            <p className="text-sm text-muted-foreground mb-6">התחל על ידי הוספת קטגוריה ראשונה</p>
            <Button onClick={openCreate} size="lg" className="shadow-md">
              <Plus className="w-4 h-4 ml-2" />
              הוסף קטגוריה ראשונה
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" dir="rtl">
          {filteredCategories.map((c: any) => (
            <Card key={c.id} className="surface-elevated border border-border/80">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[1.85rem] font-bold text-foreground leading-tight text-right">{c.name}</h3>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-foreground"
                      onClick={() => openEdit(c)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-destructive hover:text-destructive"
                      onClick={() => {
                        setCategoryToDelete({ id: c.id, name: c.name });
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5 text-muted-foreground text-sm">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    <span>רווח ברירת מחדל</span>
                  </div>
                  <div className="text-foreground font-semibold text-base">
                    {c.default_margin_percent != null
                      ? `${Number(c.default_margin_percent).toFixed(1)}%`
                      : '-'}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Category Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{form.id ? 'עריכת קטגוריה' : 'קטגוריה חדשה'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="categoryName">שם קטגוריה *</Label>
              <Input
                id="categoryName"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="למשל: מזון, שתייה, חומרי ניקוי"
                className={fieldClassName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoryMargin">אחוז רווח</Label>
              <Input
                id="categoryMargin"
                type="number"
                min="0"
                max="500"
                step="0.1"
                value={form.default_margin_percent}
                onChange={(e) => setForm((f) => ({ ...f, default_margin_percent: e.target.value }))}
                placeholder="השאר ריק אם אין ברירת מחדל מיוחדת"
                className={fieldClassName}
              />
            </div>
            {errorMessage && (
              <p className="text-xs text-red-600 mt-1">{errorMessage}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              ביטול
            </Button>
            <Button onClick={handleSave} disabled={createCategory.isPending || updateCategory.isPending}>
              {createCategory.isPending || updateCategory.isPending ? 'שומר...' : 'שמור'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Category Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת קטגוריה</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            האם אתה בטוח שברצונך למחוק את הקטגוריה "{categoryToDelete?.name}"?
            המוצרים השייכים לקטגוריה זו יעברו לקטגוריית &quot;כללי&quot;.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              ביטול
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteCategory.isPending}
            >
              {deleteCategory.isPending ? 'מוחק...' : 'מחק'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

