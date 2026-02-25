import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { supportChatApi, type SupportMessage, type SupportThread } from '../lib/api';

export default function SupportChat() {
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    [messages]
  );

  const load = async () => {
    try {
      setError(null);
      const t = await supportChatApi.getMyThread();
      setThread(t);
      const m = await supportChatApi.getMyMessages(t.id);
      setMessages(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת צ׳אט התמיכה');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!thread?.id) return;
    const interval = window.setInterval(async () => {
      try {
        const m = await supportChatApi.getMyMessages(thread.id);
        setMessages(m);
      } catch {
        // Non-blocking polling.
      }
    }, 4000);
    return () => window.clearInterval(interval);
  }, [thread?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sortedMessages.length]);

  const send = async () => {
    const trimmed = message.trim();
    if (!trimmed && !attachment) return;
    try {
      setSending(true);
      setError(null);
      await supportChatApi.sendMyMessage({
        threadId: thread?.id,
        message: trimmed || undefined,
        attachment,
      });
      setMessage('');
      setAttachment(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשליחת הודעה');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">טוען צ׳אט תמיכה...</div>;
  }

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-6 sm:-mt-8 bg-white pb-20 dark:bg-background sm:pb-8 border-t">
      <div className="mx-auto grid w-full max-w-4xl grid-cols-1">
        <section className="flex flex-col">
          <div className="border-b px-4 py-3">
            <h1 className="text-lg font-bold">תמיכה</h1>
            <p className="text-xs text-muted-foreground">שיחה עם צוות התמיכה</p>
            {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
          </div>

          <div className="max-h-[60vh] overflow-y-auto px-3 py-4 sm:px-4 md:max-h-[calc(100vh-320px)]">
            {sortedMessages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                אין הודעות עדיין. אפשר להתחיל לכתוב ונענה כאן.
              </div>
            ) : (
              <div className="space-y-3">
                {sortedMessages.map((m) => {
                  const isMe = m.sender_type === 'user';
                  return (
                    <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          isMe
                            ? 'bg-blue-600 text-white'
                            : 'border bg-slate-100 text-slate-900 dark:bg-muted dark:text-foreground'
                        }`}
                      >
                        <p className={`mb-1 text-[11px] font-semibold ${isMe ? 'text-blue-100' : 'text-muted-foreground'}`}>
                          {isMe ? 'אני:' : 'תמיכה:'}
                        </p>
                        {m.message ? <p className="whitespace-pre-wrap">{m.message}</p> : null}
                        {m.attachment_url ? (
                          <a
                            className={`mt-1 inline-block text-xs underline ${isMe ? 'text-blue-100' : 'text-primary'}`}
                            href={m.attachment_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            קובץ מצורף
                          </a>
                        ) : null}
                        <p className={`mt-1 text-[10px] ${isMe ? 'text-blue-100/90' : 'text-muted-foreground'}`}>
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
            <div className="mb-2">
              <Input
                id="support-chat-attachment"
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setAttachment(e.target.files?.[0] || null)}
              />
              {attachment ? <p className="mt-1 text-xs text-muted-foreground">נבחר: {attachment.name}</p> : null}
            </div>
            <div className="flex items-end gap-2">
              <textarea
                id="support-chat-message"
                className="min-h-12 flex-1 rounded-xl border bg-background px-3 py-2 text-sm"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="כתוב הודעה..."
                maxLength={2000}
              />
              <Button onClick={send} disabled={sending || (!message.trim() && !attachment)} className="h-11 rounded-xl px-5">
                {sending ? 'שולח...' : 'שלח'}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
