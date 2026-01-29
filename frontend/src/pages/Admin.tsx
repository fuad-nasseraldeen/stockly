import { useState, useEffect } from 'react';
import { useAdminTenants, useAuditLogs, useBlockUser, useUnblockUser, useRemoveUser, useResetTenantData, useDeleteTenant } from '../hooks/useAdmin';
import { useSuperAdmin } from '../hooks/useSuperAdmin';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Shield, Users, Store, Ban, CheckCircle, AlertCircle, Clock, Trash2, X, RotateCcw } from 'lucide-react';

export default function Admin() {
  const { data: isSuperAdmin, isLoading: checkingAdmin } = useSuperAdmin();
  const { data: tenants = [], isLoading: tenantsLoading, error: tenantsError } = useAdminTenants();
  const { data: auditLogs = [], isLoading: logsLoading } = useAuditLogs({ limit: 50 });

  // Debug: Log all state
  useEffect(() => {
    console.log('Admin Page State:', {
      checkingAdmin,
      isSuperAdmin,
      tenantsLoading,
      tenantsCount: tenants.length,
      tenantsError,
    });
    console.log('Admin: checkingAdmin type:', typeof checkingAdmin, 'value:', checkingAdmin);
    console.log('Admin: isSuperAdmin type:', typeof isSuperAdmin, 'value:', isSuperAdmin);
    console.log('Admin: Will show loading?', checkingAdmin === true || checkingAdmin === undefined);
    console.log('Admin: Will show error?', checkingAdmin === false && isSuperAdmin !== true);
    console.log('Admin: Will show main?', checkingAdmin === false && isSuperAdmin === true);
  }, [checkingAdmin, isSuperAdmin, tenantsLoading, tenants.length, tenantsError]);
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();
  const removeUser = useRemoveUser();
  const resetTenantData = useResetTenantData();
  const deleteTenant = useDeleteTenant();

  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [unblockDialogOpen, setUnblockDialogOpen] = useState(false);
  const [removeUserDialogOpen, setRemoveUserDialogOpen] = useState(false);
  const [resetDataDialogOpen, setResetDataDialogOpen] = useState(false);
  const [deleteTenantDialogOpen, setDeleteTenantDialogOpen] = useState(false);
  const [selectedMembership, setSelectedMembership] = useState<{
    id: string;
    userName: string;
    tenantName: string;
  } | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleBlock = async () => {
    if (!selectedMembership) return;
    try {
      await blockUser.mutateAsync(selectedMembership.id);
      setBlockDialogOpen(false);
      setSelectedMembership(null);
    } catch (error) {
      console.error('Error blocking user:', error);
    }
  };

  const handleUnblock = async () => {
    if (!selectedMembership) return;
    try {
      await unblockUser.mutateAsync(selectedMembership.id);
      setUnblockDialogOpen(false);
      setSelectedMembership(null);
    } catch (error) {
      console.error('Error unblocking user:', error);
    }
  };

  const handleRemoveUser = async () => {
    if (!selectedMembership) return;
    try {
      await removeUser.mutateAsync(selectedMembership.id);
      setRemoveUserDialogOpen(false);
      setSelectedMembership(null);
    } catch (error) {
      console.error('Error removing user:', error);
    }
  };

  const handleResetTenantData = async () => {
    if (!selectedTenant) return;
    try {
      await resetTenantData.mutateAsync(selectedTenant.id);
      setResetDataDialogOpen(false);
      setSelectedTenant(null);
    } catch (error) {
      console.error('Error resetting tenant data:', error);
    }
  };

  const handleDeleteTenant = async () => {
    if (!selectedTenant) return;
    try {
      await deleteTenant.mutateAsync(selectedTenant.id);
      setDeleteTenantDialogOpen(false);
      setSelectedTenant(null);
    } catch (error) {
      console.error('Error deleting tenant:', error);
    }
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      tenant_created: 'חנות נוצרה',
      user_joined: 'משתמש הצטרף',
      user_blocked: 'משתמש נחסם',
      user_unblocked: 'חסימה בוטלה',
      invite_sent: 'הזמנה נשלחה',
    };
    return labels[action] || action;
  };

  // Show loading while checking admin status
  if (checkingAdmin === true || checkingAdmin === undefined) {
    console.log('Admin: Showing loading state');
    return (
      <div className="w-full max-w-3xl mx-auto">
        <Card className="shadow-md border-2">
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">בודק הרשאות...</p>
            <p className="text-xs text-muted-foreground mt-2">checkingAdmin: {String(checkingAdmin)}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show error if not super admin (only after loading is done)
  if (checkingAdmin === false && isSuperAdmin !== true) {
    console.log('Admin: Not super admin, showing error');
    return (
      <div className="w-full max-w-3xl mx-auto">
        <Card className="shadow-md border-2">
          <CardContent className="py-16 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
            <p className="text-lg font-bold text-foreground mb-2">אין לך הרשאות</p>
            <p className="text-sm text-muted-foreground">דף זה זמין למנהל המערכת בלבד</p>
            <p className="text-xs text-muted-foreground mt-2">
              Debug: isSuperAdmin = {String(isSuperAdmin)}, checkingAdmin = {String(checkingAdmin)}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main content - only show if super admin
  console.log('Admin: Before main content check', { checkingAdmin, isSuperAdmin, typeChecking: typeof checkingAdmin, typeSuper: typeof isSuperAdmin });
  
  // If we reach here, we should be super admin
  if (checkingAdmin === false && isSuperAdmin === true) {
    console.log('Admin: Rendering main content');
    return (
      <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">ניהול משתמשים</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          צפה בכל החנויות, המשתמשים והפעילות • ניהול חסימות
        </p>
      </div>

      {/* Tenants & Users Overview */}
      <Card className="shadow-md border-2">
        <CardHeader>
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Store className="w-5 h-5" />
            חנויות ומשתמשים
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tenantsLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">טוען נתונים...</div>
          ) : tenants.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">לא נמצאו חנויות</div>
          ) : (
            <div className="space-y-6">
              {tenants.map((tenant) => (
                <div key={tenant.id} className="border-2 border-border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold">{tenant.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        נוצר ב-{formatDate(tenant.created_at)} • {tenant.total_users} משתמשים
                        {tenant.blocked_users > 0 && (
                          <span className="text-destructive"> • {tenant.blocked_users} חסומים</span>
                        )}
                      </p>
                      {tenant.statistics && (
                        <div className="mt-2 flex flex-wrap gap-3 text-xs">
                          <span className="text-muted-foreground">
                            📦 {tenant.statistics.products} מוצרים
                          </span>
                          <span className="text-muted-foreground">
                            🏢 {tenant.statistics.suppliers} ספקים
                          </span>
                          <span className="text-muted-foreground">
                            📁 {tenant.statistics.categories} קטגוריות
                          </span>
                          <span className="text-muted-foreground">
                            💰 {tenant.statistics.price_entries} מחירים
                          </span>
                          <span className="text-muted-foreground">
                            💾 ~{tenant.statistics.estimated_size_kb} KB
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedTenant({ id: tenant.id, name: tenant.name });
                          setResetDataDialogOpen(true);
                        }}
                        className="text-orange-600 hover:text-orange-700"
                      >
                        <RotateCcw className="w-4 h-4 ml-1" />
                        מחק נתונים
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setSelectedTenant({ id: tenant.id, name: tenant.name });
                          setDeleteTenantDialogOpen(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4 ml-1" />
                        מחק חנות
                      </Button>
                    </div>
                  </div>

                  {/* Owners */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      בעלים ({tenant.owners.length})
                    </h4>
                    {tenant.owners.length > 0 ? (
                      <div className="space-y-2">
                        {tenant.owners.map((owner) => (
                          <div
                            key={owner.membership_id}
                            className="flex items-center justify-between p-2 bg-muted rounded-lg"
                          >
                            <div>
                              <span className="font-medium">{owner.full_name}</span>
                              <span className="text-xs text-muted-foreground mr-2">
                                • {owner.email}
                              </span>
                              <span className="text-xs text-muted-foreground mr-2">
                                • הצטרף ב-{formatDate(owner.joined_at)}
                              </span>
                            </div>
                            <Badge variant="default">בעלים</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground p-2">אין בעלים רשומים</p>
                    )}
                  </div>

                  {/* Workers */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      עובדים ({tenant.workers.length})
                    </h4>
                    {tenant.workers.length > 0 ? (
                      <div className="space-y-2">
                        {tenant.workers.map((worker) => (
                          <div
                            key={worker.membership_id}
                            className="flex items-center justify-between p-2 bg-muted rounded-lg"
                          >
                            <div>
                              <span className="font-medium">{worker.full_name}</span>
                              <span className="text-xs text-muted-foreground mr-2">
                                • {worker.email}
                              </span>
                              <span className="text-xs text-muted-foreground mr-2">
                                • הצטרף ב-{formatDate(worker.joined_at)}
                              </span>
                              {worker.is_blocked && (
                                <Badge variant="destructive" className="mr-2">
                                  חסום
                                </Badge>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {worker.is_blocked ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedMembership({
                                      id: worker.membership_id,
                                      userName: worker.full_name,
                                      tenantName: tenant.name,
                                    });
                                    setUnblockDialogOpen(true);
                                  }}
                                >
                                  <CheckCircle className="w-4 h-4 ml-1" />
                                  בטל חסימה
                                </Button>
                              ) : (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedMembership({
                                      id: worker.membership_id,
                                      userName: worker.full_name,
                                      tenantName: tenant.name,
                                    });
                                    setBlockDialogOpen(true);
                                  }}
                                >
                                  <Ban className="w-4 h-4 ml-1" />
                                  חסום
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedMembership({
                                    id: worker.membership_id,
                                    userName: worker.full_name,
                                    tenantName: tenant.name,
                                  });
                                  setRemoveUserDialogOpen(true);
                                }}
                                className="text-destructive hover:text-destructive"
                              >
                                <X className="w-4 h-4 ml-1" />
                                הסר
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground p-2">אין עובדים רשומים</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Logs */}
      <Card className="shadow-md border-2">
        <CardHeader>
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Clock className="w-5 h-5" />
            יומן פעילות
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">טוען לוגים...</div>
          ) : auditLogs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">אין פעילות להצגה</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>תאריך</TableHead>
                    <TableHead>פעולה</TableHead>
                    <TableHead>משתמש</TableHead>
                    <TableHead>פרטים</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">{formatDate(log.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getActionLabel(log.action)}</Badge>
                      </TableCell>
                      <TableCell>{log.profiles?.full_name || 'לא ידוע'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.details && typeof log.details === 'object'
                          ? JSON.stringify(log.details, null, 0).slice(0, 100)
                          : String(log.details || '-')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Block User Dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>חסימת משתמש</DialogTitle>
          </DialogHeader>
          <p>
            האם אתה בטוח שברצונך לחסום את המשתמש <strong>{selectedMembership?.userName}</strong> בחנות{' '}
            <strong>{selectedMembership?.tenantName}</strong>?
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            משתמש חסום לא יוכל לגשת לחנות זו עד שתבטל את החסימה.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>
              ביטול
            </Button>
            <Button variant="destructive" onClick={handleBlock} disabled={blockUser.isPending}>
              {blockUser.isPending ? 'חוסם...' : 'חסום'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unblock User Dialog */}
      <Dialog open={unblockDialogOpen} onOpenChange={setUnblockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ביטול חסימת משתמש</DialogTitle>
          </DialogHeader>
          <p>
            האם אתה בטוח שברצונך לבטל את החסימה של <strong>{selectedMembership?.userName}</strong> בחנות{' '}
            <strong>{selectedMembership?.tenantName}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnblockDialogOpen(false)}>
              ביטול
            </Button>
            <Button onClick={handleUnblock} disabled={unblockUser.isPending}>
              {unblockUser.isPending ? 'מבטל...' : 'בטל חסימה'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove User Dialog */}
      <Dialog open={removeUserDialogOpen} onOpenChange={setRemoveUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הסרת משתמש</DialogTitle>
          </DialogHeader>
          <p>
            האם אתה בטוח שברצונך להסיר את המשתמש <strong>{selectedMembership?.userName}</strong> מהחנות{' '}
            <strong>{selectedMembership?.tenantName}</strong>?
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            המשתמש יאבד את הגישה לחנות זו, אך החשבון שלו יישאר במערכת.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveUserDialogOpen(false)}>
              ביטול
            </Button>
            <Button variant="destructive" onClick={handleRemoveUser} disabled={removeUser.isPending}>
              {removeUser.isPending ? 'מסיר...' : 'הסר'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Tenant Data Dialog */}
      <Dialog open={resetDataDialogOpen} onOpenChange={setResetDataDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת נתוני חנות</DialogTitle>
          </DialogHeader>
          <p>
            האם אתה בטוח שברצונך למחוק את כל הנתונים של החנות <strong>{selectedTenant?.name}</strong>?
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            פעולה זו תמחק את כל המוצרים, הספקים, הקטגוריות והמחירים. החנות והמשתמשים יישארו.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDataDialogOpen(false)}>
              ביטול
            </Button>
            <Button variant="destructive" onClick={handleResetTenantData} disabled={resetTenantData.isPending}>
              {resetTenantData.isPending ? 'מוחק...' : 'מחק נתונים'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Tenant Dialog */}
      <Dialog open={deleteTenantDialogOpen} onOpenChange={setDeleteTenantDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת חנות</DialogTitle>
          </DialogHeader>
          <p>
            האם אתה בטוח שברצונך למחוק את החנות <strong>{selectedTenant?.name}</strong> לחלוטין?
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            פעולה זו תמחק את החנות, כל הנתונים, כל המשתמשים והחברויות. פעולה זו לא ניתנת לביטול!
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTenantDialogOpen(false)}>
              ביטול
            </Button>
            <Button variant="destructive" onClick={handleDeleteTenant} disabled={deleteTenant.isPending}>
              {deleteTenant.isPending ? 'מוחק...' : 'מחק חנות'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    );
  }

  // Ultimate fallback - should never reach here
  console.error('Admin: Unexpected state', { checkingAdmin, isSuperAdmin });
  return (
    <div className="w-full max-w-3xl mx-auto">
      <Card className="shadow-md border-2">
        <CardContent className="py-16 text-center">
          <p className="text-sm text-muted-foreground">שגיאה בטעינת הדף</p>
          <p className="text-xs text-muted-foreground mt-2">
            checkingAdmin: {String(checkingAdmin)}, isSuperAdmin: {String(isSuperAdmin)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
