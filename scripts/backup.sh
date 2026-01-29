#!/bin/bash

# Database Backup Script
# This script can be run manually or scheduled via cron

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.sql"
COMPRESSED_FILE="${BACKUP_FILE}.gz"
RETENTION_DAYS=30

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}Error: DATABASE_URL environment variable is not set${NC}"
    echo "Please set it in your .env file or export it:"
    echo "export DATABASE_URL='postgresql://user:password@host:5432/database'"
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo -e "${GREEN}Starting database backup...${NC}"
echo "Backup file: $BACKUP_FILE"

# Run pg_dump
if pg_dump "$DATABASE_URL" > "$BACKUP_FILE"; then
    echo -e "${GREEN}✓ Database dump created successfully${NC}"
    
    # Get file size
    FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "File size: $FILE_SIZE"
    
    # Compress the backup
    echo "Compressing backup..."
    if gzip "$BACKUP_FILE"; then
        echo -e "${GREEN}✓ Backup compressed successfully${NC}"
        COMPRESSED_SIZE=$(du -h "$COMPRESSED_FILE" | cut -f1)
        echo "Compressed size: $COMPRESSED_SIZE"
    else
        echo -e "${RED}✗ Compression failed${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ Database dump failed${NC}"
    exit 1
fi

# Cleanup old backups (keep last 30 days)
echo "Cleaning up old backups (keeping last $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo -e "${GREEN}✓ Cleanup completed${NC}"

# List remaining backups
echo ""
echo -e "${YELLOW}Remaining backups:${NC}"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "No backups found"

echo ""
echo -e "${GREEN}✅ Backup completed successfully!${NC}"
echo "Backup file: $COMPRESSED_FILE"
