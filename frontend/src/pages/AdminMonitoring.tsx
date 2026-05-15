import { Link } from 'react-router-dom';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { useAdminMonitoringHistory, useAdminMonitoringLatest } from '../hooks/useAdmin';

function statusLabel(status: string): string {
  if (status === 'OK') return 'תקין';
  if (status === 'WARNING') return 'אזהרה';
  if (status === 'FAILED') return 'כשל';
  return status;
}

function statusVariant(status: string): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (status === 'FAILED') return 'destructive';
  if (status === 'WARNING') return 'secondary';
  if (status === 'OK') return 'default';
  return 'outline';
}

function formatDate(date: string | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleString('he-IL');
}

function formatMs(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${value.toFixed(1)} ms`;
}

export default function AdminMonitoring() {
  const { data: latestData, isLoading: latestLoading, error: latestError } = useAdminMonitoringLatest();
  const { data: historyData, isLoading: historyLoading, error: historyError } = useAdminMonitoringHistory(30);

  const latest = latestData?.report ?? null;
  const checks = latestData?.checks ?? [];
  const history = historyData?.reports ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Monitoring Dashboard</h1>
        <Button asChild variant="outline">
          <Link to="/admin">חזרה לניהול</Link>
        </Button>
      </div>

      {latestError ? (
        <Card>
          <CardContent className="pt-6 text-destructive">
            {latestError instanceof Error ? latestError.message : 'שגיאה בטעינת הדוח האחרון'}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Latest Report</CardTitle>
        </CardHeader>
        <CardContent>
          {latestLoading ? (
            <div className="text-sm text-muted-foreground">טוען...</div>
          ) : !latest ? (
            <div className="text-sm text-muted-foreground">עדיין לא התקבלו דוחות Monitoring.</div>
          ) : (
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <div><span className="font-medium">סטטוס:</span> <Badge variant={statusVariant(latest.overall_status)}>{statusLabel(latest.overall_status)}</Badge></div>
              <div><span className="font-medium">זמן ריצה אחרון:</span> {formatDate(latest.run_at)}</div>
              <div><span className="font-medium">מקור:</span> {latest.source || '-'}</div>
              <div><span className="font-medium">סה"כ בדיקות:</span> {latest.total_checks}</div>
              <div><span className="font-medium">עברו:</span> {latest.passed_checks}</div>
              <div><span className="font-medium">נכשלו:</span> {latest.failed_checks}</div>
              <div><span className="font-medium">זמן תגובה ממוצע:</span> {formatMs(latest.avg_response_time_ms)}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Check Items</CardTitle>
        </CardHeader>
        <CardContent>
          {!latest || checks.length === 0 ? (
            <div className="text-sm text-muted-foreground">אין פריטי בדיקה להצגה.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Response</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.check_name}</TableCell>
                    <TableCell><Badge variant={statusVariant(item.check_status)}>{statusLabel(item.check_status)}</Badge></TableCell>
                    <TableCell>{formatMs(item.response_time_ms)}</TableCell>
                    <TableCell className="max-w-[500px] truncate" title={item.error_message || ''}>{item.error_message || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Report History</CardTitle>
        </CardHeader>
        <CardContent>
          {historyError ? (
            <div className="text-sm text-destructive">
              {historyError instanceof Error ? historyError.message : 'שגיאה בטעינת היסטוריה'}
            </div>
          ) : historyLoading ? (
            <div className="text-sm text-muted-foreground">טוען...</div>
          ) : history.length === 0 ? (
            <div className="text-sm text-muted-foreground">אין היסטוריית דוחות.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Passed</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Avg Response</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell>{formatDate(report.run_at)}</TableCell>
                    <TableCell><Badge variant={statusVariant(report.overall_status)}>{statusLabel(report.overall_status)}</Badge></TableCell>
                    <TableCell>{report.total_checks}</TableCell>
                    <TableCell>{report.passed_checks}</TableCell>
                    <TableCell>{report.failed_checks}</TableCell>
                    <TableCell>{formatMs(report.avg_response_time_ms)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
