import { useState } from 'react';
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '../hooks/useCategories';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, Search, Edit, Trash2 } from 'lucide-react';

type CategoryFormState = {
  id?: string;
  name: string;
  default_margin_percent: string;
};

export default function Categories() {
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

  const filteredCategories =
    categories.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase())
    );
  const totalCategories = categories.length;

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">קטגוריות</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            נהל קטגוריות ומסלולי רווח ברירת מחדל • סה״כ {totalCategories} קטגוריות
          </p>
        </div>
        <Button onClick={openCreate} size="lg" className="shadow-md hover:shadow-lg">
          <Plus className="w-4 h-4 ml-2" />
          קטגוריה חדשה
        </Button>
      </div>

      <Card className="shadow-md border-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-bold">חיפוש קטגוריות</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">חיפוש לפי שם</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="הקלד שם קטגוריה..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-10"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card className="shadow-md border-2">
          <CardContent className="py-12 text-center">
            <div className="inline-block h-8 w-8 border-3 border-primary border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-medium text-muted-foreground">טוען קטגוריות...</p>
          </CardContent>
        </Card>
      ) : filteredCategories.length === 0 ? (
        <Card className="shadow-md border-2 border-dashed">
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
        <Card className="shadow-md border-2">
          <CardHeader>
            <CardTitle className="text-lg font-bold">רשימת קטגוריות</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border-2 border-border shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-linear-to-r from-muted to-muted/50 border-b-2">
                    <TableHead className="font-semibold">שם קטגוריה</TableHead>
                    <TableHead className="font-semibold">אחוז רווח ברירת מחדל</TableHead>
                    <TableHead className="font-semibold">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCategories.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        {c.default_margin_percent != null
                          ? `${Number(c.default_margin_percent).toFixed(1)}%`
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(c)}
                            className="shadow-sm border-2"
                          >
                            <Edit className="w-4 h-4 ml-1" />
                            ערוך
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setCategoryToDelete({ id: c.id, name: c.name });
                              setDeleteDialogOpen(true);
                            }}
                            className="shadow-sm border-2 border-destructive/20"
                          >
                            <Trash2 className="w-4 h-4 ml-1" />
                            מחק
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Category Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
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

