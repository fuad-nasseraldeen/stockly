import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from '../hooks/useTenant';
import { importApi, tenantApi } from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Upload, FileSpreadsheet, Trash2, AlertTriangle, Loader2 } from 'lucide-react';

type ImportMode = 'merge' | 'overwrite';

export default function ImportExport() {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [previewPage, setPreviewPage] = useState(1);
  const previewPageSize = 10;

  // Simulated progress while הייבוא רץ – כדי לתת תחושת התקדמות בקבצים גדולים
  useEffect(() => {
    if (!isImporting || !preview?.totalRows) {
      return;
    }

    setImportProgress(1);

    const interval = window.setInterval(() => {
      setImportProgress((prev) => {
        if (!isImporting) return prev;
        if (prev >= 99) return prev;
        return prev + 1.5;
      });
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [isImporting, preview?.totalRows]);
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
      setPreviewPage(1);
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
    setIsImporting(true);
    setImportProgress(1);
    try {
      const result = await importApi.apply(file, mode, mode === 'overwrite' ? deleteConfirm : undefined);
      alert(`ייבוא הושלם בהצלחה!\nספקים: ${result.stats?.suppliersCreated || 0}\nקטגוריות: ${result.stats?.categoriesCreated || 0}\nמוצרים: ${result.stats?.productsCreated || 0}\nמחירים: ${result.stats?.pricesInserted || 0}`);

      // לרענן נתונים רלוונטיים אחרי ייבוא
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
      ]);

      setFile(null);
      setPreview(null);
      setDeleteConfirm('');
      setConfirmOpen(false);
    } catch (error: any) {
      alert(error.message || 'שגיאה בייבוא');
    } finally {
      setLoading(false);
      setIsImporting(false);
      setImportProgress(0);
    }
  };

  const handleReset = async () => {
    if (resetDeleteConfirm !== 'DELETE') {
      alert('יש להקליד DELETE לאישור');
      return;
    }

    setLoading(true);
    try {
      await tenantApi.reset('DELETE');
      alert('נתוני החנות אופסו בהצלחה');

      // לרענן נתונים אחרי איפוס
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
      ]);

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
    const csv = BOM + 'product_name,sku,package_quantity,supplier,price,discount_percent,category\n"דוגמה מוצר","12345",6,"דוגמה ספק",10.50,5,"כללי"';
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
  <div className="space-y-6 relative">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ייבוא נתונים</h1>
          <p className="text-muted-foreground">ייבא מוצרים ומחירים מקובץ Excel/CSV</p>
        </div>
      </div>

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
                        <TableHead>מק&quot;ט</TableHead>
                        <TableHead>כמות באריזה</TableHead>
                        <TableHead>ספק</TableHead>
                        <TableHead>מחיר</TableHead>
                        <TableHead>הנחה</TableHead>
                        <TableHead>קטגוריה</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.preview
                        .slice(
                          (previewPage - 1) * previewPageSize,
                          (previewPage - 1) * previewPageSize + previewPageSize
                        )
                        .map((row: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell>{row.product_name}</TableCell>
                            <TableCell>{row.sku || '-'}</TableCell>
                            <TableCell>{row.package_quantity || '1'}</TableCell>
                            <TableCell>{row.supplier}</TableCell>
                            <TableCell>{row.price}</TableCell>
                            <TableCell>{row.discount_percent ? `${row.discount_percent}%` : '-'}</TableCell>
                            <TableCell>{row.category}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                  {preview.totalRows > previewPageSize && (
                    <div className="p-3 flex items-center justify-between text-xs text-muted-foreground gap-4">
                      <span>
                        מציג{' '}
                        {Math.min(preview.totalRows, previewPage * previewPageSize)} מתוך{' '}
                        {preview.totalRows} שורות
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                          disabled={previewPage === 1}
                        >
                          קודם
                        </Button>
                        <span>
                          עמוד {previewPage} מתוך{' '}
                          {Math.max(1, Math.ceil(preview.totalRows / previewPageSize))}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setPreviewPage((p) =>
                              Math.min(
                                Math.max(1, Math.ceil(preview.totalRows / previewPageSize)),
                                p + 1
                              )
                            )
                          }
                          disabled={
                            previewPage >= Math.max(1, Math.ceil(preview.totalRows / previewPageSize))
                          }
                        >
                          הבא
                        </Button>
                      </div>
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
            <CardDescription>מחק את כל נתוני החנות (לא ניתן לשחזר)</CardDescription>
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
              זה ימחק את כל נתוני החנות וייבא מחדש מהקובץ. פעולה זו לא ניתנת לביטול!
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
              זה ימחק את כל נתוני החנות. פעולה זו לא ניתנת לביטול!
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

      {/* Global loading overlay for long operations */}
      {loading && (
        <div className="fixed inset-0 z-40 flex items-end justify-center pointer-events-none">
          <div className="mb-6 px-4 py-3 rounded-full bg-background border-2 border-border shadow-lg flex items-center gap-2 text-sm pointer-events-auto">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            {isImporting && preview?.totalRows ? (
              <span>
                מייבא נתונים...{' '}
                {Math.min(
                  preview.totalRows,
                  Math.max(1, Math.round((importProgress / 100) * preview.totalRows))
                )}{' '}
                מתוך {preview.totalRows} שורות ({Math.min(100, Math.max(1, Math.round(importProgress)))}%)
              </span>
            ) : (
              <span>מייבא נתונים... זה יכול לקחת כמה רגעים לקובץ גדול</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
