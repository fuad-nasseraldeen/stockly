# Performance Debugging Guide for GET /api/products

## Overview

This guide explains how to use the performance instrumentation added to the `/api/products` endpoint to diagnose slow response times.

## Setup

### 1. Enable Performance Logging

Set the `PERF_DEBUG` environment variable to enable detailed timing logs:

```bash
# In your .env file or when starting the server
PERF_DEBUG=1 npm start

# Or export it before running
export PERF_DEBUG=1
npm start
```

#### Windows PowerShell (`pwsh`)

```powershell
cd backend
$env:PERF_DEBUG = "1"
npm start
```

### 2. Run the Test Script

#### Option A: Node.js Script (Recommended)

```bash
# Set your credentials
export PERF_AUTH_TOKEN="your_jwt_token_here"
export PERF_TENANT_ID="your_tenant_uuid_here"

# Run the test
node test-products-perf.js

# Or pass as arguments
node test-products-perf.js "your_jwt_token" "your_tenant_uuid"
```

#### Windows PowerShell (`pwsh`) for the Node script

```powershell
cd backend
$env:PERF_AUTH_TOKEN = "your_jwt_token_here"
$env:PERF_TENANT_ID = "your_tenant_uuid_here"
node .\test-products-perf.js

# Or pass as arguments
node .\test-products-perf.js "your_jwt_token_here" "your_tenant_uuid_here"
```

#### Option B: Bash Script

```bash
chmod +x test-products-perf.sh
./test-products-perf.sh "your_jwt_token" "your_tenant_uuid"
```

#### Option B (Windows): PowerShell script

```powershell
cd backend
.\test-products-perf.ps1 -AuthToken "your_jwt_token_here" -TenantId "your_tenant_uuid_here"
```

#### Option C: Manual curl

```bash
curl -w "\nTime: %{time_total}s\n" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  "http://localhost:3001/api/products?sort=updated_desc&all=true"
```

#### Option C (Windows PowerShell): Manual curl

PowerShell `curl` is an alias for `Invoke-WebRequest`, so use this:

```powershell
Invoke-WebRequest `
  -Uri "http://localhost:3001/api/products?sort=updated_desc&all=true" `
  -Headers @{ Authorization = "Bearer YOUR_TOKEN"; "x-tenant-id" = "YOUR_TENANT_ID" } `
  -Method GET
```

## Understanding the Logs

### Log Format

Each log line follows this pattern:
```
[PERF <correlation-id>] <step-name>: <duration>ms | <metadata>
```

### Key Metrics

1. **`auth_tenant_resolution`** - Time spent in middleware (auth + tenant validation)
   - Should be < 100ms typically
   - If high: JWT validation or Supabase membership check is slow

2. **`query_building`** - Time to parse query params and build request
   - Should be < 5ms
   - If high: Check query parsing logic

3. **`supabase_rpc_call`** - Time for the main RPC call (`products_list_page`)
   - This is the **primary bottleneck** if slow
   - If ~2700ms: Supabase/RLS/HTTP latency issue
   - Check: Database indexes, RLS policies, network latency to Supabase

4. **`supabase_query_products`** - Time to fetch product details
   - Should be < 200ms for typical page sizes
   - If high: Check indexes on `products` table

5. **`supabase_query_prices`** - Time to fetch prices
   - Should be < 300ms
   - If high: Check indexes on `product_supplier_current_price` table

6. **`supabase_query_suppliers`** - Time to fetch supplier names
   - Should be < 100ms
   - If high: Check indexes on `suppliers` table

7. **`supabase_query_summaries`** - Time to fetch price summaries
   - Should be < 100ms
   - If high: Check indexes on `product_price_summary` table

8. **`extra_queries_total`** - Total time for all additional queries
   - Shows query count and average time per query
   - If high: Potential N+1 pattern (but current code uses batch queries)

9. **`transform_mapping`** - Time to transform/map data structures
   - Should be < 50ms for typical datasets
   - If high: Check transformation logic (loops, sorting)

10. **`json_serialization`** - Time to serialize response to JSON
    - Should be < 100ms for typical datasets
    - If high: Response payload is very large (check `jsonSizeKB`)

11. **`TOTAL_ENDPOINT_TIME`** - Total time from request start to response
    - This should match your browser's TTFB
    - Sum of all above steps

### Example Log Output

```
[PERF a1b2c3d4] ===== GET /api/products START =====
[PERF a1b2c3d4] auth_tenant_resolution: 45.23ms | tenantId=xxx
[PERF a1b2c3d4] query_building: 2.15ms | all=true, page=1, pageSize=10000
[PERF a1b2c3d4] supabase_rpc_call: 2450.67ms | resultCount=176, error=no
[PERF a1b2c3d4] supabase_query_products: 120.45ms | productIdsCount=176, productsReturned=176
[PERF a1b2c3d4] supabase_query_prices: 180.23ms | priceRowsReturned=450
[PERF a1b2c3d4] supabase_query_suppliers: 45.12ms | supplierIdsCount=12, suppliersReturned=12
[PERF a1b2c3d4] supabase_query_summaries: 35.67ms | summariesReturned=176
[PERF a1b2c3d4] extra_queries_total: 381.47ms | queryCount=4, avgQueryTime=95.37
[PERF a1b2c3d4] transform_mapping: 25.34ms | resultCount=176, productsProcessed=176
[PERF a1b2c3d4] json_serialization: 85.12ms | jsonSizeBytes=245678, jsonSizeKB=239.92
[PERF a1b2c3d4] TOTAL_ENDPOINT_TIME: 3010.23ms | resultCount=176, totalProducts=176
[PERF a1b2c3d4] ===== GET /api/products END =====
```

### Interpreting Results

#### If `supabase_rpc_call` is ~2700ms:
- **Problem**: Supabase/RLS/HTTP latency
- **Solutions**:
  - Check database indexes on `products` table (especially `name_norm`, `tenant_id`, `is_active`)
  - Review RLS policies for performance
  - Check network latency to Supabase (use `ping` or `traceroute`)
  - Consider connection pooling if using Supabase client
  - Check if RPC function `products_list_page` is optimized

#### If `transform_mapping` or `json_serialization` is large:
- **Problem**: Server-side processing/serialization
- **Solutions**:
  - Reduce response payload size (fewer fields, pagination)
  - Optimize transformation loops
  - Consider streaming for very large responses

#### If `extra_queries_total` is large:
- **Problem**: Multiple queries or N+1 pattern
- **Solutions**:
  - Current code already batches queries (good!)
  - If still slow, check indexes on joined tables
  - Consider denormalizing frequently accessed data

#### If `auth_tenant_resolution` is large:
- **Problem**: JWT validation or membership check
- **Solutions**:
  - Check Supabase auth endpoint latency
  - Consider caching membership checks (with TTL)

## Cold Start vs Consistent Slowness

Run the test script 3 times and compare:

- **Cold start (first run slower)**: Database connection pooling, query plan caching
- **Consistent slowness (all runs similar)**: Actual performance bottleneck

## N+1 Detection

The instrumentation tracks:
- Number of extra queries (`queryCount`)
- Average query time (`avgQueryTime`)

If you see:
- `queryCount` > 5 for a single request → Potential N+1
- `avgQueryTime` very high → Individual queries are slow (check indexes)

Current implementation uses batch queries (`.in()` clauses), so N+1 should not occur.

## Disabling Logs

To disable performance logs, simply don't set `PERF_DEBUG` or set it to `0`:

```bash
PERF_DEBUG=0 npm start
# or just
npm start
```

## Troubleshooting

### Logs not appearing?
- Check `PERF_DEBUG=1` is set
- Check server console (not browser console)
- Verify correlation ID appears in all log lines

### Correlation ID not matching?
- Each request gets a unique 8-character correlation ID
- All log lines for one request share the same ID
- If IDs are mixed, check for concurrent requests

### Timings don't add up?
- Some overlap may occur (e.g., auth happens before handler starts)
- `TOTAL_ENDPOINT_TIME` includes all overhead
- Individual step times are measured independently
