#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file="$repo_root/.env"

if [ ! -f "$env_file" ]; then
  env_file="$repo_root/.env.example"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to run local dependencies." >&2
  exit 1
fi

export COMPOSE_PROJECT_NAME=yingchuan

run_compose() {
  docker compose \
    --project-name "$COMPOSE_PROJECT_NAME" \
    --env-file "$env_file" \
    --file "$repo_root/compose.yaml" \
    "$@"
}

action=${1:-}

case "$action" in
  up)
    run_compose up --detach --wait postgres postgres-test redis
    ;;
  down)
    run_compose down
    ;;
  status)
    run_compose ps
    ;;
  logs)
    run_compose logs --follow postgres redis
    ;;
  config)
    run_compose config --quiet
    echo "Compose configuration is valid for project $COMPOSE_PROJECT_NAME."
    ;;
  *)
    echo "Usage: $0 {up|down|status|logs|config}" >&2
    exit 2
    ;;
esac
