import { createApp } from '../src/app.js';
const app = createApp();
// Vercel Serverless Function handler
export default async function handler(req, res) {
    return app(req, res);
}
//# sourceMappingURL=index.js.map