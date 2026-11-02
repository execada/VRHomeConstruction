#!/usr/bin/env bash
#
# Выкатывает релиз VR Home Construction из архива на stdin (собирает deploy/server/bundle.sh):
#   • статика — в /opt/vrhome/releases/<время>/web, переключение симлинка /opt/vrhome/web атомарное;
#   • бэкенд — новый бинарник в Docker рядом с MongoDB, проверка /api/health, при сбое — откат;
#   • сайт Caddy — обновляется, только если изменился, с проверкой конфигурации.
#
# Устанавливается в /opt/vrhome/bin/remote-deploy. Режимы:
#   • без аргументов — только приложение (статика и бинарник бэкенда). Так его вызывает CI по
#     SSH-ключу с принудительной командой: ключ не даёт shell, а compose-файл и сайт Caddy из
#     архива игнорируются — доступ к push в main не превращается в root на сервере;
#   • --full — ещё и compose-файл, образ бэкенда и сайт Caddy (ручной деплой администратора):
#     ssh root@сервер /opt/vrhome/bin/remote-deploy --full < релиз.tgz
set -euo pipefail

MODE=app
[ "${1:-}" = "--full" ] && MODE=full

APP_DIR=/opt/vrhome
RELEASES="$APP_DIR/releases"
KEEP_RELEASES=3
MAX_BYTES=$((400 * 1024 * 1024))
REQUIRED=(./web/index.html ./vrhome-server ./docker-compose.yml ./Dockerfile.backend ./vrhome.caddy ./DOMAIN)

log() { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fail() { log "ОШИБКА: $*"; exit 1; }

exec 9>/run/vrhome-deploy.lock
flock -n 9 || fail "другой деплой ещё идёт"

# 1. Приём и проверка архива: размер, формат, обязательные файлы, без абсолютных путей и «..».
release="$RELEASES/$(date -u +%Y%m%d%H%M%S)"
archive=$(mktemp)
trap 'rm -f "$archive"' EXIT
head -c $((MAX_BYTES + 1)) >"$archive"
[ "$(stat -c %s "$archive")" -le "$MAX_BYTES" ] || fail "архив больше $((MAX_BYTES / 1024 / 1024)) МБ"
listing=$(tar -tzf "$archive" 2>/dev/null) || fail "это не архив tar.gz"
if grep -qE '(^/|(^|/)\.\.(/|$))' <<<"$listing"; then fail "в архиве недопустимые пути"; fi
for f in "${REQUIRED[@]}"; do grep -qxF "$f" <<<"$listing" || fail "в архиве нет $f"; done
mkdir -p "$release"
tar -xzf "$archive" -C "$release" --no-same-owner --no-same-permissions
domain=$(tr -cd 'A-Za-z0-9.-' <"$release/DOMAIN")
[ -n "$domain" ] || fail "пустой DOMAIN"
log "релиз $(cat "$release/REVISION" 2>/dev/null || echo '?') → $domain (режим: $MODE)"

# 2. Секреты создаются один раз на сервере и в вывод не попадают.
cd "$APP_DIR"
(
  umask 077
  [ -f .env ] || printf 'MONGO_ROOT_USER=vrhome\nMONGO_ROOT_PASSWORD=%s\n' "$(openssl rand -hex 24)" >.env
  [ -f backend.env ] || printf 'JWT_SECRET=%s\nALLOWED_ORIGINS=https://%s\nALLOW_LOG_ONLY_MAIL=true\n' \
    "$(openssl rand -hex 48)" "$domain" >backend.env
)

# 3. Статика: первая установка превращает каталог web в симлинк на релиз.
if [ -d web ] && [ ! -L web ]; then
  mkdir -p "$RELEASES/initial" && mv web "$RELEASES/initial/web" && ln -s "$RELEASES/initial/web" web
fi
previous_web=$(readlink -f web 2>/dev/null || true)
ln -sfn "$release/web" web.next && mv -T web.next web

# 4. Бэкенд: прежний бинарник сохраняется для отката.
[ -f vrhome-server ] && cp -a vrhome-server vrhome-server.prev
install -m 755 "$release/vrhome-server" vrhome-server
if [ "$MODE" = full ] || [ ! -f docker-compose.yml ]; then
  install -m 644 "$release/docker-compose.yml" "$release/Dockerfile.backend" .
fi

healthy() {
  for _ in $(seq 1 45); do
    curl -fsS -m 3 http://127.0.0.1:8085/api/health >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

rollback() {
  log "откат на предыдущую версию"
  [ -n "$previous_web" ] && ln -sfn "$previous_web" web.next && mv -T web.next web
  [ -f vrhome-server.prev ] && cp -a vrhome-server.prev vrhome-server
  docker compose up -d --build --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$release"
  fail "новая версия не прошла проверку здоровья"
}

compose_log=$(mktemp)
if ! docker compose up -d --build --remove-orphans >"$compose_log" 2>&1; then
  tail -n 20 "$compose_log"
  rollback
fi
tail -n 3 "$compose_log" && rm -f "$compose_log"
healthy || rollback
log "бэкенд здоров"

# 5. Caddy (только --full): перезагрузка при изменении сайта; неверный конфиг не применяется.
site=/etc/caddy/vrhome.caddy
if [ "$MODE" = full ] && ! cmp -s "$release/vrhome.caddy" "$site"; then
  backup=$(mktemp)
  cp -a /etc/caddy/Caddyfile "$backup.Caddyfile"
  [ -f "$site" ] && cp -a "$site" "$backup" || : >"$backup"
  install -m 644 "$release/vrhome.caddy" "$site"
  grep -qxF "import $site" /etc/caddy/Caddyfile || printf '\nimport %s\n' "$site" >>/etc/caddy/Caddyfile
  if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    systemctl reload caddy && log "сайт Caddy обновлён"
  else
    cp -a "$backup.Caddyfile" /etc/caddy/Caddyfile
    if [ -s "$backup" ]; then cp -a "$backup" "$site"; else rm -f "$site"; fi
    rm -f "$backup" "$backup.Caddyfile"
    fail "конфигурация Caddy не прошла проверку — оставлена прежняя"
  fi
  rm -f "$backup" "$backup.Caddyfile"
fi

# 6. Храним последние релизы, текущий не трогаем.
current=$(readlink -f web)
find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | awk '{print $2}' |
  tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
    [ "$old/web" = "$current" ] || rm -rf "$old"
  done

log "готово: https://$domain"
