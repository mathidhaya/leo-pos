#!/usr/bin/env bash
# REPLACES the live database with a backup. Use it after a disaster, or to undo a bad update.
#   bash restore.sh backups/leo_pos_2026-10-16_020000.dump [backups/uploads_2026-10-16_020000.tar]
set -euo pipefail
cd "$(dirname "$0")"

FILE="${1:?Usage: bash restore.sh backups/leo_pos_YYYY-MM-DD_HHMMSS.dump [backups/uploads_YYYY-MM-DD_HHMMSS.tar]}"
UPLOADS="${2:-}"
[ -f "$FILE" ] || { echo "File not found: $FILE" >&2; exit 1; }

echo "This REPLACES the live database with: $FILE"
echo "Everything entered after that backup is lost."
read -r -p "Type RESTORE to continue: " ANSWER
[ "$ANSWER" = "RESTORE" ] || { echo "Cancelled."; exit 1; }

echo "Stopping the app..."
docker compose stop web api

echo "Replacing the database..."
docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS leo_pos WITH (FORCE)"
docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE leo_pos OWNER leo_app"
docker compose exec -T db pg_restore -U postgres -d leo_pos --no-owner --role=leo_app --exit-on-error < "$FILE"

if [ -n "$UPLOADS" ]; then
  [ -f "$UPLOADS" ] || { echo "Images file not found: $UPLOADS" >&2; exit 1; }
  echo "Restoring the uploaded images..."
  docker compose run --rm --no-deps -T api tar -C /app -xf - < "$UPLOADS"
fi

echo "Starting the app..."
docker compose up -d
echo "Done. Open the site and check an order from before the backup."
