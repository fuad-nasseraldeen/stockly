# Production Stripe Checklist

1. Use live secret key in production only:
- `STRIPE_SECRET_KEY=sk_live_...`

2. Use live price IDs only:
- `STRIPE_PRICE_MONTHLY_199=price_...`
- `STRIPE_PRICE_ANNUAL_149=price_...` (or `STRIPE_PRICE_ANNUAL_49`)

3. Configure webhook endpoint in Stripe Dashboard (Live mode):
- `POST https://<your-api-domain>/api/subscription/webhook`
- Events:
  - `checkout.session.completed`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

4. Set webhook secret from live endpoint:
- `STRIPE_WEBHOOK_SECRET=whsec_...`

5. Ensure production frontend URL is HTTPS:
- `APP_URL=https://<your-frontend-domain>` (or `FRONTEND_URL`)

6. Perform one real payment test with a small real charge.

7. Monitor:
- backend logs for webhook failures/signature errors
- Stripe Dashboard > Webhooks > Failed events / retries

8. Security reminder:
- Never expose `STRIPE_SECRET_KEY` in frontend or client bundles.
- Rotate keys if exposed accidentally.

