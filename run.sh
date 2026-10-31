#!/usr/bin/env bash
#
# VR Home Construction — запуск всего проекта одной командой + публичная ссылка (ngrok).
#
#   ./run.sh
#
# Поднимает:
#   • MongoDB + Backend (Go) в Docker (с пересборкой под актуальный код)
#   • Frontend (Rsbuild dev-сервер) на :3000
#   • Публичный HTTPS-туннель через ngrok на фронтенд
#
# Остановка: Ctrl+C (фронтенд + ngrok). Полная остановка вместе с Docker: ./stop.sh
#
# Публичная ссылка открыта всему интернету. Чтобы закрыть её паролем (ngrok basic auth):
#   NGROK_BASIC_AUTH='user:длинный-пароль' ./run.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

FRONT_PORT=3000
API_PORT=8080
RUN_DIR="$ROOT/.run"
FRONT_LOG="$RUN_DIR/frontend.log"
NGROK_LOG="$RUN_DIR/ngrok.log"
mkdir -p "$RUN_DIR"

c_info=$'\033[1;36m'; c_ok=$'\033[1;32m'; c_err=$'\033[1;31m'; c_dim=$'\033[2m'; c_off=$'\033[0m'
log()  { printf "%s▸ %s%s\n" "$c_info" "$*" "$c_off"; }
ok()   { printf "%s✓ %s%s\n" "$c_ok"   "$*" "$c_off"; }
err()  { printf "%s✗ %s%s\n" "$c_err"  "$*" "$c_off" >&2; }

# ── preflight ────────────────────────────────────────────────────────────────
for bin in docker node npm ngrok curl; do
  command -v "$bin" >/dev/null 2>&1 || { err "Не найден '$bin'. Установите его и повторите."; exit 1; }
done
docker info >/dev/null 2>&1 || { err "Docker не запущен. Запустите Docker Desktop."; exit 1; }

FRONT_PID=""; NGROK_PID=""
cleanup() {
  echo
  log "Останавливаю frontend и ngrok…"
  [ -n "$NGROK_PID" ] && kill "$NGROK_PID" 2>/dev/null || true
  [ -n "$FRONT_PID" ] && kill "$FRONT_PID" 2>/dev/null || true
  pkill -f "ngrok http $FRONT_PORT" 2>/dev/null || true
  printf "%sDocker (MongoDB+Backend) оставлен запущенным. Полная остановка: ./stop.sh%s\n" "$c_dim" "$c_off"
}
trap cleanup EXIT INT TERM

# ── 1. MongoDB + Backend (Docker) ────────────────────────────────────────────
log "1/4  MongoDB + Backend (Docker, пересборка образа бэкенда)…"
( cd backend && docker compose up -d --build )

log "Жду готовности API на http://localhost:$API_PORT …"
for i in $(seq 1 90); do
  # Любой HTTP-ответ (включая 401/404) означает, что сервер слушает и готов.
  # Код 000 = соединение не установлено.
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 2 "http://localhost:$API_PORT/api/health" 2>/dev/null || true)
  if [ -n "$code" ] && [ "$code" != "000" ]; then
    ok "Backend готов (health: $code)"; break
  fi
  sleep 1
  if [ "$i" -eq 90 ]; then
    err "Backend не поднялся за 90с. Логи:"
    ( cd backend && docker compose logs --tail 40 backend )
    exit 1
  fi
done

# ── 2. Зависимости фронтенда ─────────────────────────────────────────────────
if [ ! -d node_modules ]; then
  log "2/4  Установка зависимостей фронтенда (npm install)…"
  npm install
else
  ok "2/4  Зависимости фронтенда уже установлены"
fi

# ── 3. Frontend dev-сервер ───────────────────────────────────────────────────
log "3/4  Frontend dev-сервер на http://localhost:$FRONT_PORT …"
if lsof -ti:"$FRONT_PORT" >/dev/null 2>&1; then
  lsof -ti:"$FRONT_PORT" | xargs kill -9 2>/dev/null || true
  sleep 1
fi
npm run dev >"$FRONT_LOG" 2>&1 &
FRONT_PID=$!

for i in $(seq 1 90); do
  if curl -fsS -m 2 "http://localhost:$FRONT_PORT" >/dev/null 2>&1; then
    ok "Frontend готов"; break
  fi
  if ! kill -0 "$FRONT_PID" 2>/dev/null; then
    err "Frontend упал. Последние строки лога:"; tail -30 "$FRONT_LOG"; exit 1
  fi
  sleep 1
  if [ "$i" -eq 90 ]; then err "Frontend не поднялся за 90с"; tail -30 "$FRONT_LOG"; exit 1; fi
done

# ── 4. Публичная ссылка (ngrok) ──────────────────────────────────────────────
log "4/4  Поднимаю публичную ссылку через ngrok…"
pkill -f "ngrok http $FRONT_PORT" 2>/dev/null || true
sleep 1
NGROK_ARGS=(http "$FRONT_PORT" --log=stdout)
if [ -n "${NGROK_BASIC_AUTH:-}" ]; then
  NGROK_ARGS+=(--basic-auth "$NGROK_BASIC_AUTH")
  ok "Публичная ссылка закрыта паролем (NGROK_BASIC_AUTH)"
fi
ngrok "${NGROK_ARGS[@]}" >"$NGROK_LOG" 2>&1 &
NGROK_PID=$!

PUBLIC_URL=""
for i in $(seq 1 30); do
  # `|| true` — web-API ngrok (:4040) поднимается не мгновенно; неудачный опрос
  # не должен ронять скрипт под set -e/pipefail, цикл просто повторит попытку.
  PUBLIC_URL=$(curl -fsS -m 2 http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | grep -oE '"public_url":"https://[^"]+"' | head -1 | cut -d'"' -f4 || true)
  [ -n "$PUBLIC_URL" ] && break
  if ! kill -0 "$NGROK_PID" 2>/dev/null; then
    err "ngrok не запустился. Логи:"; tail -20 "$NGROK_LOG"
    err "Подсказка: проверьте authtoken (ngrok config add-authtoken <TOKEN>) и отсутствие HTTP(S)_PROXY."
    exit 1
  fi
  sleep 1
done
[ -z "$PUBLIC_URL" ] && { err "Не удалось получить публичную ссылку. Логи:"; tail -20 "$NGROK_LOG"; exit 1; }

# ── Итог ─────────────────────────────────────────────────────────────────────
cat <<EOF

${c_ok}╔════════════════════════════════════════════════════════════════════╗
║  VR Home Construction запущен                                       ║
╚════════════════════════════════════════════════════════════════════╝${c_off}

  ${c_ok}🌍 Публичная ссылка${c_off} : ${PUBLIC_URL}
     ${c_dim}(при первом заходе ngrok покажет страницу-предупреждение —
      нажмите «Visit Site»)${c_off}

  💻 Локально          : http://localhost:${FRONT_PORT}
  🔌 API               : http://localhost:${API_PORT}/api
  🗄  Mongo Express     : ${c_dim}cd backend && docker compose -f docker-compose.yml -f docker-compose.tools.yml up -d mongo-express
                         → http://localhost:8081/mongo-express/ (логин/пароль — MONGO_EXPRESS_* в backend/.env)${c_off}
  📊 ngrok dashboard   : http://127.0.0.1:4040

  ${c_dim}Логи:  tail -f .run/frontend.log .run/ngrok.log
  Стоп:  Ctrl+C — frontend+ngrok;  ./stop.sh — всё, включая Docker${c_off}

EOF

ok "Готово. Нажмите Ctrl+C для остановки frontend и ngrok."
wait "$FRONT_PID"
