#!/usr/bin/env node
import { performance } from 'perf_hooks';

const AUTH_TOKEN = process.env.PERF_AUTH_TOKEN || process.argv[2];
const TENANT_ID = process.env.PERF_TENANT_ID || process.argv[3];
const API_URL = process.env.API_URL || 'http://localhost:3001';
const ENDPOINT = process.env.ENDPOINT || '/api/products?sort=updated_desc&all=true';

if (!AUTH_TOKEN || !TENANT_ID) {
  console.error('ERROR: Please provide AUTH_TOKEN and TENANT_ID');
  console.error('Usage: node test-products-perf.js <AUTH_TOKEN> <TENANT_ID>');
  console.error('Or: PERF_AUTH_TOKEN=... PERF_TENANT_ID=... node test-products-perf.js');
  process.exit(1);
}

async function makeRequest(runNumber) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  const start = performance.now();
  try {
    const res = await fetch(`${API_URL}${ENDPOINT}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        'x-tenant-id': TENANT_ID,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    const tRead0 = performance.now();
    const text = await res.text(); // includes transfer + server streaming delay
    const readMs = performance.now() - tRead0;

    const elapsed = performance.now() - start;

    return {
      runNumber,
      statusCode: res.status,
      elapsedMs: Math.round(elapsed),
      readMs: Math.round(readMs),
      dataSizeBytes: text.length,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runTests() {
  console.log('==========================================');
  console.log('Products API Performance Test (3 runs)');
  console.log('==========================================');
  console.log(`API URL: ${API_URL}`);
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log('');

  const results = [];

  for (let i = 1; i <= 3; i++) {
    console.log(`--- Run ${i} ---`);
    try {
      const r = await makeRequest(i);
      results.push(r);
      console.log(`HTTP Status: ${r.statusCode}`);
      console.log(`Total Time: ${r.elapsedMs}ms`);
      console.log(`Body Read Time: ${r.readMs}ms`);
      console.log(`Response Size: ${(r.dataSizeBytes / 1024).toFixed(2)} KB`);
    } catch (err) {
      console.error(`Run ${i} failed:`, err?.name === 'AbortError' ? 'Request timeout' : err);
    }
    console.log('');
    if (i < 3) await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (results.length) {
    const times = results.map((r) => r.elapsedMs);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log('==========================================');
    console.log('Summary:');
    console.log(`  Runs: ${results.length}`);
    console.log(`  Min: ${Math.min(...times)}ms`);
    console.log(`  Max: ${Math.max(...times)}ms`);
    console.log(`  Avg: ${avg.toFixed(2)}ms`);
    console.log('==========================================');
  }
}

runTests().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
