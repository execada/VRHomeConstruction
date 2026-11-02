#!/usr/bin/env bash
#
# Собирает архив релиза для сервера с Caddy: фронтенд (dist), бэкенд (linux/amd64),
# compose-файл, образ бэкенда и сайт Caddy. Печатает путь к архиву.
#
#   DOMAIN=vrhome.45.12.255.39.nip.io ./deploy/server/bundle.sh
set -euo pipefail

: "${DOMAIN:?укажите DOMAIN, например app.1.2.3.4.nip.io}"
REMOTE_DIR="${REMOTE_DIR:-/opt/vrhome}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${BUNDLE_DIR:-$ROOT/.run/bundle}"
STAGE="$OUT/release"

rm -rf "$OUT" && mkdir -p "$STAGE"

(cd "$ROOT" && npm run build) >&2
(cd "$ROOT/backend" && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
  go build -trimpath -ldflags="-s -w" -o "$STAGE/vrhome-server" ./cmd/server) >&2

cp -R "$ROOT/dist" "$STAGE/web"
cp "$ROOT/deploy/server/docker-compose.yml" "$ROOT/deploy/server/Dockerfile.backend" "$STAGE/"
sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__WEB_ROOT__|$REMOTE_DIR/web|g" \
  "$ROOT/deploy/server/vrhome.caddy" >"$STAGE/vrhome.caddy"
printf '%s\n' "$DOMAIN" >"$STAGE/DOMAIN"
printf '%s\n' "${GITHUB_SHA:-$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo local)}" >"$STAGE/REVISION"

tar -C "$STAGE" -czf "$OUT/vrhome-release.tgz" .
echo "$OUT/vrhome-release.tgz"
