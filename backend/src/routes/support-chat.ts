import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { isSupportedAttachmentMimeType, uploadSupportAttachment } from '../lib/support-storage.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
});

const sendMessageSchema = z.object({
  message: z.string().trim().max(2000).optional(),
  threadId: z.string().uuid().optional(),
});

async function getCurrentTenantId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('memberships')
    .select('tenant_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);
  return (data?.[0]?.tenant_id as string | null) ?? null;
}

async function touchThread(threadId: string): Promise<void> {
  await supabase
    .from('support_threads')
    .update({
      updated_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    })
    .eq('id', threadId);
}

router.get('/thread', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user as { id: string };
    const { data: existing } = await supabase
      .from('support_threads')
      .select('id,user_id,tenant_id,status,created_at,updated_at,last_message_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1);

    if (existing && existing.length > 0) {
      return res.json(existing[0]);
    }

    const tenantId = await getCurrentTenantId(user.id);
    const { data: created, error } = await supabase
      .from('support_threads')
      .insert({
        user_id: user.id,
        tenant_id: tenantId,
        status: 'open',
      })
      .select('id,user_id,tenant_id,status,created_at,updated_at,last_message_at')
      .single();

    if (error || !created) {
      return res.status(500).json({ error: 'לא הצלחנו ליצור שיחת תמיכה' });
    }

    return res.json(created);
  } catch (error) {
    console.error('[support-chat] get thread failed:', error);
    return res.status(500).json({ error: 'שגיאת שרת' });
  }
});

router.get('/messages', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user as { id: string };
    const threadId = String(req.query.threadId || '');
    if (!threadId) return res.status(400).json({ error: 'threadId is required' });

    const { data: thread } = await supabase
      .from('support_threads')
      .select('id,user_id')
      .eq('id', threadId)
      .single();

    if (!thread || thread.user_id !== user.id) {
      return res.status(403).json({ error: 'אין גישה לשיחה זו' });
    }

    const { data: messages, error } = await supabase
      .from('support_messages')
      .select('id,thread_id,sender_type,sender_user_id,message,attachment_url,created_at,read_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: 'שגיאה בטעינת הודעות' });

    await supabase
      .from('support_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('thread_id', threadId)
      .eq('sender_type', 'support')
      .is('read_at', null);

    return res.json(messages || []);
  } catch (error) {
    console.error('[support-chat] list messages failed:', error);
    return res.status(500).json({ error: 'שגיאת שרת' });
  }
});

router.post('/messages', requireAuth, upload.single('attachment'), async (req, res) => {
  try {
    const user = (req as any).user as { id: string };
    const body = sendMessageSchema.parse(req.body);
    const message = (body.message || '').trim();
    const file = req.file;
    if (!message && !file) {
      return res.status(400).json({ error: 'יש לכתוב הודעה או לצרף קובץ' });
    }

    let threadId = body.threadId || '';
    if (!threadId) {
      const { data: existing } = await supabase
        .from('support_threads')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1);
      if (existing && existing.length > 0) {
        threadId = existing[0].id as string;
      } else {
        const tenantId = await getCurrentTenantId(user.id);
        const { data: created, error: createError } = await supabase
          .from('support_threads')
          .insert({
            user_id: user.id,
            tenant_id: tenantId,
            status: 'open',
          })
          .select('id')
          .single();
        if (createError || !created) {
          return res.status(500).json({ error: 'לא הצלחנו ליצור שיחת תמיכה' });
        }
        threadId = created.id as string;
      }
    }

    const { data: thread } = await supabase
      .from('support_threads')
      .select('id,user_id')
      .eq('id', threadId)
      .single();
    if (!thread || thread.user_id !== user.id) {
      return res.status(403).json({ error: 'אין גישה לשיחה זו' });
    }

    let attachmentUrl: string | null = null;
    if (file) {
      if (!isSupportedAttachmentMimeType(file.mimetype)) {
        return res.status(400).json({ error: 'סוג קובץ לא נתמך. ניתן לצרף תמונה או PDF בלבד.' });
      }
      const uploaded = await uploadSupportAttachment({
        fileBuffer: file.buffer,
        fileName: file.originalname || 'attachment',
        mimeType: file.mimetype || 'application/octet-stream',
      });
      attachmentUrl = uploaded.signedUrl;
    }

    const { data: createdMessage, error } = await supabase
      .from('support_messages')
      .insert({
        thread_id: threadId,
        sender_type: 'user',
        sender_user_id: user.id,
        message: message || null,
        attachment_url: attachmentUrl,
      })
      .select('id,thread_id,sender_type,sender_user_id,message,attachment_url,created_at,read_at')
      .single();

    if (error || !createdMessage) {
      return res.status(500).json({ error: 'לא הצלחנו לשלוח הודעה' });
    }

    await touchThread(threadId);
    return res.json(createdMessage);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues?.[0];
      return res.status(400).json({ error: issue?.message || 'נתונים לא תקינים' });
    }
    console.error('[support-chat] send message failed:', error);
    return res.status(500).json({ error: 'שגיאת שרת' });
  }
});

router.get('/admin/threads', requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    const { data: threads, error } = await supabase
      .from('support_threads')
      .select('id,user_id,tenant_id,status,created_at,updated_at,last_message_at')
      .order('last_message_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'שגיאה בטעינת שיחות' });

    const userIds = [...new Set((threads || []).map((t: any) => t.user_id).filter(Boolean))];
    const tenantIds = [...new Set((threads || []).map((t: any) => t.tenant_id).filter(Boolean))] as string[];

    const [profilesRes, tenantsRes, authUsersRes] = await Promise.all([
      userIds.length > 0
        ? supabase.from('profiles').select('user_id, full_name').in('user_id', userIds)
        : Promise.resolve({ data: [], error: null } as any),
      tenantIds.length > 0
        ? supabase.from('tenants').select('id, name').in('id', tenantIds)
        : Promise.resolve({ data: [], error: null } as any),
      supabase.auth.admin.listUsers(),
    ]);

    const profilesMap = new Map<string, { full_name: string | null }>();
    (profilesRes.data || []).forEach((p: any) => {
      profilesMap.set(p.user_id, { full_name: p.full_name || null });
    });

    const tenantsMap = new Map<string, { name: string }>();
    (tenantsRes.data || []).forEach((t: any) => {
      tenantsMap.set(t.id, { name: t.name || '' });
    });

    const emailsMap = new Map<string, string | null>();
    (authUsersRes.data?.users || []).forEach((u: any) => {
      if (userIds.includes(u.id)) {
        emailsMap.set(u.id, u.email || null);
      }
    });

    const enriched = (threads || []).map((t: any) => ({
      ...t,
      user_full_name: profilesMap.get(t.user_id)?.full_name || null,
      user_email: emailsMap.get(t.user_id) || null,
      tenant_name: t.tenant_id ? tenantsMap.get(t.tenant_id)?.name || null : null,
    }));

    return res.json(enriched);
  } catch (error) {
    console.error('[support-chat] admin threads failed:', error);
    return res.status(500).json({ error: 'שגיאת שרת' });
  }
});

router.get('/admin/messages', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const threadId = String(req.query.threadId || '');
    if (!threadId) return res.status(400).json({ error: 'threadId is required' });
    const { data, error } = await supabase
      .from('support_messages')
      .select('id,thread_id,sender_type,sender_user_id,message,attachment_url,created_at,read_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: 'שגיאה בטעינת הודעות' });

    await supabase
      .from('support_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('thread_id', threadId)
      .eq('sender_type', 'user')
      .is('read_at', null);

    return res.json(data || []);
  } catch (error) {
    console.error('[support-chat] admin messages failed:', error);
    return res.status(500).json({ error: 'שגיאת שרת' });
  }
});

router.post('/admin/messages', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const body = z.object({
      threadId: z.string().uuid(),
      message: z.string().trim().min(1).max(2000),
    }).parse(req.body);
    const user = (req as any).user as { id: string };

    const { data: created, error } = await supabase
      .from('support_messages')
      .insert({
        thread_id: body.threadId,
        sender_type: 'support',
        sender_user_id: user.id,
        message: body.message.trim(),
      })
      .select('id,thread_id,sender_type,sender_user_id,message,attachment_url,created_at,read_at')
      .single();

    if (error || !created) return res.status(500).json({ error: 'לא הצלחנו לשלוח תשובה' });

    await touchThread(body.threadId);
    return res.json(created);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues?.[0];
      return res.status(400).json({ error: issue?.message || 'נתונים לא תקינים' });
    }
    console.error('[support-chat] admin send failed:', error);
    return res.status(500).json({ error: 'שגיאת שרת' });
  }
});

export default router;
