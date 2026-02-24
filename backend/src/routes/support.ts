import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { consumePublicRateLimit } from '../lib/public-rate-limit.js';
import { sendSms } from '../providers/smsTo.js';
import multer from 'multer';
import { isSupportedAttachmentMimeType, uploadSupportAttachment } from '../lib/support-storage.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024, // 8MB
  },
});

const supportSmsSchema = z.object({
  message: z.string().trim().min(5, 'נא לכתוב הודעה קצרה').max(500, 'ההודעה ארוכה מדי'),
});

function getClientIp(req: { headers: Record<string, unknown>; socket?: { remoteAddress?: string } }): string | null {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length > 0) {
    return realIp.trim();
  }
  return req.socket?.remoteAddress || null;
}

function getSupportSmsTarget(): string | null {
  const target = (process.env.SUPPORT_SMS_TO || '').trim();
  return target || null;
}

function formatSupportSms(payload: {
  userId: string;
  userEmail?: string;
  message: string;
  attachmentUrl?: string;
}): string {
  const lines = [
    'Stockly Support',
    `User: ${payload.userEmail || payload.userId}`,
    `Msg: ${payload.message}`,
  ];
  if (payload.attachmentUrl) {
    lines.push(`File: ${payload.attachmentUrl}`);
  }
  const full = lines.join('\n');
  return full.length > 640 ? `${full.slice(0, 637)}...` : full;
}

router.post('/sms', requireAuth, async (req, res) => {
  try {
    const body = supportSmsSchema.parse(req.body);
    const user = (req as any).user as { id: string; email?: string } | undefined;
    if (!user?.id) {
      return res.status(401).json({ error: 'נדרש להתחבר' });
    }

    const supportTarget = getSupportSmsTarget();
    if (!supportTarget) {
      return res.status(503).json({ error: 'תמיכה זמנית לא זמינה' });
    }

    const ipAddress = getClientIp(req);
    const [ipAllowed, userAllowed] = await Promise.all([
      consumePublicRateLimit({
        scope: 'support-sms-ip',
        identifier: ipAddress || 'unknown',
        max: 5,
        windowMinutes: 10,
      }),
      consumePublicRateLimit({
        scope: 'support-sms-user',
        identifier: user.id,
        max: 3,
        windowMinutes: 10,
      }),
    ]);

    if (!ipAllowed || !userAllowed) {
      return res.status(429).json({ error: 'ניסית יותר מדי פעמים. נסה שוב בעוד כמה דקות.' });
    }

    const smsText = formatSupportSms({
      userId: user.id,
      userEmail: user.email,
      message: body.message.trim(),
    });

    await sendSms(supportTarget, smsText);
    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues?.[0];
      return res.status(400).json({ error: issue?.message || 'נתונים לא תקינים' });
    }

    console.error('[support-sms] failed to send support sms:', error);
    return res.status(500).json({ error: 'לא הצלחנו לשלוח כרגע. נסה שוב בעוד כמה דקות.' });
  }
});

router.post('/sms-with-attachment', requireAuth, upload.single('attachment'), async (req, res) => {
  try {
    const body = supportSmsSchema.parse(req.body);
    const user = (req as any).user as { id: string; email?: string } | undefined;
    if (!user?.id) {
      return res.status(401).json({ error: 'נדרש להתחבר' });
    }

    const supportTarget = getSupportSmsTarget();
    if (!supportTarget) {
      return res.status(503).json({ error: 'תמיכה זמנית לא זמינה' });
    }

    const ipAddress = getClientIp(req);
    const [ipAllowed, userAllowed] = await Promise.all([
      consumePublicRateLimit({
        scope: 'support-sms-ip',
        identifier: ipAddress || 'unknown',
        max: 5,
        windowMinutes: 10,
      }),
      consumePublicRateLimit({
        scope: 'support-sms-user',
        identifier: user.id,
        max: 3,
        windowMinutes: 10,
      }),
    ]);

    if (!ipAllowed || !userAllowed) {
      return res.status(429).json({ error: 'ניסית יותר מדי פעמים. נסה שוב בעוד כמה דקות.' });
    }

    const file = req.file;
    let attachmentUrl = '';
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

    const smsText = formatSupportSms({
      userId: user.id,
      userEmail: user.email,
      message: body.message.trim(),
      attachmentUrl,
    });

    await sendSms(supportTarget, smsText);
    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues?.[0];
      return res.status(400).json({ error: issue?.message || 'נתונים לא תקינים' });
    }

    console.error('[support-sms] failed to send support sms with attachment:', error);
    return res.status(500).json({ error: 'לא הצלחנו לשלוח כרגע. נסה שוב בעוד כמה דקות.' });
  }
});

export default router;
