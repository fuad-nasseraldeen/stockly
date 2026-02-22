import { createApp } from '../src/_app.js';

// חשוב: ב-Vercel יהיו גם Preview URLs, לכן אל תסתמך רק על FRONTEND_URL קשיח
const allowed = new Set([
  process.env.FRONTEND_URL || 'http://localhost:5173',
]);

app.use(cors({
  origin(origin, cb) {
    // requests בלי Origin (למשל health checks)
    if (!origin) return cb(null, true);

    // Allow exact FRONTEND_URL
    if (allowed.has(origin)) return cb(null, true);

export default app;

// Explicitly set runtime to Node.js (Vercel will use this)
export const config = {
  runtime: 'nodejs',
};
