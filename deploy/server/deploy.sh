#!/usr/bin/env bash
#
# Ручной деплой на сервер с Caddy: сборка архива релиза, обновление серверного скрипта
# remote-deploy и полная выкатка (приложение + compose + сайт Caddy) с проверкой здоровья
# и откатом. CI выкатывает только приложение — см. remote-deploy.sh.
#
#   SERVER=root@45.12.255.39 DOMAIN=vrhome.45.12.255.39.nip.io ./deploy/server/deploy.sh
#
# Секреты (пароль MongoDB, JWT_SECRET) создаются на сервере при первом деплое и в вывод
# не попадают. Почта: BREVO_API_KEY и BREVO_FROM в /opt/vrhome/backend.env.
set -euo pipefail

: "${SERVER:?укажите SERVER, например root@1.2.3.4}"
: "${DOMAIN:?укажите DOMAIN, например app.1.2.3.4.nip.io}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

bundle=$(DOMAIN="$DOMAIN" "$ROOT/deploy/server/bundle.sh")
ssh "$SERVER" 'mkdir -p /opt/vrhome/bin && cat > /opt/vrhome/bin/remote-deploy.new && chmod 700 /opt/vrhome/bin/remote-deploy.new && mv /opt/vrhome/bin/remote-deploy.new /opt/vrhome/bin/remote-deploy' \
  <"$ROOT/deploy/server/remote-deploy.sh"
ssh "$SERVER" /opt/vrhome/bin/remote-deploy --full <"$bundle"
