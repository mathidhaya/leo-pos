#!/usr/bin/env bash
# Proves your newest backup can really be restored, WITHOUT touching the live database:
# it restores into a scratch database, compares the counts, then deletes the scratch database.
set -euo pipefail
cd "$(dirname "$0")"

DEST="${BACKUP_DIR:-./backups}"
LATEST="$(ls -1t "$DEST"/leo_pos_*.dump 2>/dev/null | head -1 || true)"
if [ -z "$LATEST" ]; then
  echo "No backup found in $DEST. Run: bash backup.sh" >&2
  exit 1
fi
echo "Testing a restore of $LATEST"

psql_db() { docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 "$@"; }

psql_db -c "DROP DATABASE IF EXISTS leo_pos_restore_test" > /dev/null
psql_db -c "CREATE DATABASE leo_pos_restore_test" > /dev/null
docker compose exec -T db pg_restore -U postgres -d leo_pos_restore_test --no-owner --exit-on-error < "$LATEST"

COUNTS="select 'shops' as what, count(*) from shops union all select 'users', count(*) from users union all select 'products', count(*) from products union all select 'orders', count(*) from orders union all select 'payments', count(*) from payments union all select 'invoices', count(*) from invoices"

echo
echo "Rows in the restored backup:"
psql_db -d leo_pos_restore_test -c "$COUNTS"
echo "Rows in the live database now (orders made since the backup will be higher):"
psql_db -d leo_pos -c "$COUNTS"

psql_db -c "DROP DATABASE leo_pos_restore_test" > /dev/null
echo "The restore works. The scratch database was removed."
