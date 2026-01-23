import { createApp } from '../src/app.js';

const app = createApp();

// Vercel Serverless Function handler
// Export the Express app directly - Vercel will handle it as a serverless function
export default app;
