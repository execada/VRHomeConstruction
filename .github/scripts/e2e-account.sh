#!/usr/bin/env bash
#
# Регистрирует тестовый аккаунт для E2E через API (в режиме SMTP_LOG_ONLY код подтверждения
# берётся из лога бэкенда) и передаёт E2E_EMAIL / E2E_PASSWORD следующим шагам GitHub Actions.
#
#   bash .github/scripts/e2e-account.sh <путь к логу бэкенда>
set -euo pipefail

LOG="${1:?укажите путь к логу бэкенда}"
API="${API:-http://localhost:8080/api}"
email="e2e-${GITHUB_RUN_ID:-local}-${RANDOM}@vrhome.test"
password="$(openssl rand -hex 12)"

post() {
  curl -fsS -X POST "$API/auth/$1" -H 'Content-Type: application/json' -d "$2"
}

# Код ищем только в строках, появившихся после запроса (в логе могут быть старые коды).
start=$(wc -l <"$LOG")
token=$(post send-code "$(jq -n --arg e "$email" --arg p "$password" \
  '{email: $e, purpose: "register", name: "E2E", password: $p}')" | jq -r .token)

code=""
for _ in $(seq 1 20); do
  code=$(tail -n +"$((start + 1))" "$LOG" | grep -o 'code=[0-9]\{6\}' | tail -n 1 | cut -d= -f2 || true)
  [ -n "$code" ] && break
  sleep 0.5
done
[ -n "$code" ] || { echo "код подтверждения не найден в логе бэкенда" >&2; exit 1; }

post verify-code "$(jq -n --arg e "$email" --arg c "$code" --arg t "$token" \
  '{email: $e, code: $c, purpose: "register", token: $t}')" >/dev/null

echo "::add-mask::$password"
{
  echo "E2E_EMAIL=$email"
  echo "E2E_PASSWORD=$password"
} >>"${GITHUB_ENV:-/dev/null}"
echo "тестовый аккаунт создан"
