#!/bin/sh
set -eu

environment_file=${YINGCHUAN_ENV_FILE:-/etc/yingchuan/production.env}
meminfo_file=${YINGCHUAN_MEMINFO_FILE:-/proc/meminfo}

env_value() {
  key=$1
  fallback=$2
  value=$(sed -n "s/^${key}=//p" "$environment_file" | tail -n 1)
  printf '%s\n' "${value:-$fallback}"
}

data_root=${YINGCHUAN_DATA_ROOT:-$(env_value YINGCHUAN_DATA_ROOT /srv/yingchuan)}
backup_root=${YINGCHUAN_BACKUP_ROOT:-$(env_value YINGCHUAN_BACKUP_ROOT "$data_root/backups/postgres")}

require_positive_integer() {
  name=$1
  value=$2
  case "$value" in
    ''|*[!0-9]*) echo "$name must be a positive integer." >&2; exit 1 ;;
  esac
  if [ "$value" -lt 1 ]; then
    echo "$name must be a positive integer." >&2
    exit 1
  fi
}

min_disk_mb=$(env_value DEPLOY_MIN_FREE_DISK_MB 10240)
min_memory_mb=$(env_value DEPLOY_MIN_AVAILABLE_MEMORY_MB 384)
max_backup_mb=$(env_value DEPLOY_MAX_BACKUP_MB 2048)
require_positive_integer DEPLOY_MIN_FREE_DISK_MB "$min_disk_mb"
require_positive_integer DEPLOY_MIN_AVAILABLE_MEMORY_MB "$min_memory_mb"
require_positive_integer DEPLOY_MAX_BACKUP_MB "$max_backup_mb"

available_disk_mb=$(($(df -Pk "$data_root" | awk 'NR == 2 { print $4 }') / 1024))
available_memory_kb=$(awk '/^MemAvailable:/ { print $2 }' "$meminfo_file")
case "$available_memory_kb" in
  ''|*[!0-9]*) echo "Unable to read MemAvailable from $meminfo_file." >&2; exit 1 ;;
esac
available_memory_mb=$((available_memory_kb / 1024))
backup_mb=0
if [ -d "$backup_root" ]; then
  backup_mb=$(($(du -sk "$backup_root" | awk '{ print $1 }') / 1024))
fi

printf 'resource_check available_disk_mb=%s available_memory_mb=%s backup_mb=%s\n' \
  "$available_disk_mb" "$available_memory_mb" "$backup_mb"

if [ "$available_disk_mb" -lt "$min_disk_mb" ]; then
  echo "Deployment requires at least ${min_disk_mb} MiB free on the Yingchuan data filesystem." >&2
  exit 1
fi
if [ "$available_memory_mb" -lt "$min_memory_mb" ]; then
  echo "Deployment requires at least ${min_memory_mb} MiB currently available memory." >&2
  exit 1
fi
if [ "$backup_mb" -gt "$max_backup_mb" ]; then
  echo "PostgreSQL backups exceed the configured ${max_backup_mb} MiB safety limit." >&2
  exit 1
fi
