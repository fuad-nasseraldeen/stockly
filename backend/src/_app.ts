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
import bootstrapRouter from './routes/bootstrap.js';
import authRouter from './routes/auth.js';
import publicRouter from './routes/public.js';
import supportRouter from './routes/support.js';

let hasLoggedDbHost = false;

function parseHostFromUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;

  try {
    return new URL(rawUrl).host || null;
  } catch {
    return null;
  }
}

function getRuntimeDbHost(): { host: string; source: string } {
  const candidates: Array<{ source: string; value: string | undefined }> = [
    { source: 'DATABASE_URL', value: process.env.DATABASE_URL },
    { source: 'SUPABASE_DB_URL', value: process.env.SUPABASE_DB_URL },
    // Fallback: this is project URL (not direct Postgres host) but still identifies the project ref.
    { source: 'SUPABASE_URL', value: process.env.SUPABASE_URL },
  ];

  for (const candidate of candidates) {
    const host = parseHostFromUrl(candidate.value);
    if (host) {
      return { host, source: candidate.source };
    }
  }

  return { host: 'unknown', source: 'none' };
}

function logDbHostOnce(): void {
  if (hasLoggedDbHost) return;
  hasLoggedDbHost = true;

  const { host, source } = getRuntimeDbHost();
  console.info(`[runtime-db] host=${host} source=${source}`);
}

export function createApp() {
  const app = express();

  // חשוב: ב-Vercel יהיו גם Preview URLs, לכן אל תסתמך רק על FRONTEND_URL קשיח
  const allowed = new Set([
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'https://stockly-il.com',
    'https://www.stockly-il.com',
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

  app.get('/health', (req, res) => {
    logDbHostOnce();
    res.json({ status: 'ok' });
  });

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
  app.use('/api/bootstrap', bootstrapRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/support', supportRouter);

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
