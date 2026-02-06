#!/bin/bash

# Performance test script for GET /api/products
# Usage: ./test-products-perf.sh [AUTH_TOKEN] [TENANT_ID]

AUTH_TOKEN="${1:-YOUR_AUTH_TOKEN_HERE}"
TENANT_ID="${2:-YOUR_TENANT_ID_HERE}"
API_URL="${API_URL:-http://localhost:3001}"

echo "=========================================="
echo "Products API Performance Test (3 runs)"
echo "=========================================="
echo "API URL: $API_URL"
echo "Testing: GET /api/products?sort=updated_desc&all=true"
echo ""

for i in 1 2 3; do
  echo "--- Run $i ---"
  echo "Request start: $(date +%H:%M:%S.%3N)"
  
  START_TIME=$(date +%s%3N)
  
  curl -s -w "\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "x-tenant-id: $TENANT_ID" \
    "$API_URL/api/products?sort=updated_desc&all=true" \
    > /dev/null
  
  END_TIME=$(date +%s%3N)
  ELAPSED=$((END_TIME - START_TIME))
  
  echo "Total elapsed: ${ELAPSED}ms"
  echo ""
  
  # Small delay between requests
  sleep 0.5
done

echo "=========================================="
echo "Test complete. Check server logs for detailed timing breakdown."
echo "=========================================="
