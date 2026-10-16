#!/usr/bin/env bash
# Backs up the database and the uploaded images into deploy/backups, and deletes backups older than 14 days.
# Run it by hand (bash backup.sh) or every night with cron. See docs/DEPLOYMENT.md.
set -euo pipefail
cd "$(dirname "$0")"

DEST="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y-%m-%d_%H%M%S)"

umask 077
mkdir -p "$DEST"

echo "Backing up the database..."
docker compose exec -T db pg_dump -U postgres -d leo_pos --format=custom --no-owner > "$DEST/leo_pos_$STAMP.dump.partial"
mv "$DEST/leo_pos_$STAMP.dump.partial" "$DEST/leo_pos_$STAMP.dump"

echo "Backing up the uploaded images..."
if docker compose exec -T api tar -C /app -cf - uploads > "$DEST/uploads_$STAMP.tar.partial"; then
  mv "$DEST/uploads_$STAMP.tar.partial" "$DEST/uploads_$STAMP.tar"
else
  rm -f "$DEST/uploads_$STAMP.tar.partial"
  echo "Warning: the images were not backed up (is the api container running?)." >&2
fi

find "$DEST" -type f \( -name 'leo_pos_*.dump' -o -name 'uploads_*.tar' \) -mtime +"$KEEP_DAYS" -delete

echo "Done. Newest backups:"
ls -lh "$DEST" | tail -4
echo "Copy them off this server too (see docs/DEPLOYMENT.md, section 10)."
