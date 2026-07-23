#!/usr/bin/env bash
set -euo pipefail

backup_dir="/home/ubuntu/backups/aigc-postgres"
backup_file="${1:-$(find "$backup_dir" -type f -name 'aigc-*.sql.gz' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)}"
[[ -n "$backup_file" && -f "$backup_file" ]] || { echo "No PostgreSQL backup file found" >&2; exit 1; }
set -a
source /home/ubuntu/project/AIGC_web/.env.production
set +a

restore_db="aigc_restore_check_$(date +%s)_$RANDOM"
cleanup() {
  docker exec aigc-postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$1"' sh "$restore_db" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker exec aigc-postgres sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$restore_db"
gzip -cd "$backup_file" | docker exec -i aigc-postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1"' sh "$restore_db" >/dev/null
table_count="$(docker exec aigc-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$1" -At -c "$2"' sh "$restore_db" "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")"
[[ "$table_count" -gt 0 ]] || { echo "Restore completed but public schema is empty" >&2; exit 1; }
node /home/ubuntu/project/AIGC_web/scripts/record-operation.mjs POSTGRES_RESTORE_VERIFY SUCCEEDED "$(basename "$backup_file") restored to temporary database; tables=$table_count"
echo "PostgreSQL restore verification passed: backup=$backup_file tables=$table_count"
