#!/usr/bin/env bash
# Start a disposable local-only PostgreSQL cluster, exercise migrations and RLS,
# then destroy it. Never connects to an existing server or accepts a DATABASE_URL.
set -euo pipefail
cd "$(dirname "$0")/.."

# Debian/Ubuntu install server binaries outside PATH.
if ! command -v initdb >/dev/null 2>&1 && command -v pg_config >/dev/null 2>&1; then
  PATH="$(pg_config --bindir):$PATH"
fi
if ! command -v initdb >/dev/null 2>&1 && [[ -d /usr/lib/postgresql/16/bin ]]; then
  PATH="/usr/lib/postgresql/16/bin:$PATH"
fi
export PATH
for program in initdb pg_ctl psql createdb; do
  if ! command -v "$program" >/dev/null 2>&1; then
    echo "Cannot run local SQL tests: $program is not available (PostgreSQL 16 required)." >&2
    exit 1
  fi
done
if [[ $(id -u) -eq 0 ]]; then
  echo 'Cannot run local SQL tests as root; initdb requires an unprivileged user.' >&2
  exit 1
fi

# Ignore all connection variables which could send a command to another server.
unset DATABASE_URL PGHOSTADDR PGSERVICE PGSERVICEFILE PGDATABASE PGPASSWORD PGOPTIONS PGPASSFILE PGSSLMODE PGREQUIREAUTH || true
TMPDIR_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/repair-pg-test.XXXXXXXX")
mkdir "$TMPDIR_ROOT/socket"
export REPAIR_ISOLATED_TEST_DIR="$TMPDIR_ROOT" PGHOST="$TMPDIR_ROOT/socket" PGPORT=55432 PGUSER="$(id -un)"
cleanup() {
  pg_ctl -D "$TMPDIR_ROOT/data" -m immediate -w stop >/dev/null 2>&1 || true
  rm -rf "$TMPDIR_ROOT"
}
trap cleanup EXIT
initdb -D "$TMPDIR_ROOT/data" --auth=trust --no-instructions >/dev/null
# Empty listen_addresses disables TCP; the private socket directory is mode 700.
pg_ctl -D "$TMPDIR_ROOT/data" -l "$TMPDIR_ROOT/server.log" \
  -o "-F -c listen_addresses='' -k $PGHOST -p $PGPORT" -w start >/dev/null
createdb --no-password repair_rls_test
export PGDATABASE=repair_rls_test
psql -Xq -v ON_ERROR_STOP=1 -f tests/auth_stub.sql
psql -Xq -v ON_ERROR_STOP=1 -f migrations/20261109000000_init.sql
psql -Xq -v ON_ERROR_STOP=1 -f tests/legacy_fixture.sql
for f in migrations/*.sql; do
  [[ "$f" == migrations/20261109000000_init.sql ]] && continue
  psql -Xq -v ON_ERROR_STOP=1 -f "$f"
done
psql -Xq -v ON_ERROR_STOP=1 -f tests/rls_test.sql
bash tests/concurrency.sh
bash tests/corrupt_upgrade.sh
printf '%s\n' 'All isolated PostgreSQL tests passed.'
