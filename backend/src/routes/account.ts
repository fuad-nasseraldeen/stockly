import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { sendSms } from '../providers/smsTo.js';

const router = Router();

const deleteAccountSchema = z.object({
  confirmation: z.string().trim(),
  reason: z.enum([
    'not_satisfied',
    'too_expensive',
    'stopped_working_with_suppliers',
    'moved_to_other_system',
    'missing_features',
    'other',
  ]),
  message: z.string().trim().max(500).optional().nullable(),
});

const reasonLabels: Record<string, string> = {
  not_satisfied: 'לא מרוצה מהאפליקציה',
  too_expensive: 'יקר לי כרגע',
  stopped_working_with_suppliers: 'הפסקתי לעבוד עם ספקים',
  moved_to_other_system: 'עברתי למערכת אחרת',
  missing_features: 'חסרות לי יכולות חשובות',
  other: 'אחר',
};

function getSupportSmsTarget(): string | null {
  const target = (process.env.SUPPORT_SMS_TO || '').trim();
  return target || null;
}

function formatDeleteAccountSms(payload: {
  fullName: string | null;
  email: string | null;
  reason: string;
  message: string;
  deletedAtIso: string;
}): string {
  const lines = [
    'Stockly - מחיקת חשבון',
    `שם: ${payload.fullName || 'לא זמין'}`,
    `אימייל: ${payload.email || 'לא זמין'}`,
    `סיבה: ${payload.reason}`,
    `הודעה: ${payload.message || '-'}`,
    `תאריך מחיקה: ${payload.deletedAtIso}`,
  ];
  const full = lines.join('\n');
  return full.length > 640 ? `${full.slice(0, 637)}...` : full;
}

async function cleanupUserForeignKeys(userId: string): Promise<void> {
  // Remove FK references that can block deleting auth.users row.
  await supabase.from('invites').update({ invited_by: null }).eq('invited_by', userId);
  await supabase.from('categories').update({ created_by: null }).eq('created_by', userId);
  await supabase.from('suppliers').update({ created_by: null }).eq('created_by', userId);
  await supabase.from('products').update({ created_by: null }).eq('created_by', userId);
  await supabase.from('price_entries').update({ created_by: null }).eq('created_by', userId);
  await supabase.from('memberships').update({ blocked_by: null }).eq('blocked_by', userId);
}

router.post('/delete', requireAuth, async (req, res) => {
  try {
    const body = deleteAccountSchema.parse(req.body);
    const user = (req as any).user as { id: string; email?: string } | undefined;
    if (!user?.id) {
      return res.status(401).json({ error: 'נדרש להתחבר' });
    }

    if (body.confirmation !== 'מחק') {
      return res.status(400).json({ error: 'יש להקליד "מחק" כדי לאשר' });
    }

    const supportTarget = getSupportSmsTarget();
    if (!supportTarget) {
      return res.status(503).json({ error: 'יעד תמיכה לא מוגדר למחיקת חשבון' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', user.id)
      .maybeSingle();

    const deletedAtIso = new Date().toISOString();
    const sms = formatDeleteAccountSms({
      fullName: (profile?.full_name as string | null) ?? null,
      email: user.email || null,
      reason: reasonLabels[body.reason] || body.reason,
      message: body.message?.trim() || '-',
      deletedAtIso,
    });

    await cleanupUserForeignKeys(user.id);

    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return res.status(500).json({ error: deleteError.message || 'מחיקת החשבון נכשלה' });
    }

    try {
      await sendSms(supportTarget, sms);
    } catch (smsError) {
      console.error('[account] delete sms failed:', smsError);
    }

    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues?.[0];
      return res.status(400).json({ error: issue?.message || 'נתונים לא תקינים' });
    }
    console.error('[account] delete failed:', error);
    return res.status(500).json({ error: 'לא הצלחנו למחוק את החשבון כרגע. נסה שוב בעוד כמה דקות.' });
  }
});

export default router;
