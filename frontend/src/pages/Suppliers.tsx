import { useState } from 'react';
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier } from '../hooks/useSuppliers';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, Search, Edit, Trash2 } from 'lucide-react';

type SupplierFormState = {
  id?: string;
  name: string;
  phone: string;
  notes: string;
};

export default function Suppliers() {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [form, setForm] = useState<SupplierFormState>({ name: '', phone: '', notes: '' });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<{ id: string; name: string } | null>(null);

  const { data: suppliers = [], isLoading } = useSuppliers();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deleteSupplier = useDeleteSupplier();

  const filteredSuppliers =
    suppliers.filter((s) =>
      s.name.toLowerCase().includes(search.toLowerCase())
    );
  const totalSuppliers = suppliers.length;

  const resetForm = () => {
    setForm({ id: undefined, name: '', phone: '', notes: '' });
    setErrorMessage(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (s: any) => {
    setForm({
      id: s.id,
      name: s.name ?? '',
      phone: s.phone ?? '',
      notes: s.notes ?? '',
    });
    setErrorMessage(null);
    setDialogOpen(true);
  };

  const handleSave = async (): Promise<void> => {
    if (!form.name.trim()) {
      setErrorMessage('חובה להזין שם ספק');
      return;
    }

    try {
      setErrorMessage(null);
      if (form.id) {
        await updateSupplier.mutateAsync({
          id: form.id,
          data: {
            name: form.name.trim(),
            phone: form.phone.trim() || undefined,
            notes: form.notes.trim() || undefined,
          },
        });
      } else {
        await createSupplier.mutateAsync({
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          notes: form.notes.trim() || undefined,
        });
      }
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving supplier:', error);
      const message = error && typeof error === 'object' && 'message' in error ? String((error as any).message) : null;
      setErrorMessage(message || 'שגיאה בשמירת ספק');
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!supplierToDelete) return;
    try {
      await deleteSupplier.mutateAsync(supplierToDelete.id);
      setDeleteDialogOpen(false);
      setSupplierToDelete(null);
    } catch (error) {
      console.error('Error deleting supplier:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">ספקים</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            נהל את כל הספקים שאתה עובד איתם • סה״כ {totalSuppliers} ספקים
          </p>
        </div>
        <Button onClick={openCreate} size="lg" className="shadow-md hover:shadow-lg">
          <Plus className="w-4 h-4 ml-2" />
          ספק חדש
        </Button>
      </div>

      <Card className="shadow-md border-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-bold">חיפוש ספקים</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">חיפוש לפי שם</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="הקלד שם ספק..."
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
            <p className="text-sm font-medium text-muted-foreground">טוען ספקים...</p>
          </CardContent>
        </Card>
      ) : filteredSuppliers.length === 0 ? (
        <Card className="shadow-md border-2 border-dashed">
          <CardContent className="py-16 text-center">
            <div className="text-5xl mb-4">🤝</div>
            <p className="text-lg font-bold text-foreground mb-2">לא נמצאו ספקים</p>
            <p className="text-sm text-muted-foreground mb-6">התחל על ידי הוספת ספק ראשון</p>
            <Button onClick={openCreate} size="lg" className="shadow-md">
              <Plus className="w-4 h-4 ml-2" />
              הוסף ספק ראשון
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-md border-2">
          <CardHeader>
            <CardTitle className="text-lg font-bold">רשימת ספקים</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border-2 border-border shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-linear-to-r from-muted to-muted/50 border-b-2">
                    <TableHead className="font-semibold">שם ספק</TableHead>
                    <TableHead className="font-semibold">טלפון</TableHead>
                    <TableHead className="font-semibold">הערות</TableHead>
                    <TableHead className="font-semibold">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSuppliers.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.phone || '-'}</TableCell>
                      <TableCell>{s.notes || '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(s)}
                            className="shadow-sm border-2"
                          >
                            <Edit className="w-4 h-4 ml-1" />
                            ערוך
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setSupplierToDelete({ id: s.id, name: s.name });
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

      {/* Create / Edit Supplier Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'עריכת ספק' : 'ספק חדש'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="supplierName">שם ספק *</Label>
              <Input
                id="supplierName"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="הזן שם ספק"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierPhone">טלפון</Label>
              <Input
                id="supplierPhone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="הזן טלפון"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierNotes">הערות</Label>
              <Input
                id="supplierNotes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="הערות "
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
            <Button onClick={handleSave} disabled={createSupplier.isPending || updateSupplier.isPending}>
              {createSupplier.isPending || updateSupplier.isPending ? 'שומר...' : 'שמור'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Supplier Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת ספק</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            האם אתה בטוח שברצונך למחוק את הספק "{supplierToDelete?.name}"? אם יש מוצרים שקשורים אליו,
            מומלץ לעדכן אותם לספק אחר לפני המחיקה.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              ביטול
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteSupplier.isPending}
            >
              {deleteSupplier.isPending ? 'מוחק...' : 'מחק'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

