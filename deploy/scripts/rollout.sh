#!/bin/sh
set -eu

image_tag=${IMAGE_TAG:?IMAGE_TAG is required}
release_root=${YINGCHUAN_RELEASE_ROOT:-/opt/yingchuan/releases}
release_dir=$release_root/$image_tag
current_link=${YINGCHUAN_CURRENT_LINK:-/opt/yingchuan/current}
state_root=${YINGCHUAN_STATE_ROOT:-/opt/yingchuan/state}
environment_file=${YINGCHUAN_ENV_FILE:-/etc/yingchuan/production.env}
docker_config=${DOCKER_CONFIG:-/opt/yingchuan/.docker}
rollout_started=0
rollout_succeeded=0

case "$image_tag" in
  ''|*[!0-9a-f]*) echo "IMAGE_TAG must be a lowercase Git commit SHA." >&2; exit 1 ;;
esac
if [ "${#image_tag}" -ne 40 ]; then
  echo "IMAGE_TAG must be a 40-character Git commit SHA." >&2
  exit 1
fi
test -f "$release_dir/deploy/compose.production.yaml"
install -d -m 0755 "$state_root"

compose_release() {
  target_release=$1
  target_tag=$2
  shift 2
  IMAGE_TAG="$target_tag" docker compose \
    --project-name yingchuan \
    --env-file "$environment_file" \
    -f "$target_release/deploy/compose.production.yaml" \
    "$@"
}

previous_release=
if [ -L "$current_link" ]; then
  previous_release=$(readlink -f "$current_link")
elif [ -f /opt/yingchuan/deploy/compose.production.yaml ]; then
  previous_release=/opt/yingchuan
fi

previous_tag=
if [ -f "$state_root/last-successful-image-tag" ]; then
  previous_tag=$(sed -n '1p' "$state_root/last-successful-image-tag")
elif [ -n "$previous_release" ]; then
  previous_container=$(compose_release "$previous_release" "$image_tag" ps -q api || true)
  if [ -n "$previous_container" ]; then
    previous_image=$(docker inspect --format '{{.Config.Image}}' "$previous_container")
    previous_tag=${previous_image##*:}
  fi
fi
case "$previous_tag" in
  *[!0-9a-f]*|'') previous_tag= ;;
esac
if [ -n "$previous_tag" ] && [ "${#previous_tag}" -ne 40 ]; then
  previous_tag=
fi

rollback() {
  if [ -z "$previous_release" ] || [ -z "$previous_tag" ]; then
    echo "No previous immutable release is available for automatic rollback." >&2
    return 1
  fi
  echo "Rolling application services back to $previous_tag." >&2
  compose_release "$previous_release" "$previous_tag" up -d --no-deps api worker openclaw-gateway caddy
  if [ "$previous_release" != /opt/yingchuan ]; then
    ln -sfn "$previous_release" "$current_link"
  elif [ -L "$current_link" ]; then
    rm -f -- "$current_link"
  fi
  sudo install -m 0644 "$previous_release/deploy/systemd/yingchuan-postgres-backup.service" /etc/systemd/system/yingchuan-postgres-backup.service
  sudo install -m 0644 "$previous_release/deploy/systemd/yingchuan-postgres-backup.timer" /etc/systemd/system/yingchuan-postgres-backup.timer
  sudo systemctl daemon-reload
  sudo systemctl enable --now yingchuan-postgres-backup.timer
  YINGCHUAN_RELEASE_DIR="$previous_release" IMAGE_TAG="$previous_tag" CHECK_MODE=services \
    "$release_dir/deploy/scripts/check-runtime.sh"
}

finish() {
  status=$?
  trap - 0
  if [ "$status" -ne 0 ] && [ "$rollout_started" -eq 1 ] && [ "$rollout_succeeded" -eq 0 ]; then
    rollback || true
  fi
  docker --config "$docker_config" logout ghcr.io >/dev/null 2>&1 || true
  exit "$status"
}
trap finish 0

openclaw_image=$(sed -n 's/^OPENCLAW_IMAGE=//p' "$environment_file" | tail -n 1)
if ! printf '%s' "$openclaw_image" | grep -Eq '^ghcr\.io/openclaw/openclaw:2026\.7\.1@sha256:[0-9a-f]{64}$'; then
  echo "OPENCLAW_IMAGE must pin official 2026.7.1 by sha256 digest." >&2
  exit 1
fi
caddy_image=$(sed -n 's/^CADDY_IMAGE=//p' "$environment_file" | tail -n 1)
if ! printf '%s' "$caddy_image" | grep -Eq '^caddy:2\.10\.2-alpine@sha256:[0-9a-f]{64}$'; then
  echo "CADDY_IMAGE must pin caddy:2.10.2-alpine by sha256 digest." >&2
  exit 1
fi

YINGCHUAN_ENV_FILE="$environment_file" "$release_dir/deploy/scripts/check-host-resources.sh"
compose_release "$release_dir" "$image_tag" pull api worker migrate openclaw-gateway caddy
compose_release "$release_dir" "$image_tag" up -d --no-recreate postgres redis
YINGCHUAN_RELEASE_DIR="$release_dir" IMAGE_TAG="$image_tag" CHECK_MODE=queue \
  "$release_dir/deploy/scripts/check-runtime.sh"
compose_release "$release_dir" "$image_tag" --profile migration run --rm -T migrate </dev/null
compose_release "$release_dir" "$image_tag" up -d openclaw-gateway

rollout_started=1
compose_release "$release_dir" "$image_tag" up -d --no-deps api worker
compose_release "$release_dir" "$image_tag" up -d --no-deps caddy
YINGCHUAN_RELEASE_DIR="$release_dir" IMAGE_TAG="$image_tag" CHECK_MODE=all \
  "$release_dir/deploy/scripts/check-runtime.sh"

compose_release "$release_dir" "$image_tag" ps
ln -sfn "$release_dir" "$current_link"
sudo install -m 0644 "$release_dir/deploy/systemd/yingchuan-postgres-backup.service" /etc/systemd/system/yingchuan-postgres-backup.service
sudo install -m 0644 "$release_dir/deploy/systemd/yingchuan-postgres-backup.timer" /etc/systemd/system/yingchuan-postgres-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now yingchuan-postgres-backup.timer
temporary_state="$state_root/last-successful-image-tag.tmp"
printf '%s\n' "$image_tag" > "$temporary_state"
chmod 0644 "$temporary_state"
mv "$temporary_state" "$state_root/last-successful-image-tag"
rollout_succeeded=1
