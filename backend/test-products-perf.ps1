$ErrorActionPreference = "Stop"

param(
  [Parameter(Mandatory=$true)][string]$AuthToken,
  [Parameter(Mandatory=$true)][string]$TenantId,
  [string]$ApiUrl = "http://localhost:3001"
)

$endpoint = "/api/products?sort=updated_desc&all=true"
$url = "$ApiUrl$endpoint"

Write-Host "=========================================="
Write-Host "Products API Performance Test (3 runs)"
Write-Host "=========================================="
Write-Host "API URL: $ApiUrl"
Write-Host "Endpoint: $endpoint"
Write-Host ""

for ($i = 1; $i -le 3; $i++) {
  Write-Host "--- Run $i ---"
  $sw = [System.Diagnostics.Stopwatch]::StartNew()

  try {
    $resp = Invoke-WebRequest -Uri $url -Method GET -Headers @{
      Authorization = "Bearer $AuthToken"
      "x-tenant-id" = $TenantId
    } -TimeoutSec 30

    $sw.Stop()
    $bytes = ($resp.Content | Measure-Object -Character).Characters
    Write-Host ("HTTP Status: {0}" -f $resp.StatusCode)
    Write-Host ("Total Time: {0}ms" -f $sw.ElapsedMilliseconds)
    Write-Host ("Response Size: {0} KB" -f ([math]::Round($bytes / 1024, 2)))
  }
  catch {
    $sw.Stop()
    Write-Host ("Run $i failed: {0}" -f $_.Exception.Message)
  }

  Write-Host ""
  Start-Sleep -Milliseconds 500
}

Write-Host "=========================================="
Write-Host "Test complete. Check server logs (with PERF_DEBUG=1) for detailed timing breakdown."
Write-Host "=========================================="

