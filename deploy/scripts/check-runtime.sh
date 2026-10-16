#!/bin/sh
set -eu

release_dir=${YINGCHUAN_RELEASE_DIR:?YINGCHUAN_RELEASE_DIR is required}
environment_file=${YINGCHUAN_ENV_FILE:-/etc/yingchuan/production.env}
check_mode=${CHECK_MODE:-all}

env_value() {
  key=$1
  fallback=$2
  value=$(sed -n "s/^${key}=//p" "$environment_file" | tail -n 1)
  printf '%s\n' "${value:-$fallback}"
}

require_non_negative_integer() {
  name=$1
  value=$2
  case "$value" in
    ''|*[!0-9]*) echo "$name must be a non-negative integer." >&2; exit 1 ;;
  esac
}

compose() {
  docker compose \
    --project-name yingchuan \
    --env-file "$environment_file" \
    -f "$release_dir/deploy/compose.production.yaml" \
    "$@"
}

wait_healthy() {
  service=$1
  attempts=${2:-18}
  attempt=0
  while [ "$attempt" -lt "$attempts" ]; do
    container_id=$(compose ps -q "$service")
    if [ -n "$container_id" ]; then
      health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")
      if [ "$health" = healthy ] || [ "$health" = running ]; then
        return 0
      fi
      if [ "$health" = exited ] || [ "$health" = dead ]; then
        echo "$service stopped before becoming healthy." >&2
        return 1
      fi
    fi
    attempt=$((attempt + 1))
    sleep 5
  done
  echo "$service did not become healthy within $((attempts * 5)) seconds." >&2
  return 1
}

check_queue() {
  stale_minutes=$(env_value OUTBOX_STALE_MINUTES 15)
  stale_max=$(env_value OUTBOX_STALE_MAX 10)
  dead_letter_max=$(env_value OUTBOX_DEAD_LETTER_MAX 0)
  postgres_user=$(env_value POSTGRES_USER yingchuan)
  postgres_db=$(env_value POSTGRES_DB yingchuan)
  require_non_negative_integer OUTBOX_STALE_MINUTES "$stale_minutes"
  require_non_negative_integer OUTBOX_STALE_MAX "$stale_max"
  require_non_negative_integer OUTBOX_DEAD_LETTER_MAX "$dead_letter_max"

  counts=$(compose exec -T postgres psql \
    --username="$postgres_user" \
    --dbname="$postgres_db" \
    --tuples-only \
    --no-align \
    --field-separator='|' \
    --command="SELECT count(*) FILTER (WHERE status = 'pending' AND available_at < now() - make_interval(mins => $stale_minutes)), count(*) FILTER (WHERE status = 'dead_letter') FROM outbox_events;")
  stale_count=${counts%%|*}
  dead_letter_count=${counts##*|}
  require_non_negative_integer stale_outbox_count "$stale_count"
  require_non_negative_integer dead_letter_count "$dead_letter_count"
  printf 'queue_check stale_pending=%s dead_letters=%s\n' "$stale_count" "$dead_letter_count"

  if [ "$stale_count" -gt "$stale_max" ]; then
    echo "Stale outbox events exceed the configured limit of $stale_max." >&2
    return 1
  fi
  if [ "$dead_letter_count" -gt "$dead_letter_max" ]; then
    echo "Outbox dead letters exceed the configured limit of $dead_letter_max." >&2
    return 1
  fi
}

case "$check_mode" in
  queue)
    check_queue
    ;;
  services)
    wait_healthy api
    wait_healthy worker
    wait_healthy openclaw-gateway
    compose exec -T api node -e "fetch('http://127.0.0.1:3000/api/v1/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
    compose exec -T openclaw-gateway node -e "fetch('http://127.0.0.1:18789/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
    ;;
  all)
    wait_healthy api
    wait_healthy worker
    wait_healthy openclaw-gateway
    compose exec -T api node -e "fetch('http://127.0.0.1:3000/api/v1/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
    compose exec -T openclaw-gateway node -e "fetch('http://127.0.0.1:18789/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
    check_queue
    curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-all-errors \
      https://api.chatway.chat/api/v1/ready >/dev/null
    metrics_status=$(curl --silent --show-error --max-time 15 --output /dev/null \
      --write-out '%{http_code}' https://api.chatway.chat/api/v1/metrics)
    if [ "$metrics_status" != 404 ]; then
      echo "Public metrics must remain blocked (HTTP $metrics_status)." >&2
      exit 1
    fi
    # These APIs share this gateway; a default-route-only config must fail release checks.
    for prefix in apaas-sales360 apaas-mes apaas-erp; do
      curl --fail --silent --show-error --max-time 15 --retry 2 --retry-delay 2 \
        --retry-all-errors "https://api.chatway.chat/$prefix/api/v1/health" >/dev/null
      printf 'shared_gateway_check %s=ready\n' "$prefix"
    done
    ;;
  *)
    echo "CHECK_MODE must be queue, services, or all." >&2
    exit 1
    ;;
esac
