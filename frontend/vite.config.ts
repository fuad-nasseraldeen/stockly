import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Load env vars
  const env = loadEnv(mode, process.cwd(), '');
  const pdfServiceUrl = env.VITE_PDF_SERVICE_URL || '';

  return {
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    // Ensure process is not defined in browser context
    'process.env': '{}',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/pdf-proxy': {
        target: pdfServiceUrl,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pdf-proxy/, ''),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (_proxyReq, req, _res) => {
            // Log the request for debugging
            if (process.env.NODE_ENV !== 'production') {
              console.log('[Vite Proxy] Proxying PDF request:', {
                method: req.method,
                url: req.url,
                target: pdfServiceUrl,
                headers: Object.keys(req.headers),
              });
            }
          });
          proxy.on('error', (err, _req, _res) => {
            console.error('[Vite Proxy] PDF proxy error:', err);
          });
        },
      },
    },
  },
  };
});
