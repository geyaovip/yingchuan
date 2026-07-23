#!/bin/sh
set -eu

backup_root=${1:-}
retention_count=${2:-7}

case "$retention_count" in
  ''|*[!0-9]*) echo "Backup retention count must be a positive integer." >&2; exit 1 ;;
esac
if [ "$retention_count" -lt 1 ] || [ "$retention_count" -gt 365 ]; then
  echo "Backup retention count must be between 1 and 365." >&2
  exit 1
fi
case "$backup_root" in
  /*/backups/postgres|*/backups/postgres) ;;
  *) echo "Backup root must end with /backups/postgres." >&2; exit 1 ;;
esac
test -d "$backup_root"

set -- "$backup_root"/yingchuan-*.dump
if [ ! -e "$1" ]; then
  exit 0
fi

remove_count=$(($# - retention_count))
if [ "$remove_count" -le 0 ]; then
  exit 0
fi

for backup in "$@"; do
  if [ "$remove_count" -le 0 ]; then
    break
  fi
  case "$backup" in
    "$backup_root"/yingchuan-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z.dump) ;;
    *) echo "Refusing to remove unexpected backup path: $backup" >&2; exit 1 ;;
  esac
  rm -f -- "$backup" "$backup.sha256"
  remove_count=$((remove_count - 1))
done
