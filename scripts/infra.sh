#!/usr/bin/env bash
set -euo pipefail

cd /home/ubuntu/project/AIGC_web

if [[ -f .env.production ]]; then
  set -a
  source .env.production
  set +a
fi

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

mkdir -p data/postgres data/redis data/loki data/grafana
sudo chown -R 10001:10001 data/loki
sudo chown -R 472:472 data/grafana

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

if ! docker container inspect aigc-loki >/dev/null 2>&1; then
  docker run -d --name aigc-loki --restart unless-stopped --network aigc-network \
    -p 127.0.0.1:3100:3100 \
    -v /home/ubuntu/project/AIGC_web/deploy/observability/loki-config.yml:/etc/loki/local-config.yaml:ro \
    -v /home/ubuntu/project/AIGC_web/data/loki:/loki \
    grafana/loki:3.5.7 -config.file=/etc/loki/local-config.yaml >/dev/null
else
  docker restart aigc-loki >/dev/null
fi

if docker container inspect aigc-promtail >/dev/null 2>&1; then docker rm -f aigc-promtail >/dev/null; fi
docker run -d --name aigc-promtail --restart unless-stopped --network aigc-network --user 0:0 \
  -v /home/ubuntu/project/AIGC_web/deploy/observability/promtail-config.yml:/etc/promtail/config.yml:ro \
  -v /var/log/journal:/var/log/journal:ro -v /run/log/journal:/run/log/journal:ro \
  -v /etc/machine-id:/etc/machine-id:ro -v /var/log/nginx:/var/log/nginx:ro \
  grafana/promtail:3.5.7 -config.file=/etc/promtail/config.yml >/dev/null

if ! docker container inspect aigc-grafana >/dev/null 2>&1; then
  : "${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD is required}"
  docker run -d --name aigc-grafana --restart unless-stopped --network aigc-network \
    -p 127.0.0.1:3001:3000 -e GF_SECURITY_ADMIN_PASSWORD="$GRAFANA_ADMIN_PASSWORD" \
    -e GF_USERS_ALLOW_SIGN_UP=false \
    -v /home/ubuntu/project/AIGC_web/deploy/observability/grafana-datasource.yml:/etc/grafana/provisioning/datasources/loki.yml:ro \
    -v /home/ubuntu/project/AIGC_web/data/grafana:/var/lib/grafana \
    grafana/grafana:12.3.3 >/dev/null
else
  docker restart aigc-grafana >/dev/null
fi

for attempt in {1..30}; do
  if docker exec aigc-postgres pg_isready -U aigc -d aigc >/dev/null 2>&1 && docker exec aigc-redis redis-cli ping | grep -q PONG && curl -fsS http://127.0.0.1:3100/ready >/dev/null && curl -fsS http://127.0.0.1:3001/api/health >/dev/null; then
    exit 0
  fi
  sleep 1
done

echo "Infrastructure did not become healthy" >&2
exit 1
