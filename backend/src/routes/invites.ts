import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

async function getProfilePhone(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('phone_e164')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;
  return (data?.phone_e164 as string | null) ?? null;
}

// Accept all pending invites for the logged-in user (email and/or verified phone)
router.post('/accept', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const userEmail = user.email ? String(user.email).toLowerCase() : null;
    const userPhone = await getProfilePhone(user.id);

    if (!userEmail && !userPhone) {
      return res.status(400).json({ error: 'למשתמש אין אימייל או טלפון מאומת לזיהוי הזמנות' });
    }

    const nowIso = new Date().toISOString();
    const inviteRows: any[] = [];

    if (userEmail) {
      const { data, error } = await supabase
        .from('invites')
        .select('*')
        .ilike('email', userEmail)
        .is('accepted_at', null)
        .gt('expires_at', nowIso);
      if (error) {
        console.error('Error fetching invites by email:', error);
        return res.status(500).json({ error: 'שגיאה בטעינת הזמנות' });
      }
      inviteRows.push(...(data || []));
    }

    if (userPhone) {
      const { data, error } = await supabase
        .from('invites')
        .select('*')
        .eq('phone_e164', userPhone)
        .is('accepted_at', null)
        .gt('expires_at', nowIso);
      if (error) {
        console.error('Error fetching invites by phone:', error);
        return res.status(500).json({ error: 'שגיאה בטעינת הזמנות' });
      }
      inviteRows.push(...(data || []));
    }

    const invites = Array.from(new Map(inviteRows.map((inv) => [inv.id, inv])).values());

    if (!invites || invites.length === 0) {
      return res.json({
        accepted: 0,
        already_member: 0,
        not_found: 0,
        message: 'לא נמצאו הזמנות ממתינות',
      });
    }

    let accepted = 0;
    let already_member = 0;
    const errors: string[] = [];

    // Process each invite
    for (const invite of invites) {
      try {
        // Check if user is already a member
        const { data: existingMembership } = await supabase
          .from('memberships')
          .select('id')
          .eq('user_id', user.id)
          .eq('tenant_id', invite.tenant_id)
          .single();

        if (existingMembership) {
          // Already a member, just mark invite as accepted
          await supabase
            .from('invites')
            .update({ accepted_at: new Date().toISOString() })
            .eq('id', invite.id);
          already_member++;
          continue;
        }

        // Create membership
        const { error: membershipError } = await supabase
          .from('memberships')
          .insert({
            user_id: user.id,
            tenant_id: invite.tenant_id,
            role: invite.role,
          });

        if (membershipError) {
          if (membershipError.code === '23505') {
            // Unique constraint violation - already member
            await supabase
              .from('invites')
              .update({ accepted_at: new Date().toISOString() })
              .eq('id', invite.id);
            already_member++;
          } else {
            errors.push(`שגיאה ביצירת חברות לטננט ${invite.tenant_id}: ${membershipError.message}`);
          }
          continue;
        }

        // Mark invite as accepted
        await supabase
          .from('invites')
          .update({ accepted_at: new Date().toISOString() })
          .eq('id', invite.id);

        accepted++;
      } catch (error: any) {
        errors.push(`שגיאה בעיבוד הזמנה ${invite.id}: ${error.message}`);
      }
    }

    res.json({
      accepted,
      already_member,
      not_found: 0,
      errors: errors.length > 0 ? errors : undefined,
      message: `התקבלו ${accepted} הזמנות${already_member > 0 ? `, ${already_member} כבר היו חברים` : ''}`,
    });
  } catch (error: any) {
    console.error('Accept invites error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

export default router;
