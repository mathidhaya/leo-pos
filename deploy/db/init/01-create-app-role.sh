#!/bin/sh
# Runs once, the first time the database is created. It makes the app's own database user
# (not a superuser, it cannot create other users or databases) and the app's database.
set -e

: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is not set}"

# The password goes into a SQL statement, so it may only contain letters and numbers
case "$APP_DB_PASSWORD" in
  *[!A-Za-z0-9]*)
    echo "APP_DB_PASSWORD may only contain letters and numbers (for example from: openssl rand -hex 16)." >&2
    exit 1
    ;;
esac

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE leo_app LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE leo_pos OWNER leo_app;
SQL
