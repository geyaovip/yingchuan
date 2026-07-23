#!/bin/sh
set -eu

backup_root=${YINGCHUAN_BACKUP_ROOT:-/srv/yingchuan/backups/postgres}
compose_file=${YINGCHUAN_COMPOSE_FILE:-/opt/yingchuan/current/deploy/compose.production.yaml}
environment_file=${YINGCHUAN_ENV_FILE:-/etc/yingchuan/production.env}
retention_count=${YINGCHUAN_BACKUP_RETENTION_COUNT:-7}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$backup_root/yingchuan-$timestamp.dump"
temporary="$target.partial"
script_root=$(CDPATH= cd "$(dirname "$0")" && pwd)

install -d -m 0700 "$backup_root"
export COMPOSE_PROJECT_NAME=yingchuan
docker compose --project-name yingchuan --env-file "$environment_file" -f "$compose_file" exec -T postgres \
  pg_dump --format=custom --no-owner --no-privileges --username="${POSTGRES_USER:-yingchuan}" "${POSTGRES_DB:-yingchuan}" > "$temporary"
chmod 0600 "$temporary"
test -s "$temporary"
mv "$temporary" "$target"
sha256sum "$target" > "$target.sha256"
chmod 0600 "$target.sha256"
"$script_root/prune-postgres-backups.sh" "$backup_root" "$retention_count"
echo "$target"
