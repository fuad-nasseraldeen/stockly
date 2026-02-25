import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { supportChatApi, type SupportMessage, type SupportThread } from '../lib/api';

export default function SupportChat() {
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);

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
    <div className="space-y-4">
      <Card className="shadow-md border-2">
        <CardHeader>
          <CardTitle className="text-lg font-bold">תמיכה - שיחה עם הצוות</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="max-h-[55vh] overflow-y-auto rounded-md border bg-muted/20 p-3 space-y-2">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין הודעות עדיין. אפשר לשלוח לנו שאלה ונענה כאן.</p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-md px-3 py-2 text-sm ${
                    m.sender_type === 'user'
                      ? 'mr-auto max-w-[85%] bg-primary text-primary-foreground'
                      : 'ml-auto max-w-[85%] bg-background border'
                  }`}
                >
                  {m.message ? <p className="whitespace-pre-wrap">{m.message}</p> : null}
                  {m.attachment_url ? (
                    <a className="underline text-xs" href={m.attachment_url} target="_blank" rel="noreferrer">
                      קובץ מצורף
                    </a>
                  ) : null}
                  <p className="mt-1 text-[10px] opacity-70">
                    {new Date(m.created_at).toLocaleString('he-IL')}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-chat-message">הודעה חדשה</Label>
            <textarea
              id="support-chat-message"
              className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="כתוב כאן את ההודעה שלך..."
              maxLength={2000}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="support-chat-attachment">קובץ/תמונה (אופציונלי)</Label>
            <Input
              id="support-chat-attachment"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setAttachment(e.target.files?.[0] || null)}
            />
            {attachment ? <p className="text-xs text-muted-foreground">נבחר: {attachment.name}</p> : null}
          </div>
          <Button onClick={send} disabled={sending || (!message.trim() && !attachment)}>
            {sending ? 'שולח...' : 'שלח הודעה'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
