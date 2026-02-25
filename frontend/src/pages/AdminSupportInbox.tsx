import { useEffect, useMemo, useRef, useState } from 'react';
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
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) || null,
    [threads, selectedThreadId]
  );
  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    [messages]
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sortedMessages.length, selectedThreadId]);

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
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-6 sm:-mt-8 bg-white pb-20 dark:bg-background sm:pb-8 border-t">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 md:grid-cols-[300px,1fr]">
        <aside className="border-b md:border-b-0 md:border-l">
          <div className="border-b px-4 py-3">
            <h2 className="text-base font-bold">שיחות פתוחות</h2>
            <p className="text-xs text-muted-foreground">{threads.length} שיחות</p>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2 md:max-h-[calc(100vh-320px)]">
            {threads.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">אין שיחות כרגע.</p>
            ) : (
              threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedThreadId(t.id)}
                  className={`mb-2 w-full rounded-xl border px-3 py-2 text-right text-xs ${
                    selectedThreadId === t.id ? 'border-primary bg-primary/10' : 'hover:bg-muted'
                  }`}
                >
                  <p className="font-semibold">{t.user_full_name || 'ללא שם'}</p>
                  <p className="text-muted-foreground">{t.user_email || t.user_id}</p>
                  <p className="text-muted-foreground">{t.tenant_name || 'ללא חנות'}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(t.last_message_at).toLocaleString('he-IL')}
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="flex flex-col">
          <div className="border-b px-4 py-3">
            <h1 className="text-lg font-bold">Inbox תמיכה</h1>
            {!selectedThread ? (
              <p className="text-xs text-muted-foreground">בחר שיחה מהרשימה</p>
            ) : (
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p><strong>שם חשבון:</strong> {selectedThread.user_full_name || 'לא זמין'}</p>
                <p><strong>שם חנות:</strong> {selectedThread.tenant_name || 'לא זמין'}</p>
                <p><strong>אימייל:</strong> {selectedThread.user_email || 'לא זמין'}</p>
              </div>
            )}
            {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
            {!selectedThread ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                בחר שיחה מהרשימה כדי להתחיל מענה.
              </div>
            ) : (
              <div className="space-y-3">
                {sortedMessages.map((m) => {
                  const isSupport = m.sender_type === 'support';
                  return (
                    <div key={m.id} className={`flex ${isSupport ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          isSupport
                            ? 'bg-blue-600 text-white'
                            : 'border bg-slate-100 text-slate-900 dark:bg-muted dark:text-foreground'
                        }`}
                      >
                        <p className={`mb-1 text-[11px] font-semibold ${isSupport ? 'text-blue-100' : 'text-muted-foreground'}`}>
                          {isSupport ? 'אני (תמיכה):' : 'לקוח:'}
                        </p>
                        {m.message ? <p className="whitespace-pre-wrap">{m.message}</p> : null}
                        {m.attachment_url ? (
                          <a
                            className={`mt-1 inline-block text-xs underline ${isSupport ? 'text-blue-100' : 'text-primary'}`}
                            href={m.attachment_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            קובץ מצורף
                          </a>
                        ) : null}
                        <p className={`mt-1 text-[10px] ${isSupport ? 'text-blue-100/90' : 'text-muted-foreground'}`}>
                          {new Date(m.created_at).toLocaleString('he-IL')}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="border-t bg-white px-3 py-3 dark:bg-background sm:px-4">
            <div className="flex gap-2">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="כתוב תגובה ללקוח..."
                maxLength={2000}
                disabled={!selectedThread}
              />
              <Button onClick={send} disabled={sending || !message.trim() || !selectedThread}>
                {sending ? 'שולח...' : 'שלח'}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
