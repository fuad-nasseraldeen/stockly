import { createRemoteJWKSet, jwtVerify } from 'jose';

type VerifiedAccessToken = {
  sub: string;
  email?: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __stocklyJwks:
    | ReturnType<typeof createRemoteJWKSet>
    | undefined;
}

function getSupabaseIssuer(): string {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required in environment variables');
  }
  return `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
}

function getJwtAudience(): string {
  return process.env.SUPABASE_JWT_AUDIENCE || 'authenticated';
}

function getJwks() {
  if (!globalThis.__stocklyJwks) {
    const jwksUrl = new URL(`${getSupabaseIssuer()}/.well-known/jwks.json`);
    globalThis.__stocklyJwks = createRemoteJWKSet(jwksUrl);
  }

  return globalThis.__stocklyJwks;
}

export async function verifyAccessToken(token: string): Promise<VerifiedAccessToken | null> {
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: getSupabaseIssuer(),
      audience: getJwtAudience(),
    });

    if (!payload.sub || typeof payload.sub !== 'string') {
      return null;
    }

    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
    };
  } catch {
    return null;
  }
}
