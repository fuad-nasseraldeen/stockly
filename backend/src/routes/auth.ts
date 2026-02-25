import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { supabaseAuthClient } from '../lib/supabase-auth-client.js';
import { normalizePhoneToE164 } from '../lib/phone.js';
import {
  generateOtpCode,
  hashOtpCode,
  verifyOtpCodeConstantTime,
} from '../lib/otp.js';
import {
  isOtpIpRateLimited,
  isOtpPhoneDailyCapReached,
  isOtpPhoneRateLimited,
  logOtpRequest,
} from '../lib/otp-rate-limit.js';
import { sendSms } from '../providers/smsTo.js';
import { verifyTurnstileToken } from '../lib/turnstile.js';
import { requireAuth } from '../middleware/auth.js';
import { verifyAccessToken } from '../lib/jwt.js';

const router = Router();

const OTP_PURPOSE = 'login';
const OTP_TTL_MS = 5 * 60_000;
const OTP_COOLDOWN_MS = 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCKOUT_MS = 15 * 60_000;
const INVALID_CODE_ERROR = { error: 'INVALID_CODE' } as const;
const PHONE_MISMATCH_ERROR = { error: 'PHONE_MISMATCH' } as const;
const PHONE_NOT_REGISTERED_ERROR = { error: 'PHONE_NOT_REGISTERED' } as const;
const PHONE_ALREADY_EXISTS_ERROR = { error: 'PHONE_ALREADY_EXISTS' } as const;
const OTP_SEND_FAILED_ERROR = { error: 'OTP_SEND_FAILED' } as const;
const OTP_RATE_LIMITED_ERROR = { error: 'OTP_RATE_LIMITED' } as const;

const requestOtpSchema = z.object({
  phone: z.string().min(1, 'phone is required'),
  turnstileToken: z.string().optional().nullable(),
  flow: z.enum(['login', 'signup', 'verify_phone']).optional(),
  email: z.string().trim().email('email is required').optional(),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(1, 'phone is required'),
  code: z.string().regex(/^\d{6}$/, 'code must be 6 digits'),
});

const signupOtpSchema = z.object({
  email: z.string().trim().email('email is required'),
  password: z.string().min(6, 'password must be at least 6 chars'),
  fullName: z.string().trim().min(2, 'full_name is required').max(120),
  phone: z.string().min(1, 'phone is required'),
  code: z.string().regex(/^\d{6}$/, 'code must be 6 digits'),
});

const verifyMyPhoneSchema = z.object({
  phone: z.string().min(1, 'phone is required'),
  code: z.string().regex(/^\d{6}$/, 'code must be 6 digits'),
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

  const socketIp = req.socket?.remoteAddress;
  return socketIp || null;
}

async function getOptionalAuthedUserId(req: { headers: Record<string, unknown> }): Promise<string | null> {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];
  if (!token) return null;
  const verified = await verifyAccessToken(token);
  return verified?.sub || null;
}

type OtpChallengeRow = {
  id: string;
  phone_e164: string;
  code_hash: string;
  purpose: string;
  expires_at: string;
  attempts: number;
  last_sent_at: string;
  locked_until: string | null;
  created_at: string;
};

async function getLatestOtpChallenge(phoneE164: string): Promise<OtpChallengeRow | null> {
  const { data, error } = await supabase
    .from('otp_challenges')
    .select('*')
    .eq('phone_e164', phoneE164)
    .eq('purpose', OTP_PURPOSE)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[otp] failed to fetch challenge:', error);
    return null;
  }

  return data?.[0] || null;
}

async function getProfilePhone(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('phone_e164')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[auth] failed to load profile phone:', error);
    return null;
  }

  return (data?.phone_e164 || null) as string | null;
}

async function setProfilePhoneVerified(userId: string, phoneE164: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      phone_e164: phoneE164,
      phone_verified_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    throw new Error(`failed to update profile phone: ${error.message}`);
  }
}

async function resolveExistingUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    throw new Error(`listUsers failed: ${error.message}`);
  }

  const found = (data?.users || []).find((user: any) => (user.email || '').toLowerCase() === email.toLowerCase());
  return found?.id || null;
}

async function hasRegisteredProfilePhone(phoneE164: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('phone_e164', phoneE164)
    .limit(1);

  if (error) {
    console.error('[auth] failed to check phone registration:', error);
    return false;
  }

  return Boolean(data && data.length > 0);
}

function isPhoneDuplicateError(message: string): boolean {
  const lower = (message || '').toLowerCase();
  return (
    lower.includes('duplicate key') ||
    lower.includes('profiles_phone_e164_unique_idx') ||
    lower.includes('phone_e164')
  );
}

async function expireActiveChallenges(phoneE164: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('otp_challenges')
    .update({ expires_at: nowIso })
    .eq('phone_e164', phoneE164)
    .eq('purpose', OTP_PURPOSE)
    .gt('expires_at', nowIso);

  if (error) {
    console.error('[otp] failed to expire previous active challenges:', error);
  }
}

async function getUserEmailById(userId: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    return null;
  }
  return data.user.email || null;
}

async function signInExistingUserByEmailOtp(email: string): Promise<{ session: any; user: any }> {
  const adminApi = supabase.auth.admin as any;
  const authApi = supabaseAuthClient.auth as any;

  const { data: linkData, error: linkError } = await adminApi.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError) {
    throw new Error(linkError.message || 'failed to create login link');
  }

  const emailOtp = linkData?.properties?.email_otp;
  if (!emailOtp) {
    throw new Error('missing email otp from generated link');
  }

  const { data, error } = await authApi.verifyOtp({
    email,
    token: emailOtp,
    type: 'email',
  });

  if (error || !data?.session || !data?.user) {
    throw new Error(error?.message || 'failed to create session for existing user');
  }

  return { session: data.session, user: data.user };
}

router.post('/otp/request', async (req, res) => {
  try {
    const body = requestOtpSchema.parse(req.body);
    const flow = body.flow || 'login';
    const phoneE164 = normalizePhoneToE164(body.phone);
    if (!phoneE164) {
      return res.status(400).json({ error: 'INVALID_PHONE' });
    }

    const ipAddress = getClientIp(req);
    const authedUserId = await getOptionalAuthedUserId(req);

    // Public login flow: do not send OTP to unregistered phone numbers.
    if (flow === 'login' && !authedUserId) {
      const isRegistered = await hasRegisteredProfilePhone(phoneE164);
      if (!isRegistered) {
        return res.status(404).json(PHONE_NOT_REGISTERED_ERROR);
      }
    }

    if (flow === 'signup') {
      if (!body.email) {
        return res.status(400).json({ error: 'email is required for signup flow' });
      }
      const existingUserId = await resolveExistingUserIdByEmail(body.email);
      if (existingUserId) {
        return res.status(400).json({ error: 'EMAIL_ALREADY_EXISTS' });
      }
      const phoneTaken = await hasRegisteredProfilePhone(phoneE164);
      if (phoneTaken) {
        return res.status(400).json(PHONE_ALREADY_EXISTS_ERROR);
      }
    }

    const requireTurnstile = Boolean((process.env.TURNSTILE_SECRET_KEY || '').trim());
    const shouldVerifyTurnstile = requireTurnstile && !authedUserId;
    if (shouldVerifyTurnstile) {
      const token = body.turnstileToken || '';
      const verified = await verifyTurnstileToken(token, ipAddress);
      if (!verified) {
        return res.status(400).json({ error: 'SECURITY_CHECK_FAILED' });
      }
    }

    const [ipLimited, phoneLimited] = await Promise.all([
      isOtpIpRateLimited(ipAddress),
      isOtpPhoneRateLimited(phoneE164),
    ]);

    if (ipLimited || phoneLimited) {
      await logOtpRequest({ phoneE164, ipAddress, sent: false });
      if (flow === 'signup') {
        return res.status(429).json(OTP_RATE_LIMITED_ERROR);
      }
      return res.json({ ok: true });
    }

    const latest = await getLatestOtpChallenge(phoneE164);
    const now = Date.now();

    if (latest) {
      const lockedUntilMs = latest.locked_until ? new Date(latest.locked_until).getTime() : 0;
      if (lockedUntilMs > now) {
        await logOtpRequest({ phoneE164, ipAddress, sent: false });
        if (flow === 'signup') {
          return res.status(429).json(OTP_RATE_LIMITED_ERROR);
        }
        return res.json({ ok: true });
      }

      const lastSentAtMs = new Date(latest.last_sent_at).getTime();
      if (now - lastSentAtMs < OTP_COOLDOWN_MS) {
        await logOtpRequest({ phoneE164, ipAddress, sent: false });
        if (flow === 'signup') {
          return res.status(429).json(OTP_RATE_LIMITED_ERROR);
        }
        return res.json({ ok: true });
      }
    }

    const dailyCapReached = await isOtpPhoneDailyCapReached(phoneE164);
    if (dailyCapReached) {
      await logOtpRequest({ phoneE164, ipAddress, sent: false });
      if (flow === 'signup') {
        return res.status(429).json(OTP_RATE_LIMITED_ERROR);
      }
      return res.json({ ok: true });
    }

    const otpCode = generateOtpCode();
    const codeHash = hashOtpCode(otpCode);
    const expiresAt = new Date(now + OTP_TTL_MS).toISOString();

    await expireActiveChallenges(phoneE164);

    const { error: insertError } = await supabase.from('otp_challenges').insert({
      phone_e164: phoneE164,
      code_hash: codeHash,
      purpose: OTP_PURPOSE,
      expires_at: expiresAt,
      attempts: 0,
      last_sent_at: new Date().toISOString(),
      locked_until: null,
    });

    if (insertError) {
      console.error('[otp] failed to insert challenge:', insertError);
      await logOtpRequest({ phoneE164, ipAddress, sent: false });
      if (flow === 'signup') {
        return res.status(500).json(OTP_SEND_FAILED_ERROR);
      }
      return res.json({ ok: true });
    }

    try {
      await sendSms(phoneE164, `Stockly: ${otpCode}`);
      await logOtpRequest({ phoneE164, ipAddress, sent: true });
    } catch (smsError) {
      console.error('[otp] failed to send SMS:', smsError);
      await logOtpRequest({ phoneE164, ipAddress, sent: false });
      if (flow === 'signup') {
        return res.status(503).json(OTP_SEND_FAILED_ERROR);
      }
    }

    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues?.[0];
      return res.status(400).json({ error: firstIssue?.message || 'invalid request body' });
    }

    console.error('[otp] request endpoint failed:', error);
    return res.json({ ok: true });
  }
});

router.post('/otp/verify', async (req, res) => {
  try {
    const body = verifyOtpSchema.parse(req.body);
    const phoneE164 = normalizePhoneToE164(body.phone);
    if (!phoneE164) {
      return res.status(400).json(INVALID_CODE_ERROR);
    }

    const challenge = await getLatestOtpChallenge(phoneE164);
    const now = new Date();

    if (!challenge) {
      return res.status(400).json(INVALID_CODE_ERROR);
    }

    const expiresAt = new Date(challenge.expires_at);
    if (expiresAt.getTime() <= now.getTime()) {
      return res.status(400).json(INVALID_CODE_ERROR);
    }

    if (challenge.locked_until && new Date(challenge.locked_until).getTime() > now.getTime()) {
      return res.status(400).json(INVALID_CODE_ERROR);
    }

    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      const lockUntil = new Date(now.getTime() + OTP_LOCKOUT_MS).toISOString();
      await supabase
        .from('otp_challenges')
        .update({ locked_until: lockUntil })
        .eq('id', challenge.id);
      return res.status(400).json(INVALID_CODE_ERROR);
    }

    const codeMatches = verifyOtpCodeConstantTime(body.code, challenge.code_hash);
    if (!codeMatches) {
      const nextAttempts = challenge.attempts + 1;
      const lockUntil = nextAttempts >= OTP_MAX_ATTEMPTS
        ? new Date(now.getTime() + OTP_LOCKOUT_MS).toISOString()
        : null;

      await supabase
        .from('otp_challenges')
        .update({
          attempts: nextAttempts,
          locked_until: lockUntil,
        })
        .eq('id', challenge.id);

      return res.status(400).json(INVALID_CODE_ERROR);
    }

    await supabase
      .from('otp_challenges')
      .update({ expires_at: now.toISOString() })
      .eq('id', challenge.id);

    const { data: profileByPhone, error: profileError } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('phone_e164', phoneE164)
      .maybeSingle();

    if (profileError || !profileByPhone?.user_id) {
      return res.status(400).json(INVALID_CODE_ERROR);
    }

    const email = await getUserEmailById(profileByPhone.user_id);
    if (!email) {
      return res.status(400).json(INVALID_CODE_ERROR);
    }

    const { session, user } = await signInExistingUserByEmailOtp(email);

    return res.json({
      ok: true,
      user,
      session,
      phoneRequired: false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(INVALID_CODE_ERROR);
    }

    console.error('[otp] verify endpoint failed:', error);
    return res.status(400).json(INVALID_CODE_ERROR);
  }
});

router.post('/signup-with-otp', async (req, res) => {
  try {
    const body = signupOtpSchema.parse(req.body);
    const phoneE164 = normalizePhoneToE164(body.phone);
    if (!phoneE164) {
      return res.status(400).json(INVALID_CODE_ERROR);
    }

    const challenge = await getLatestOtpChallenge(phoneE164);
    const now = new Date();

    if (!challenge) {
      return res.status(400).json(INVALID_CODE_ERROR);
    }

    const expiresAt = new Date(challenge.expires_at);
    if (expiresAt.getTime() <= now.getTime()) {
      return res.status(400).json(INVALID_CODE_ERROR);
    }

    if (challenge.locked_until && new Date(challenge.locked_until).getTime() > now.getTime()) {
      return res.status(400).json(INVALID_CODE_ERROR);
    }

    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      const lockUntil = new Date(now.getTime() + OTP_LOCKOUT_MS).toISOString();
      await supabase
        .from('otp_challenges')
        .update({ locked_until: lockUntil })
        .eq('id', challenge.id);
      return res.status(400).json(INVALID_CODE_ERROR);
    }

    const codeMatches = verifyOtpCodeConstantTime(body.code, challenge.code_hash);
    if (!codeMatches) {
      const nextAttempts = challenge.attempts + 1;
      const lockUntil = nextAttempts >= OTP_MAX_ATTEMPTS
        ? new Date(now.getTime() + OTP_LOCKOUT_MS).toISOString()
        : null;

      await supabase
        .from('otp_challenges')
        .update({
          attempts: nextAttempts,
          locked_until: lockUntil,
        })
        .eq('id', challenge.id);

      return res.status(400).json(INVALID_CODE_ERROR);
    }

    await supabase
      .from('otp_challenges')
      .update({ expires_at: now.toISOString() })
      .eq('id', challenge.id);

    const existingUserId = await resolveExistingUserIdByEmail(body.email);
    if (existingUserId) {
      return res.status(400).json({ error: 'EMAIL_ALREADY_EXISTS' });
    }

    const existingPhone = await hasRegisteredProfilePhone(phoneE164);
    if (existingPhone) {
      return res.status(400).json(PHONE_ALREADY_EXISTS_ERROR);
    }

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        full_name: body.fullName,
        auth_provider: 'email_password',
      },
    });

    if (createError || !created.user) {
      return res.status(400).json({ error: createError?.message || 'SIGNUP_FAILED' });
    }

    try {
      await setProfilePhoneVerified(created.user.id, phoneE164);
    } catch (phoneError) {
      const message = phoneError instanceof Error ? phoneError.message : String(phoneError || '');
      if (isPhoneDuplicateError(message)) {
        // Best effort cleanup if phone became occupied between validation and update.
        await supabase.auth.admin.deleteUser(created.user.id);
        return res.status(400).json(PHONE_ALREADY_EXISTS_ERROR);
      }
      throw phoneError;
    }

    const { data: signedIn, error: signInError } = await supabaseAuthClient.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (signInError || !signedIn.session || !signedIn.user) {
      return res.status(400).json({ error: signInError?.message || 'SIGNIN_FAILED' });
    }

    return res.json({
      ok: true,
      user: signedIn.user,
      session: signedIn.session,
      phoneRequired: false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues?.[0]?.message || 'invalid request body' });
    }
    console.error('[auth] signup-with-otp failed:', error);
    return res.status(500).json({ error: 'SIGNUP_FAILED' });
  }
});

router.get('/phone-status', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user as { id: string };
    const phoneE164 = await getProfilePhone(user.id);
    return res.json({
      hasPhone: Boolean(phoneE164),
      phoneE164: phoneE164 || null,
      phoneRequired: !phoneE164,
    });
  } catch (error) {
    console.error('[auth] phone-status failed:', error);
    return res.status(500).json({ error: 'FAILED_TO_LOAD_PHONE_STATUS' });
  }
});

router.post('/phone/verify', requireAuth, async (req, res) => {
  try {
    const body = verifyMyPhoneSchema.parse(req.body);
    const user = (req as any).user as { id: string };
    const phoneE164 = normalizePhoneToE164(body.phone);
    if (!phoneE164) {
      return res.status(400).json(INVALID_CODE_ERROR);
    }

    const challenge = await getLatestOtpChallenge(phoneE164);
    const now = new Date();

    if (!challenge) {
      return res.status(400).json(INVALID_CODE_ERROR);
    }

    const expiresAt = new Date(challenge.expires_at);
    if (expiresAt.getTime() <= now.getTime()) {
      return res.status(400).json(INVALID_CODE_ERROR);
    }

    if (challenge.locked_until && new Date(challenge.locked_until).getTime() > now.getTime()) {
      return res.status(400).json(INVALID_CODE_ERROR);
    }

    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      const lockUntil = new Date(now.getTime() + OTP_LOCKOUT_MS).toISOString();
      await supabase
        .from('otp_challenges')
        .update({ locked_until: lockUntil })
        .eq('id', challenge.id);
      return res.status(400).json(INVALID_CODE_ERROR);
    }

    const codeMatches = verifyOtpCodeConstantTime(body.code, challenge.code_hash);
    if (!codeMatches) {
      const nextAttempts = challenge.attempts + 1;
      const lockUntil = nextAttempts >= OTP_MAX_ATTEMPTS
        ? new Date(now.getTime() + OTP_LOCKOUT_MS).toISOString()
        : null;

      await supabase
        .from('otp_challenges')
        .update({
          attempts: nextAttempts,
          locked_until: lockUntil,
        })
        .eq('id', challenge.id);

      return res.status(400).json(INVALID_CODE_ERROR);
    }

    const currentPhone = await getProfilePhone(user.id);
    if (currentPhone && currentPhone !== phoneE164) {
      return res.status(409).json(PHONE_MISMATCH_ERROR);
    }

    await supabase
      .from('otp_challenges')
      .update({ expires_at: now.toISOString() })
      .eq('id', challenge.id);

    await setProfilePhoneVerified(user.id, phoneE164);

    return res.json({ ok: true, phoneE164, phoneRequired: false });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(INVALID_CODE_ERROR);
    }
    console.error('[auth] phone/verify failed:', error);
    return res.status(400).json(INVALID_CODE_ERROR);
  }
});

export default router;
