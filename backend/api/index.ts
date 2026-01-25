import express from 'express';
import cors from 'cors';
import productsRouter from '../src/routes/products.js';
import { requireAuth } from '../src/middleware/auth.js';
import categoriesRouter from '../src/routes/categories.js';
import suppliersRouter from '../src/routes/suppliers.js';
import settingsRouter from '../src/routes/settings.js';

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
app.use('/api/products', requireAuth, productsRouter);
app.use('/api/categories', requireAuth, categoriesRouter);
app.use('/api/suppliers', requireAuth, suppliersRouter);
app.use('/api/settings', requireAuth, settingsRouter);

// Vercel Serverless Function handler
// Export the Express app directly - Vercel will handle it as a serverless function
export default app;
