import { createApp } from '../src/_app.js';

const app = createApp();

export default app;

// Explicitly set runtime to Node.js (Vercel will use this)
export const config = {
  runtime: 'nodejs',
};
