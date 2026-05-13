function maskKeyPrefix(value: string): string {
  const v = (value || '').trim();
  if (!v) return 'missing';
  const prefix = v.startsWith('sk_live_') ? 'sk_live' : v.startsWith('sk_test_') ? 'sk_test' : 'unknown';
  return `${prefix}***`;
}

function getAppUrl(): string {
  const appUrl = (process.env.APP_URL || process.env.FRONTEND_URL || '').trim();
  if (!appUrl) {
    throw new Error('APP_URL (or FRONTEND_URL) is required for Stripe redirects');
  }
  return appUrl.replace(/\/+$/, '');
}

export function getStripeWebhookSecret(): string {
  const secret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is missing');
  return secret;
}

export function validateStripeConfig(options?: { requireWebhookSecret?: boolean }): void {
  const requireWebhookSecret = options?.requireWebhookSecret ?? false;
  const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  const monthlyPrice = (process.env.STRIPE_PRICE_MONTHLY_199 || '').trim();
  const annualPrice = (process.env.STRIPE_PRICE_ANNUAL_149 || process.env.STRIPE_PRICE_ANNUAL_49 || '').trim();

  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is missing');
  if (!monthlyPrice) throw new Error('STRIPE_PRICE_MONTHLY_199 is missing');
  if (!annualPrice) throw new Error('STRIPE_PRICE_ANNUAL_149 (or STRIPE_PRICE_ANNUAL_49) is missing');
  getAppUrl();
  if (requireWebhookSecret) getStripeWebhookSecret();

  // Safe log: never print full secrets.
  console.info(`[stripe-config] key=${maskKeyPrefix(secretKey)} app_url_set=true webhook_secret=${requireWebhookSecret ? 'required' : 'optional'}`);
}

export function resolveStripeAppUrl(): string {
  return getAppUrl();
}

