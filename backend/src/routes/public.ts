import { Router } from 'express';
import { z } from 'zod';
import { sendContactEmail } from '../lib/mailer.js';
import { consumePublicRateLimit } from '../lib/public-rate-limit.js';
import { verifyTurnstileToken } from '../lib/turnstile.js';

const router = Router();

const contactSchema = z.object({
  name: z.string().trim().min(2, 'שם חייב להכיל לפחות 2 תווים').max(80),
  email: z.string().trim().email('אימייל לא תקין'),
  message: z.string().trim().min(10, 'נא לרשום הודעה מפורטת יותר').max(2000),
  website: z.string().optional().default(''),
  turnstileToken: z.string().min(1, 'אימות אבטחה נכשל'),
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

router.post('/contact', async (req, res) => {
  try {
    const body = contactSchema.parse(req.body);
    const ipAddress = getClientIp(req);

    const allowed = await consumePublicRateLimit({
      scope: 'contact',
      identifier: ipAddress || 'unknown',
      max: 5,
      windowMinutes: 10,
    });

    if (!allowed) {
      return res.status(429).json({ error: 'ניסית יותר מדי פעמים. נסה שוב בעוד כמה דקות.' });
    }

    if (body.website && body.website.trim().length > 0) {
      // Honeypot field: silently accept to avoid signaling bots.
      return res.json({ ok: true });
    }

    const turnstileOk = await verifyTurnstileToken(body.turnstileToken, ipAddress);
    if (!turnstileOk) {
      return res.status(400).json({ error: 'אימות אבטחה נכשל. נסה שוב.' });
    }

    const subject = `Stockly contact form - ${body.name}`;
    const text = [
      'New contact request from stockly-il.com',
      '',
      `Name: ${body.name}`,
      `Email: ${body.email}`,
      '',
      'Message:',
      body.message,
    ].join('\n');

    await sendContactEmail({
      subject,
      text,
      replyTo: body.email,
    });

    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues?.[0];
      return res.status(400).json({ error: issue?.message || 'נתונים לא תקינים' });
    }

    console.error('[public-contact] failed to send email:', error);
    return res.status(500).json({ error: 'לא הצלחנו לשלוח כרגע. נסה שוב בעוד כמה דקות.' });
  }
});

export default router;
