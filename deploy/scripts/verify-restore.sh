#!/bin/sh
set -eu

backup_root=${YINGCHUAN_BACKUP_ROOT:-/srv/yingchuan/backups/postgres}
compose_file=${YINGCHUAN_COMPOSE_FILE:-/opt/yingchuan/current/deploy/compose.production.yaml}
environment_file=${YINGCHUAN_ENV_FILE:-/etc/yingchuan/production.env}
restore_database=yingchuan_restore_verify
backup=${1:-}

case "$backup" in
  "$backup_root"/*.dump) ;;
  *) echo "Backup must be an explicit .dump file below $backup_root" >&2; exit 1 ;;
esac
test -f "$backup"
test -f "$backup.sha256"
(cd "$backup_root" && sha256sum --check "$(basename "$backup.sha256")")

export COMPOSE_PROJECT_NAME=yingchuan
compose() {
  docker compose --project-name yingchuan --env-file "$environment_file" -f "$compose_file" "$@"
}

cleanup() {
  compose exec -T postgres dropdb --if-exists --force --username="${POSTGRES_USER:-yingchuan}" "$restore_database" >/dev/null
}
trap cleanup EXIT INT TERM

cleanup
compose exec -T postgres createdb --username="${POSTGRES_USER:-yingchuan}" "$restore_database"
compose exec -T postgres pg_restore --exit-on-error --no-owner --no-privileges --username="${POSTGRES_USER:-yingchuan}" --dbname="$restore_database" < "$backup"
compose exec -T postgres psql --username="${POSTGRES_USER:-yingchuan}" --dbname="$restore_database" --tuples-only --command='SELECT count(*) FROM "_prisma_migrations";'
echo "restore verification passed"
