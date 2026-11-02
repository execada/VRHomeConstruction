#!/usr/bin/env bash
#
# Деплой на сервер, где уже работает Caddy (80/443): фронтенд собирается здесь и
# раздаётся Caddy как статика, бэкенд — бинарник, собранный здесь, в Docker рядом с MongoDB.
#
#   SERVER=root@45.12.255.39 DOMAIN=vrhome.45.12.255.39.nip.io ./deploy/server/deploy.sh
#
# Секреты (пароль MongoDB, JWT_SECRET) создаются на сервере при первом деплое и в вывод
# не попадают. Почта: BREVO_API_KEY и BREVO_FROM в /opt/vrhome/backend.env.
set -euo pipefail

: "${SERVER:?укажите SERVER, например root@1.2.3.4}"
: "${DOMAIN:?укажите DOMAIN, например app.1.2.3.4.nip.io}"
REMOTE_DIR="${REMOTE_DIR:-/opt/vrhome}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD="$ROOT/.run/deploy"

log() { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }

log "Сборка фронтенда"
(cd "$ROOT" && npm run build >/dev/null)

log "Сборка бэкенда (linux/amd64)"
rm -rf "$BUILD" && mkdir -p "$BUILD"
(cd "$ROOT/backend" && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o "$BUILD/vrhome-server" ./cmd/server)
cp "$ROOT/deploy/server/docker-compose.yml" "$ROOT/deploy/server/Dockerfile.backend" "$BUILD/"
sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__WEB_ROOT__|$REMOTE_DIR/web|g" "$ROOT/deploy/server/vrhome.caddy" > "$BUILD/vrhome.caddy"

log "Загрузка на $SERVER:$REMOTE_DIR"
ssh "$SERVER" "mkdir -p '$REMOTE_DIR/web' && chmod 755 '$REMOTE_DIR'"
rsync -az --delete --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r "$ROOT/dist/" "$SERVER:$REMOTE_DIR/web/"
rsync -az "$BUILD/vrhome-server" "$BUILD/docker-compose.yml" "$BUILD/Dockerfile.backend" "$BUILD/vrhome.caddy" "$SERVER:$REMOTE_DIR/"

log "Секреты, контейнеры и Caddy"
ssh "$SERVER" REMOTE_DIR="$REMOTE_DIR" DOMAIN="$DOMAIN" 'bash -s' <<'REMOTE'
set -euo pipefail
cd "$REMOTE_DIR"
umask 077
if [ ! -f .env ]; then
  printf 'MONGO_ROOT_USER=vrhome\nMONGO_ROOT_PASSWORD=%s\n' "$(openssl rand -hex 24)" > .env
fi
if [ ! -f backend.env ]; then
  {
    printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 48)"
    printf 'ALLOWED_ORIGINS=https://%s\n' "$DOMAIN"
    printf '# Почта: BREVO_API_KEY + BREVO_FROM (подтверждённый в Brevo отправитель).\n'
    printf '# Пока их нет — коды подтверждения пишутся в лог: docker logs vrhome-backend | grep CODE\n'
    printf 'ALLOW_LOG_ONLY_MAIL=true\n'
  } > backend.env
fi
chmod 600 .env backend.env
chmod 755 vrhome-server

docker compose up -d --build --remove-orphans

# Caddy: сайт отдельным файлом, в основной Caddyfile — только строка import.
install -m 644 vrhome.caddy /etc/caddy/vrhome.caddy
grep -qxF 'import /etc/caddy/vrhome.caddy' /etc/caddy/Caddyfile || {
  cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.pre-vrhome.$(date +%Y%m%d%H%M%S).bak"
  printf '\nimport /etc/caddy/vrhome.caddy\n' >> /etc/caddy/Caddyfile
}
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl reload caddy

for i in $(seq 1 30); do
  curl -fsS -m 3 http://127.0.0.1:8085/api/health >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS -m 3 http://127.0.0.1:8085/api/health
REMOTE

log "Готово: https://$DOMAIN"
