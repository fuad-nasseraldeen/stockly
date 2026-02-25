import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { supportChatApi, type SupportMessage, type SupportThread } from '../lib/api';

export default function AdminSupportInbox() {
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>('');
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) || null,
    [threads, selectedThreadId]
  );

  const loadThreads = async () => {
    const data = await supportChatApi.adminThreads();
    setThreads(data);
    if (!selectedThreadId && data.length > 0) setSelectedThreadId(data[0].id);
  };

  const loadMessages = async (threadId: string) => {
    const data = await supportChatApi.adminMessages(threadId);
    setMessages(data);
  };

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        await loadThreads();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'שגיאה בטעינת Inbox תמיכה');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedThreadId) return;
    void loadMessages(selectedThreadId);
  }, [selectedThreadId]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        await loadThreads();
        if (selectedThreadId) await loadMessages(selectedThreadId);
      } catch {
        // Non-blocking polling.
      }
    }, 4000);
    return () => window.clearInterval(interval);
  }, [selectedThreadId]);

  const send = async () => {
    const trimmed = message.trim();
    if (!trimmed || !selectedThreadId) return;
    try {
      setSending(true);
      setError(null);
      await supportChatApi.adminSendMessage(selectedThreadId, trimmed);
      setMessage('');
      await loadMessages(selectedThreadId);
      await loadThreads();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשליחת תגובה');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">טוען Inbox תמיכה...</div>;

  return (
    <div className="grid gap-4 md:grid-cols-[300px,1fr]">
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="text-base">שיחות פתוחות</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
          {threads.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין שיחות כרגע.</p>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedThreadId(t.id)}
                className={`w-full rounded-md border px-3 py-2 text-right text-xs ${
                  selectedThreadId === t.id ? 'bg-accent' : 'hover:bg-muted'
                }`}
              >
                <p className="font-medium">{t.user_id}</p>
                <p className="text-muted-foreground">{new Date(t.last_message_at).toLocaleString('he-IL')}</p>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardHeader>
          <CardTitle className="text-base">Inbox תמיכה</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {!selectedThread ? (
            <p className="text-sm text-muted-foreground">בחר שיחה מהרשימה.</p>
          ) : (
            <>
              <div className="max-h-[55vh] overflow-y-auto rounded-md border bg-muted/20 p-3 space-y-2">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-md px-3 py-2 text-sm ${
                      m.sender_type === 'support'
                        ? 'mr-auto max-w-[85%] bg-primary text-primary-foreground'
                        : 'ml-auto max-w-[85%] border bg-background'
                    }`}
                  >
                    {m.message ? <p className="whitespace-pre-wrap">{m.message}</p> : null}
                    {m.attachment_url ? (
                      <a className="underline text-xs" href={m.attachment_url} target="_blank" rel="noreferrer">
                        קובץ מצורף
                      </a>
                    ) : null}
                    <p className="mt-1 text-[10px] opacity-70">{new Date(m.created_at).toLocaleString('he-IL')}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="כתוב תגובה ללקוח..."
                  maxLength={2000}
                />
                <Button onClick={send} disabled={sending || !message.trim()}>
                  {sending ? 'שולח...' : 'שלח'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
