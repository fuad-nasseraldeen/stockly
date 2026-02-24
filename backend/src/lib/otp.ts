import crypto from 'node:crypto';

function getOtpSecret(): string {
  const secret = process.env.OTP_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('OTP_SECRET is required and must be at least 16 characters');
  }
  return secret;
}

export function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashOtpCode(code: string): string {
  return crypto
    .createHmac('sha256', getOtpSecret())
    .update(code)
    .digest('hex');
}

export function verifyOtpCodeConstantTime(code: string, expectedHash: string): boolean {
  const actualHash = hashOtpCode(code);
  const actualBuf = Buffer.from(actualHash, 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');

  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export function derivePhoneOtpPassword(phoneE164: string): string {
  // Deterministic server-side password allows server-only OTP flow
  // to bootstrap a standard Supabase session after verification.
  const digest = crypto
    .createHmac('sha256', getOtpSecret())
    .update(`phone:${phoneE164}`)
    .digest('base64url');

  return `PhoneOtp#${digest.slice(0, 32)}`;
}

export function derivePhoneOtpEmail(phoneE164: string): string {
  const digest = crypto
    .createHmac('sha256', getOtpSecret())
    .update(`phone-email:${phoneE164}`)
    .digest('hex');

  return `phone-${digest.slice(0, 32)}@phone.stockly.local`;
}
