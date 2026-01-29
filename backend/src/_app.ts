// backend/src/_app.ts
import express from 'express';
import cors from 'cors';

import productsRouter from './routes/products.js';
import categoriesRouter from './routes/categories.js';
import suppliersRouter from './routes/suppliers.js';
import settingsRouter from './routes/settings.js';
import tenantsRouter from './routes/tenants.js';
import invitesRouter from './routes/invites.js';
import importRouter from './routes/import.js';
import exportRouter from './routes/export.js';
import resetRouter from './routes/reset.js';
import adminRouter from './routes/admin.js';

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

  app.get('/', (req, res) => res.json({ 
    message: 'Stockly API',
    status: 'ok',
    version: '1.0.0'
  }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // API Routes
  app.use('/api/tenants', tenantsRouter);
  app.use('/api/invites', invitesRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/suppliers', suppliersRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/import', importRouter);
  app.use('/api/export', exportRouter);
  app.use('/api/tenant/reset', resetRouter);
  app.use('/api/admin', adminRouter);

  // 404 handler for undefined routes
  app.use((req, res) => {
    res.status(404).json({ 
      error: `Route not found: ${req.method} ${req.path}`,
      availableRoutes: [
        'GET /',
        'GET /health',
        'GET /api/tenants',
        'POST /api/tenants',
        'POST /api/invites/accept',
        'GET /api/products',
        'GET /api/categories',
        'GET /api/suppliers',
        'GET /api/settings',
      ]
    });
  });

  return app;
}
