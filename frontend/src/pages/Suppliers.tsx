import { useState } from 'react';
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier } from '../hooks/useSuppliers';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, Search, Edit, Trash2, User, Phone, Mail, MapPin } from 'lucide-react';

type SupplierFormState = {
  id?: string;
  name: string;
  phone: string;
  contactName: string;
  email: string;
  address: string;
  is_active: boolean;
  notes: string;
};

function parseSupplierNotes(raw: string | null | undefined): { email: string; address: string; notes: string } {
  const text = (raw || '').trim();
  if (!text) return { email: '', address: '', notes: '' };
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let email = '';
  let address = '';
  const free: string[] = [];
  for (const line of lines) {
    if (line.startsWith('email:')) {
      email = line.slice(6).trim();
      continue;
    }
    if (line.startsWith('address:')) {
      address = line.slice(8).trim();
      continue;
    }
    free.push(line);
  }
  return { email, address, notes: free.join('\n') };
}

function buildSupplierNotes(data: { email?: string; address?: string; notes?: string }): string {
  const out: string[] = [];
  if (data.email?.trim()) out.push(`email:${data.email.trim()}`);
  if (data.address?.trim()) out.push(`address:${data.address.trim()}`);
  if (data.notes?.trim()) out.push(data.notes.trim());
  return out.join('\n');
}

export default function Suppliers() {
  const fieldClassName =
    'border border-border/60 hover:border-border/70 focus-visible:border-primary/40 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none';
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [form, setForm] = useState<SupplierFormState>({ name: '', phone: '', contactName: '', email: '', address: '', is_active: true, notes: '' });
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
    setForm({ id: undefined, name: '', phone: '', contactName: '', email: '', address: '', is_active: true, notes: '' });
    setErrorMessage(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (s: any) => {
    const parsed = parseSupplierNotes(s.notes);
    setForm({
      id: s.id,
      name: s.name ?? '',
      phone: s.phone ?? '',
      contactName: parsed.notes,
      email: parsed.email,
      address: parsed.address,
      is_active: s.is_active !== false,
      notes: '',
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
            notes: buildSupplierNotes({
              email: form.email,
              address: form.address,
              notes: [form.contactName?.trim() || '', form.notes?.trim() || ''].filter(Boolean).join('\n'),
            }) || undefined,
            is_active: form.is_active,
          },
        });
      } else {
        await createSupplier.mutateAsync({
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          notes: buildSupplierNotes({
            email: form.email,
            address: form.address,
            notes: [form.contactName?.trim() || '', form.notes?.trim() || ''].filter(Boolean).join('\n'),
          }) || undefined,
          is_active: form.is_active,
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
    <div className="page-shell">
      <div className="page-hero">
        <div>
          <h1 className="page-title">ספקים</h1>
          <p className="page-subtitle">
            {totalSuppliers} ספקים במערכת
          </p>
        </div>
        <Button onClick={openCreate} size="lg" className="shadow-md hover:shadow-lg">
          <Plus className="w-4 h-4 ml-2" />
          ספק חדש
        </Button>
      </div>

      <div className="flex items-center justify-start">
        <div className="relative w-full max-w-xl">
          <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="חיפוש ספקים..."
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
            <p className="text-sm font-medium text-muted-foreground">טוען ספקים...</p>
          </CardContent>
        </Card>
      ) : filteredSuppliers.length === 0 ? (
        <Card className="data-card border-dashed">
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" dir="rtl">
              {filteredSuppliers.map((s: any) => {
                const parsed = parseSupplierNotes(s.notes);
                return <Card key={s.id} className="surface-elevated border border-border/80">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-[1.85rem] font-bold text-foreground leading-tight text-right">{s.name}</h3>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-foreground"
                          onClick={() => openEdit(s)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive hover:text-destructive"
                          onClick={() => {
                            setSupplierToDelete({ id: s.id, name: s.name });
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.is_active === false ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'}`}>
                      {s.is_active === false ? 'לא פעיל' : 'פעיל'}
                    </div>

                    <div className="space-y-1.5 text-muted-foreground text-sm">
                      {parsed.notes ? (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span>{parsed.notes}</span>
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span>{s.phone || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        <span>{parsed.email || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        <span>{parsed.address || '-'}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              })}
            </div>
      )}

      {/* Create / Edit Supplier Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[560px]">
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
                className={fieldClassName}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="supplierNotes">איש קשר</Label>
                <Input
                  id="supplierNotes"
                  value={form.contactName}
                  onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                  placeholder="יוסי כהן"
                  className={fieldClassName}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplierPhone">טלפון</Label>
                <Input
                  id="supplierPhone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="03-5551234"
                  className={fieldClassName}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierEmail">אימייל</Label>
              <Input
                id="supplierEmail"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="name@company.co.il"
                className={fieldClassName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierAddress">כתובת</Label>
              <Input
                id="supplierAddress"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="רחוב, עיר"
                className={fieldClassName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierStatus">סטטוס</Label>
              <select
                id="supplierStatus"
                value={form.is_active ? 'active' : 'inactive'}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === 'active' }))}
                className="w-full h-10 rounded-md border border-border/60 bg-background px-3 text-sm hover:border-border/70 focus-visible:outline-none focus-visible:border-primary/40 focus-visible:ring-0 shadow-none"
              >
                <option value="active">פעיל</option>
                <option value="inactive">לא פעיל</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierRemarks">הערות</Label>
              <textarea
                id="supplierRemarks"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="min-h-20 w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm hover:border-border/70 focus-visible:outline-none focus-visible:border-primary/40 focus-visible:ring-0 shadow-none"
                placeholder=""
              />
            </div>
            {errorMessage && (
              <p className="text-xs text-red-600 mt-1">{errorMessage}</p>
            )}
          </div>
          {form.id ? (
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                ביטול
              </Button>
              <Button onClick={handleSave} disabled={createSupplier.isPending || updateSupplier.isPending}>
                {createSupplier.isPending || updateSupplier.isPending ? 'שומר...' : 'שמור'}
              </Button>
            </DialogFooter>
          ) : (
            <DialogFooter>
              <Button
                onClick={handleSave}
                disabled={createSupplier.isPending || updateSupplier.isPending}
                className="w-full h-11 text-base"
              >
                {createSupplier.isPending || updateSupplier.isPending ? 'שומר...' : 'שמור'}
              </Button>
            </DialogFooter>
          )}
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
