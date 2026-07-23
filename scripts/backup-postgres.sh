#!/usr/bin/env bash
set -euo pipefail

backup_dir="/home/ubuntu/backups/aigc-postgres"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$backup_dir/aigc-$timestamp.sql.gz"

umask 077
mkdir -p "$backup_dir"
docker exec aigc-postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -9 > "$backup_file"
set -a
source /home/ubuntu/project/AIGC_web/.env.production
set +a
node /home/ubuntu/project/AIGC_web/scripts/upload-postgres-backup.mjs "$backup_file"
find "$backup_dir" -type f -name 'aigc-*.sql.gz' -mtime +14 -delete
echo "PostgreSQL backup created and uploaded: $backup_file"
