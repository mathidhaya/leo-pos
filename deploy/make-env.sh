#!/usr/bin/env bash
# Creates deploy/.env with fresh random secrets. It never overwrites an existing .env.
set -euo pipefail
cd "$(dirname "$0")"

DOMAIN="${1:?Usage: bash make-env.sh your.domain.com}"
if [ -e .env ]; then
  echo "deploy/.env already exists, so nothing was changed." >&2
  exit 1
fi

# A secret that does not contain the digits 12345 in a row (the app refuses those as "placeholders")
secret() {
  local s
  while :; do
    s="$(openssl rand -hex "$1")"
    case "$s" in *12345*) continue ;; esac
    echo "$s"
    break
  done
}

umask 077
cat > .env <<ENVFILE
SITE_ADDRESS=${DOMAIN}
POSTGRES_PASSWORD=$(secret 16)
APP_DB_PASSWORD=$(secret 16)
JWT_ACCESS_SECRET=$(secret 48)
JWT_REFRESH_SECRET=$(secret 48)
ALLOW_REGISTRATION=false
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=
ENVFILE
chmod 600 .env

echo "Created deploy/.env for ${DOMAIN}. Keep a safe copy of this file: without it you cannot read your backups' passwords or restart cleanly."
echo "Add your email settings with:  nano .env"
