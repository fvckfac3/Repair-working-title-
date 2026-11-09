#!/usr/bin/env bash
# Runs migrations + RLS tests against a throwaway database on a plain Postgres.
# Usage: PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="repair_rls_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/auth_stub.sql
for f in migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
psql -qtA -v ON_ERROR_STOP=1 -d "$DB" -f tests/rls_test.sql 2>&1 | grep -v "^$"
