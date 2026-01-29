# Database Backup Script for Windows PowerShell
# This script can be run manually or scheduled via Task Scheduler

param(
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [string]$BackupDir = ".\backups",
    [int]$RetentionDays = 30
)

# Check if DATABASE_URL is set
if ([string]::IsNullOrEmpty($DatabaseUrl)) {
    Write-Host "Error: DATABASE_URL environment variable is not set" -ForegroundColor Red
    Write-Host "Please set it in your .env file or export it:"
    Write-Host 'export DATABASE_URL="postgresql://user:password@host:5432/database"'
    exit 1
}

# Create backup directory if it doesn't exist
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

# Generate timestamp
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = Join-Path $BackupDir "backup_$Timestamp.sql"
$CompressedFile = "$BackupFile.gz"

Write-Host "Starting database backup..." -ForegroundColor Green
Write-Host "Backup file: $BackupFile"

# Check if pg_dump is available
$pgDumpPath = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDumpPath) {
    Write-Host "Error: pg_dump not found. Please install PostgreSQL client tools." -ForegroundColor Red
    Write-Host "Download from: https://www.postgresql.org/download/windows/"
    exit 1
}

# Run pg_dump
try {
    & pg_dump $DatabaseUrl | Out-File -FilePath $BackupFile -Encoding UTF8
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Database dump created successfully" -ForegroundColor Green
        
        $FileSize = (Get-Item $BackupFile).Length / 1MB
        Write-Host "File size: $([math]::Round($FileSize, 2)) MB"
        
        # Compress the backup using .NET compression
        Write-Host "Compressing backup..."
        $InputFile = [System.IO.File]::OpenRead($BackupFile)
        $OutputFile = [System.IO.File]::Create($CompressedFile)
        $GZipStream = New-Object System.IO.Compression.GZipStream($OutputFile, [System.IO.Compression.CompressionMode]::Compress)
        
        $InputFile.CopyTo($GZipStream)
        $GZipStream.Close()
        $InputFile.Close()
        $OutputFile.Close()
        
        Write-Host "✓ Backup compressed successfully" -ForegroundColor Green
        $CompressedSize = (Get-Item $CompressedFile).Length / 1MB
        Write-Host "Compressed size: $([math]::Round($CompressedSize, 2)) MB"
        
        # Delete uncompressed file
        Remove-Item $BackupFile
    } else {
        Write-Host "✗ Database dump failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}

# Cleanup old backups (keep last 30 days)
Write-Host "Cleaning up old backups (keeping last $RetentionDays days)..."
$CutoffDate = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $BackupDir -Filter "backup_*.sql.gz" | 
    Where-Object { $_.LastWriteTime -lt $CutoffDate } | 
    Remove-Item

Write-Host "✓ Cleanup completed" -ForegroundColor Green

# List remaining backups
Write-Host ""
Write-Host "Remaining backups:" -ForegroundColor Yellow
Get-ChildItem -Path $BackupDir -Filter "backup_*.sql.gz" | 
    Select-Object Name, @{Name="Size(MB)";Expression={[math]::Round($_.Length/1MB, 2)}}, LastWriteTime | 
    Format-Table -AutoSize

Write-Host ""
Write-Host "✅ Backup completed successfully!" -ForegroundColor Green
Write-Host "Backup file: $CompressedFile"
