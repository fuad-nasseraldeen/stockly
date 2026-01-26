import { useState } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { importApi, exportApi } from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Upload, Download, FileSpreadsheet, Trash2, AlertTriangle } from 'lucide-react';

type ImportMode = 'merge' | 'overwrite';

export default function ImportExport() {
  const { currentTenant } = useTenant();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetDeleteConfirm, setResetDeleteConfirm] = useState('');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setLoading(true);
    try {
      const result = await importApi.preview(selectedFile);
      setPreview(result);
    } catch (error: any) {
      alert(error.message || 'שגיאה בתצוגה מקדימה');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !currentTenant) return;

    if (mode === 'overwrite') {
      if (deleteConfirm !== 'DELETE') {
        alert('יש להקליד DELETE לאישור');
        return;
      }
    }

    setLoading(true);
    try {
      const result = await importApi.apply(file, mode, mode === 'overwrite' ? deleteConfirm : undefined);
      alert(`ייבוא הושלם בהצלחה!\nספקים: ${result.stats?.suppliersCreated || 0}\nקטגוריות: ${result.stats?.categoriesCreated || 0}\nמוצרים: ${result.stats?.productsCreated || 0}\nמחירים: ${result.stats?.pricesInserted || 0}`);
      setFile(null);
      setPreview(null);
      setDeleteConfirm('');
      setConfirmOpen(false);
    } catch (error: any) {
      alert(error.message || 'שגיאה בייבוא');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (resetDeleteConfirm !== 'DELETE') {
      alert('יש להקליד DELETE לאישור');
      return;
    }

    setLoading(true);
    try {
      const { supabase } = await import('../lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/tenant/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
          ...(currentTenant && { 'x-tenant-id': currentTenant.id }),
        },
        body: JSON.stringify({ confirmation: 'DELETE' }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'שגיאה לא ידועה' }));
        throw new Error(error.error || 'הבקשה נכשלה');
      }

      alert('נתוני הטננט אופסו בהצלחה');
      setResetDeleteConfirm('');
      setResetConfirmOpen(false);
    } catch (error: any) {
      alert(error.message || 'שגיאה באיפוס');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const BOM = '\uFEFF';
    const csv = BOM + 'product_name,supplier,price,category\n"דוגמה מוצר","דוגמה ספק",10.50,"כללי"';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import_template.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ייבוא וייצוא</h1>
          <p className="text-muted-foreground">ייבא מוצרים ומחירים מקובץ Excel/CSV או ייצא נתונים</p>
        </div>
      </div>

      {/* Export Section */}
      <Card>
        <CardHeader>
          <CardTitle>ייצוא נתונים</CardTitle>
          <CardDescription>הורד קבצי CSV עם נתוני המחירים</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button onClick={exportApi.downloadCurrent} variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              ייצא מחירים נוכחיים
            </Button>
            <Button onClick={exportApi.downloadHistory} variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              ייצא היסטוריה מלאה
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Import Section */}
      <Card>
        <CardHeader>
          <CardTitle>ייבוא נתונים</CardTitle>
          <CardDescription>ייבא מוצרים ומחירים מקובץ Excel או CSV</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <Button onClick={downloadTemplate} variant="outline" className="gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              הורד תבנית
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">בחר קובץ (Excel או CSV)</Label>
            <Input
              id="file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              disabled={loading}
            />
          </div>

          {preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{preview.counts?.suppliers?.new || 0}</div>
                  <div className="text-sm text-muted-foreground">ספקים חדשים</div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{preview.counts?.categories?.new || 0}</div>
                  <div className="text-sm text-muted-foreground">קטגוריות חדשות</div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{preview.counts?.products?.new || 0}</div>
                  <div className="text-sm text-muted-foreground">מוצרים חדשים</div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{preview.totalRows || 0}</div>
                  <div className="text-sm text-muted-foreground">שורות מחירים</div>
                </div>
              </div>

              {preview.preview && preview.preview.length > 0 && (
                <div className="border-2 border-border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>מוצר</TableHead>
                        <TableHead>ספק</TableHead>
                        <TableHead>מחיר</TableHead>
                        <TableHead>קטגוריה</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.preview.slice(0, 10).map((row: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell>{row.product_name}</TableCell>
                          <TableCell>{row.supplier}</TableCell>
                          <TableCell>{row.price}</TableCell>
                          <TableCell>{row.category}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {preview.totalRows > 10 && (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      מציג 10 מתוך {preview.totalRows} שורות
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="mode">מצב ייבוא</Label>
                <select
                  id="mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as ImportMode)}
                  className="flex h-10 w-full rounded-lg border-2 border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="merge">מיזוג (הוסף/עדכן)</option>
                  <option value="overwrite">החלף (מחק הכל וייבא מחדש)</option>
                </select>
                {mode === 'overwrite' && currentTenant?.role !== 'owner' && (
                  <div className="flex items-center gap-2 p-3 bg-destructive/10 border-2 border-destructive/20 rounded-lg text-sm text-destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <span>מצב החלפה זמין לבעלים בלבד</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    if (mode === 'overwrite' && currentTenant?.role === 'owner') {
                      setConfirmOpen(true);
                    } else if (mode === 'overwrite') {
                      alert('מצב החלפה זמין לבעלים בלבד');
                    } else {
                      handleImport();
                    }
                  }}
                  disabled={loading || (mode === 'overwrite' && currentTenant?.role !== 'owner')}
                  className="gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {loading ? 'מייבא...' : 'ייבא'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reset Section (Owner Only) */}
      {currentTenant?.role === 'owner' && (
        <Card className="border-destructive/20">
          <CardHeader>
            <CardTitle className="text-destructive">איפוס נתונים</CardTitle>
            <CardDescription>מחק את כל נתוני הטננט (לא ניתן לשחזר)</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => setResetConfirmOpen(true)}
              variant="destructive"
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              איפוס נתונים
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Overwrite Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>אישור החלפה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-destructive font-medium">
              זה ימחק את כל נתוני הטננט וייבא מחדש מהקובץ. פעולה זו לא ניתנת לביטול!
            </p>
            <div className="space-y-2">
              <Label htmlFor="delete-confirm">הקלד DELETE לאישור:</Label>
              <Input
                id="delete-confirm"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              ביטול
            </Button>
            <Button
              variant="destructive"
              onClick={handleImport}
              disabled={deleteConfirm !== 'DELETE' || loading}
            >
              אישור והחלף
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>אישור איפוס</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-destructive font-medium">
              זה ימחק את כל נתוני הטננט. פעולה זו לא ניתנת לביטול!
            </p>
            <div className="space-y-2">
              <Label htmlFor="reset-delete-confirm">הקלד DELETE לאישור:</Label>
              <Input
                id="reset-delete-confirm"
                value={resetDeleteConfirm}
                onChange={(e) => setResetDeleteConfirm(e.target.value)}
                placeholder="DELETE"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetConfirmOpen(false)}>
              ביטול
            </Button>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={resetDeleteConfirm !== 'DELETE' || loading}
            >
              אישור ואיפוס
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
