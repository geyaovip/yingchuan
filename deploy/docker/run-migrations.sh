#!/bin/sh
set -eu

if [ -n "${DATABASE_URL_FILE:-}" ]; then
  if [ -n "${DATABASE_URL:-}" ]; then
    echo "DATABASE_URL and DATABASE_URL_FILE cannot both be set." >&2
    exit 1
  fi
  DATABASE_URL="$(tr -d '\r\n' < "$DATABASE_URL_FILE")"
  export DATABASE_URL
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required." >&2
  exit 1
fi

exec npm run db:migrate:deploy --workspace @yingchuan/database
