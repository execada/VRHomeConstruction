#!/usr/bin/env bash
#
# Одноразовая настройка сервера для CD: пользователь deploy без пароля, shell и группы docker.
# Его ключ привязан к одной команде, а через sudo он может выполнить только remote-deploy
# без аргументов (режим «только приложение»). Запускать от root на сервере:
#
#   ssh root@сервер 'bash -s' < deploy/server/setup-ci-user.sh "$(cat ci_deploy_key.pub)"
set -euo pipefail

PUB="${1:?передайте публичный ключ CI одной строкой}"
case "$PUB" in ssh-ed25519\ *) ;; *) echo "ожидается ключ ssh-ed25519" >&2; exit 1 ;; esac

id deploy >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/deploy --shell /bin/bash deploy
passwd -l deploy >/dev/null 2>&1 || true

install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
printf 'restrict,command="sudo -n /opt/vrhome/bin/remote-deploy" %s\n' "$PUB" >/home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

cat >/etc/sudoers.d/vrhome-deploy <<'SUDO'
# CI/CD VR Home Construction: пользователь deploy может только выкатить приложение
# (remote-deploy без аргументов — режим «только приложение»), больше ничего.
deploy ALL=(root) NOPASSWD: /opt/vrhome/bin/remote-deploy ""
SUDO
chmod 440 /etc/sudoers.d/vrhome-deploy
visudo -cf /etc/sudoers.d/vrhome-deploy >/dev/null

echo "пользователь deploy готов: $(id deploy)"
