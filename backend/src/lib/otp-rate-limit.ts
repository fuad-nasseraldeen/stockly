import { supabase } from './supabase.js';

const OTP_PURPOSE = 'login';

type LimitWindow = {
  max: number;
  minutes: number;
};

const RATE_LIMITS = {
  ip: { max: 10, minutes: 10 } satisfies LimitWindow,
  phone: { max: 3, minutes: 15 } satisfies LimitWindow,
  dailyPhoneSends: { max: 10, minutes: 24 * 60 } satisfies LimitWindow,
};

const redisUrl = (process.env.REDIS_URL || '').trim().replace(/\/+$/, '');
const redisToken = (process.env.REDIS_TOKEN || '').trim();

function canUseRedis(): boolean {
  return Boolean(redisUrl && redisToken);
}

function currentBucket(windowMinutes: number): number {
  return Math.floor(Date.now() / (windowMinutes * 60_000));
}

function buildRedisKey(kind: 'ip' | 'phone' | 'phone-send', key: string, windowMinutes: number): string {
  return `otp:${kind}:${key}:${currentBucket(windowMinutes)}`;
}

async function redisCommand<T = unknown>(...parts: Array<string | number>): Promise<T | null> {
  if (!canUseRedis()) return null;

  const path = parts.map((part) => encodeURIComponent(String(part))).join('/');
  const response = await fetch(`${redisUrl}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${redisToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('[otp-rate-limit] redis command failed:', response.status, body);
    return null;
  }

  const json = (await response.json().catch(() => null)) as { result?: T } | null;
  return (json?.result ?? null) as T | null;
}

async function redisGetCount(key: string): Promise<number | null> {
  const value = await redisCommand<string | null>('get', key);
  if (value == null) return 0;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : null;
}

async function redisIncrementWindowKey(key: string, windowMinutes: number): Promise<void> {
  const ttlSeconds = windowMinutes * 60 + 120;
  await redisCommand<number>('incr', key);
  await redisCommand<number>('expire', key, ttlSeconds);
}

function sinceIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

async function countLogs(params: {
  ipAddress?: string | null;
  phoneE164?: string | null;
  sentOnly?: boolean;
  windowMinutes: number;
}): Promise<number> {
  let query = supabase
    .from('otp_request_logs')
    .select('id', { count: 'exact', head: true })
    .eq('purpose', OTP_PURPOSE)
    .gte('created_at', sinceIso(params.windowMinutes));

  if (params.ipAddress) {
    query = query.eq('ip_address', params.ipAddress);
  }

  if (params.phoneE164) {
    query = query.eq('phone_e164', params.phoneE164);
  }

  if (params.sentOnly) {
    query = query.eq('sent', true);
  }

  const { count, error } = await query;
  if (error) {
    console.error('[otp-rate-limit] countLogs failed:', error);
    return Number.POSITIVE_INFINITY;
  }

  return count || 0;
}

export async function isOtpIpRateLimited(ipAddress: string | null): Promise<boolean> {
  if (!ipAddress) return false;

  if (canUseRedis()) {
    const key = buildRedisKey('ip', ipAddress, RATE_LIMITS.ip.minutes);
    const count = await redisGetCount(key);
    if (count == null) return true;
    return count >= RATE_LIMITS.ip.max;
  }

  const count = await countLogs({
    ipAddress,
    windowMinutes: RATE_LIMITS.ip.minutes,
  });
  return count >= RATE_LIMITS.ip.max;
}

export async function isOtpPhoneRateLimited(phoneE164: string): Promise<boolean> {
  if (canUseRedis()) {
    const key = buildRedisKey('phone', phoneE164, RATE_LIMITS.phone.minutes);
    const count = await redisGetCount(key);
    if (count == null) return true;
    return count >= RATE_LIMITS.phone.max;
  }

  const count = await countLogs({
    phoneE164,
    windowMinutes: RATE_LIMITS.phone.minutes,
  });
  return count >= RATE_LIMITS.phone.max;
}

export async function isOtpPhoneDailyCapReached(phoneE164: string): Promise<boolean> {
  if (canUseRedis()) {
    const key = buildRedisKey('phone-send', phoneE164, RATE_LIMITS.dailyPhoneSends.minutes);
    const count = await redisGetCount(key);
    if (count == null) return true;
    return count >= RATE_LIMITS.dailyPhoneSends.max;
  }

  const count = await countLogs({
    phoneE164,
    sentOnly: true,
    windowMinutes: RATE_LIMITS.dailyPhoneSends.minutes,
  });
  return count >= RATE_LIMITS.dailyPhoneSends.max;
}

export async function logOtpRequest(params: {
  phoneE164: string;
  ipAddress: string | null;
  sent: boolean;
}): Promise<void> {
  if (canUseRedis()) {
    if (params.ipAddress) {
      await redisIncrementWindowKey(
        buildRedisKey('ip', params.ipAddress, RATE_LIMITS.ip.minutes),
        RATE_LIMITS.ip.minutes
      );
    }

    await redisIncrementWindowKey(
      buildRedisKey('phone', params.phoneE164, RATE_LIMITS.phone.minutes),
      RATE_LIMITS.phone.minutes
    );

    if (params.sent) {
      await redisIncrementWindowKey(
        buildRedisKey('phone-send', params.phoneE164, RATE_LIMITS.dailyPhoneSends.minutes),
        RATE_LIMITS.dailyPhoneSends.minutes
      );
    }
  }

  const { error } = await supabase
    .from('otp_request_logs')
    .insert({
      phone_e164: params.phoneE164,
      purpose: OTP_PURPOSE,
      ip_address: params.ipAddress,
      sent: params.sent,
    });

  if (error) {
    console.error('[otp-rate-limit] logOtpRequest failed:', error);
  }
}
