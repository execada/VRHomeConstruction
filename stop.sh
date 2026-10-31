#!/usr/bin/env bash
#
# VR Home Construction — полная остановка всего, что поднимает run.sh.
#
#   ./stop.sh
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

c_info=$'\033[1;36m'; c_ok=$'\033[1;32m'; c_off=$'\033[0m'
log() { printf "%s▸ %s%s\n" "$c_info" "$*" "$c_off"; }
ok()  { printf "%s✓ %s%s\n" "$c_ok"   "$*" "$c_off"; }

log "Останавливаю ngrok…"
pkill -f "ngrok http" 2>/dev/null || true

log "Останавливаю frontend dev-сервер (порт 3000)…"
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true

log "Останавливаю Docker (MongoDB + Backend + mongo-express)…"
( cd backend && docker compose -f docker-compose.yml -f docker-compose.tools.yml down 2>/dev/null || docker compose down )

ok "Всё остановлено."
