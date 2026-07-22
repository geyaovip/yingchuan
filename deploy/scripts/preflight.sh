#!/bin/sh
set -eu

echo "== system =="
uname -a
echo "== docker =="
docker version --format 'server={{.Server.Version}} client={{.Client.Version}}'
docker compose version
echo "== cpu and memory =="
getconf _NPROCESSORS_ONLN
if command -v free >/dev/null 2>&1; then free -h; fi
echo "== filesystems =="
df -h / /opt /srv 2>/dev/null || df -h /
echo "== listening tcp ports =="
if command -v ss >/dev/null 2>&1; then ss -ltn; fi
echo "== compose projects =="
docker compose ls
echo "== running containers =="
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'
echo "== required paths =="
for path in /opt/yingchuan /srv/yingchuan /srv/yingchuan/backups /srv/yingchuan/private-files /etc/yingchuan/secrets; do
  if [ -e "$path" ]; then
    ls -ld "$path"
  else
    echo "MISSING $path"
  fi
done
