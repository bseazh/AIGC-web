#!/usr/bin/env bash
set -euo pipefail

cd /home/ubuntu/project/AIGC_web

if [[ -f .env.production ]]; then
  set -a
  source .env.production
  set +a
fi

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

mkdir -p data/postgres data/redis

if ! docker network inspect aigc-network >/dev/null 2>&1; then
  docker network create aigc-network >/dev/null
fi

if ! docker container inspect aigc-postgres >/dev/null 2>&1; then
  docker run -d \
    --name aigc-postgres \
    --restart unless-stopped \
    --network aigc-network \
    -p 127.0.0.1:5432:5432 \
    -e POSTGRES_USER=aigc \
    -e POSTGRES_DB=aigc \
    -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    -v /home/ubuntu/project/AIGC_web/data/postgres:/var/lib/postgresql/data \
    postgres:16-alpine >/dev/null
else
  docker start aigc-postgres >/dev/null
fi

if ! docker container inspect aigc-redis >/dev/null 2>&1; then
  docker run -d \
    --name aigc-redis \
    --restart unless-stopped \
    --network aigc-network \
    -p 127.0.0.1:6379:6379 \
    -v /home/ubuntu/project/AIGC_web/data/redis:/data \
    redis:7-alpine redis-server --appendonly yes >/dev/null
else
  docker start aigc-redis >/dev/null
fi

for attempt in {1..30}; do
  if docker exec aigc-postgres pg_isready -U aigc -d aigc >/dev/null 2>&1 && docker exec aigc-redis redis-cli ping | grep -q PONG; then
    exit 0
  fi
  sleep 1
done

echo "Infrastructure did not become healthy" >&2
exit 1
