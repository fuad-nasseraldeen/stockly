import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = join(__dirname, '../.env');
const result = dotenv.config({ path: envPath });
if (result.error && !existsSync(envPath)) dotenv.config();

import { createApp } from './_app.js';
import { validateStripeConfig } from './lib/stripe-config.js';

const app = createApp();
const PORT = process.env.PORT || 3001;

const strictStripeConfig = (process.env.NODE_ENV === 'production');
try {
  validateStripeConfig({ requireWebhookSecret: strictStripeConfig });
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  if (strictStripeConfig) {
    throw new Error(`Stripe configuration invalid: ${msg}`);
  }
  console.warn(`[stripe-config] warning: ${msg}`);
}

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
});
