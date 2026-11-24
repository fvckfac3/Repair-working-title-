#!/usr/bin/env bash
# Invoked only by run.sh against its disposable cluster.
set -euo pipefail
if [[ -z ${REPAIR_ISOLATED_TEST_DIR:-} || ${PGHOST:-} != "$REPAIR_ISOLATED_TEST_DIR/socket" || ! -f "$REPAIR_ISOLATED_TEST_DIR/data/PG_VERSION" || ! -S "$PGHOST/.s.PGSQL.${PGPORT:-}" ]]; then
  echo 'Refusing to run outside the disposable test cluster created by run.sh.' >&2
  exit 1
fi
createdb --no-password repair_corrupt_upgrade
export PGDATABASE=repair_corrupt_upgrade
psql -Xq -v ON_ERROR_STOP=1 -f tests/auth_stub.sql
psql -Xq -v ON_ERROR_STOP=1 -f migrations/20261109000000_init.sql
psql -Xq -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000201'),
 ('00000000-0000-0000-0000-000000000202'),
 ('00000000-0000-0000-0000-000000000203');
insert into public.couples(id) values
 ('20000000-0000-0000-0000-000000000201'),
 ('20000000-0000-0000-0000-000000000202');
insert into public.couple_members(couple_id,user_id) values
 ('20000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000201'),
 ('20000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000202'),
 ('20000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000201'),
 ('20000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000203');
SQL
if psql -Xq -v ON_ERROR_STOP=1 -f migrations/20261123000000_privacy_pairing_hardening.sql >"$REPAIR_ISOLATED_TEST_DIR/corrupt.log" 2>&1; then
  echo 'FAIL: duplicate legacy memberships were silently accepted' >&2; exit 1
fi
if ! grep -qi 'duplicate key' "$REPAIR_ISOLATED_TEST_DIR/corrupt.log"; then
  cat "$REPAIR_ISOLATED_TEST_DIR/corrupt.log" >&2
  echo 'FAIL: migration failed for an unexpected reason' >&2; exit 1
fi
remaining=$(psql -XqAt -v ON_ERROR_STOP=1 -c "select count(*) from information_schema.columns where table_schema='public' and table_name='checkins' and column_name='shared_with_couple_id'")
[[ "$remaining" == 0 ]] || { echo 'FAIL: failed migration left a partial schema' >&2; exit 1; }
echo 'ok - duplicate legacy active memberships abort and roll back the hardening migration'

psql -Xq -v ON_ERROR_STOP=1 <<'SQL'
delete from public.couple_members where couple_id = '20000000-0000-0000-0000-000000000202';
insert into public.couple_members(couple_id,user_id) values
 ('20000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000203');
SQL
if psql -Xq -v ON_ERROR_STOP=1 -f migrations/20261123000000_privacy_pairing_hardening.sql >"$REPAIR_ISOLATED_TEST_DIR/corrupt.log" 2>&1; then
  echo 'FAIL: a three-person legacy couple was silently accepted' >&2; exit 1
fi
if ! grep -qi 'more than two members' "$REPAIR_ISOLATED_TEST_DIR/corrupt.log"; then
  cat "$REPAIR_ISOLATED_TEST_DIR/corrupt.log" >&2
  echo 'FAIL: oversized couple migration failed for an unexpected reason' >&2; exit 1
fi
remaining=$(psql -XqAt -v ON_ERROR_STOP=1 -c "select count(*) from information_schema.columns where table_schema='public' and table_name='checkins' and column_name='shared_with_couple_id'")
[[ "$remaining" == 0 ]] || { echo 'FAIL: oversized-couple migration left a partial schema' >&2; exit 1; }
echo 'ok - oversized legacy active couples abort and roll back the hardening migration'
