import { createApp } from '../src/app.js';

const app = createApp();

// Vercel will call this as a function (req,res)
export default function handler(req: any, res: any) {
  return app(req, res);
}
