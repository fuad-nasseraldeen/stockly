const redisUrl = (process.env.REDIS_URL || '').trim().replace(/\/+$/, '');
const redisToken = (process.env.REDIS_TOKEN || '').trim();

const inMemoryCounters = new Map<string, { count: number; expiresAtMs: number }>();

function canUseRedis(): boolean {
  return Boolean(redisUrl && redisToken);
}

function buildRedisKey(scope: string, identifier: string, windowMinutes: number): string {
  const bucket = Math.floor(Date.now() / (windowMinutes * 60_000));
  return `public-rate:${scope}:${identifier}:${bucket}`;
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
    console.error('[public-rate-limit] redis command failed:', response.status, body);
    return null;
  }

  const json = (await response.json().catch(() => null)) as { result?: T } | null;
  return (json?.result ?? null) as T | null;
}

function consumeInMemory(key: string, max: number, windowMinutes: number): boolean {
  const now = Date.now();
  const windowMs = windowMinutes * 60_000;
  const existing = inMemoryCounters.get(key);

  if (!existing || existing.expiresAtMs <= now) {
    inMemoryCounters.set(key, { count: 1, expiresAtMs: now + windowMs });
    return true;
  }

  if (existing.count >= max) {
    return false;
  }

  existing.count += 1;
  inMemoryCounters.set(key, existing);
  return true;
}

export async function consumePublicRateLimit(params: {
  scope: string;
  identifier: string;
  max: number;
  windowMinutes: number;
}): Promise<boolean> {
  if (!params.identifier) return true;

  if (canUseRedis()) {
    const key = buildRedisKey(params.scope, params.identifier, params.windowMinutes);
    const ttlSeconds = params.windowMinutes * 60 + 60;
    const current = await redisCommand<number>('incr', key);
    await redisCommand<number>('expire', key, ttlSeconds);
    if (current == null) {
      return false;
    }
    return current <= params.max;
  }

  const fallbackKey = `${params.scope}:${params.identifier}`;
  return consumeInMemory(fallbackKey, params.max, params.windowMinutes);
}
