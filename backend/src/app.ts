// backend/src/app.ts
import express from 'express';
import cors from 'cors';

import productsRouter from './routes/products.js';
import { requireAuth } from './middleware/auth.js';
import categoriesRouter from './routes/categories.js';
import suppliersRouter from './routes/suppliers.js';
import settingsRouter from './routes/settings.js';

export function createApp() {
  const app = express();

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

      // Allow Vercel preview domains (אם תרצה להגביל יותר—אפשר)
      if (origin.endsWith('.vercel.app')) return cb(null, true);

      return cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true
  }));

  app.use(express.json());

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // API Routes
  app.use('/api/products', requireAuth, productsRouter);
  app.use('/api/categories', requireAuth, categoriesRouter);
  app.use('/api/suppliers', requireAuth, suppliersRouter);
  app.use('/api/settings', requireAuth, settingsRouter);

  return app;
}
