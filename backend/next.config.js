/** @type {import('next').NextConfig} */
const nextConfig = {
  // For Express serverless functions on Vercel, we use outputFileTracingIncludes
  // to ensure @sparticuz/chromium-min binary is included in the bundle
  experimental: {
    outputFileTracingIncludes: {
      '/api/**': [
        './node_modules/@sparticuz/chromium-min/**',
        './node_modules/puppeteer-core/**',
      ],
    },
  },
};

module.exports = nextConfig;
