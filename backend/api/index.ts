import express from 'express';
import cors from 'cors';
import productsRouter from '../src/routes/products.js';
import categoriesRouter from '../src/routes/categories.js';
import suppliersRouter from '../src/routes/suppliers.js';
import settingsRouter from '../src/routes/settings.js';
import tenantsRouter from '../src/routes/tenants.js';
import invitesRouter from '../src/routes/invites.js';
import importRouter from '../src/routes/import.js';
import exportRouter from '../src/routes/export.js';
import resetRouter from '../src/routes/reset.js';
import adminRouter from '../src/routes/admin.js';

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

// Vercel Serverless Function handler
// Export the Express app directly - Vercel will handle it as a serverless function
export default app;
