// Minimal entrypoint for Vercel framework detection
// This file is not actually used - the serverless function in api/index.ts handles all requests
import express from 'express';

const app = express();

// This is just to satisfy Vercel's framework detection
// All actual routing is handled by api/index.ts
export default app;
