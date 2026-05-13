const STRIPE_API_BASE = 'https://api.stripe.com/v1';

function assertStripePriceId(value: string, envName: string): string {
  const id = (value || '').trim();
  if (!id) throw new Error(`${envName} is missing`);
  if (id.startsWith('prod_')) {
    throw new Error(`${envName} must be a Stripe Price ID (price_...), not Product ID (prod_...)`);
  }
  if (!id.startsWith('price_')) {
    throw new Error(`${envName} must start with price_`);
  }
  return id;
}

function getStripeSecretKey(): string {
  const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is missing');
  return secretKey;
}

export async function stripePostForm<T>(path: string, form: Record<string, string>): Promise<T> {
  const body = new URLSearchParams(form);
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = (await response.json()) as any;
  if (!response.ok) {
    const msg = (data && data.error && data.error.message) || 'Stripe request failed';
    throw new Error(msg);
  }
  return data as T;
}

export async function stripeGet<T>(path: string): Promise<T> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
    },
  });
  const data = (await response.json()) as any;
  if (!response.ok) {
    const msg = (data && data.error && data.error.message) || 'Stripe request failed';
    throw new Error(msg);
  }
  return data as T;
}

export function getStripePriceIdForPlan(planName: string): string {
  if (planName === 'monthly_199') {
    return assertStripePriceId(process.env.STRIPE_PRICE_MONTHLY_199 || '', 'STRIPE_PRICE_MONTHLY_199');
  }
  if (planName === 'annual_49') {
    // Backward compatible: support both env names while teams align on one key.
    return assertStripePriceId(
      process.env.STRIPE_PRICE_ANNUAL_149 || process.env.STRIPE_PRICE_ANNUAL_49 || '',
      'STRIPE_PRICE_ANNUAL_149 (or STRIPE_PRICE_ANNUAL_49)',
    );
  }
  throw new Error('Unsupported paid plan');
}
