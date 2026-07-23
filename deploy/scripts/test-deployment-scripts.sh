#!/bin/sh
set -eu

script_root=$(CDPATH= cd "$(dirname "$0")" && pwd)
temporary_root=$(mktemp -d)
cleanup() {
  rm -rf -- "$temporary_root"
}
trap cleanup 0

backup_root="$temporary_root/srv/backups/postgres"
mkdir -p "$backup_root"
index=1
while [ "$index" -le 9 ]; do
  timestamp=$(printf '202607%02dT030000Z' "$index")
  : > "$backup_root/yingchuan-$timestamp.dump"
  : > "$backup_root/yingchuan-$timestamp.dump.sha256"
  index=$((index + 1))
done

sh "$script_root/prune-postgres-backups.sh" "$backup_root" 7
test "$(find "$backup_root" -name 'yingchuan-*.dump' -type f | wc -l | tr -d ' ')" = 7
test ! -e "$backup_root/yingchuan-20260701T030000Z.dump"
test ! -e "$backup_root/yingchuan-20260702T030000Z.dump.sha256"
test -e "$backup_root/yingchuan-20260709T030000Z.dump"

if sh "$script_root/prune-postgres-backups.sh" "$temporary_root" 7 2>/dev/null; then
  echo "Unsafe backup root was not rejected." >&2
  exit 1
fi

environment_file="$temporary_root/production.env"
meminfo_file="$temporary_root/meminfo"
printf '%s\n' \
  'DEPLOY_MIN_FREE_DISK_MB=1' \
  'DEPLOY_MIN_AVAILABLE_MEMORY_MB=1' \
  'DEPLOY_MAX_BACKUP_MB=1' > "$environment_file"
printf 'MemAvailable:        1048576 kB\n' > "$meminfo_file"
YINGCHUAN_ENV_FILE="$environment_file" \
  YINGCHUAN_DATA_ROOT="$temporary_root/srv" \
  YINGCHUAN_BACKUP_ROOT="$backup_root" \
  YINGCHUAN_MEMINFO_FILE="$meminfo_file" \
  sh "$script_root/check-host-resources.sh"

for script in "$script_root"/*.sh; do
  sh -n "$script"
done

echo "deployment script tests passed"
