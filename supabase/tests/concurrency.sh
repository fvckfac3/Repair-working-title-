#!/usr/bin/env bash
# Invoked by run.sh, which supplies only a fresh local-socket-only cluster.
set -euo pipefail
if [[ -z ${REPAIR_ISOLATED_TEST_DIR:-} || ${PGHOST:-} != "$REPAIR_ISOLATED_TEST_DIR/socket" || ! -f "$REPAIR_ISOLATED_TEST_DIR/data/PG_VERSION" || ! -S "$PGHOST/.s.PGSQL.${PGPORT:-}" ]]; then
  echo 'Refusing to run outside the disposable test cluster created by run.sh.' >&2
  exit 1
fi
TMP=$(mktemp -d "${TMPDIR:-/tmp}/repair-race.XXXXXXXX")
first_pid=''
second_pid=''
cleanup() {
  [[ -z "$first_pid" ]] || kill "$first_pid" 2>/dev/null || true
  [[ -z "$second_pid" ]] || kill "$second_pid" 2>/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT
sql() { psql -XqAt -v ON_ERROR_STOP=1 -c "$1"; }

sql "insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000102'),
  ('00000000-0000-0000-0000-000000000103'),
  ('00000000-0000-0000-0000-000000000104'),
  ('00000000-0000-0000-0000-000000000105'),
  ('00000000-0000-0000-0000-000000000106')"
make_invite() {
  sql "set request.jwt.claim.sub = '$1'; set role authenticated; select public.create_pair_invite()"
}
wait_for_state() {
  local app="$1" state_sql="$2" found=0
  for _ in $(seq 1 100); do
    if [[ $(sql "select count(*) from pg_stat_activity where application_name = '$app' and $state_sql") == 1 ]]; then
      found=1; break
    fi
    sleep 0.05
  done
  [[ "$found" == 1 ]] || { echo "FAIL: session $app never reached $state_sql" >&2; return 1; }
}
run_race() {
  local label="$1" winner_user="$2" winner_code="$3" loser_user="$4" loser_code="$5"
  # Hold the first successful transaction open so the second is guaranteed to
  # contend, rather than merely executing two sequential requests.
  PGAPPNAME="repair_race_first_$label" psql -XqAt -v ON_ERROR_STOP=1 -c \
    "begin; set local statement_timeout='12s'; set local request.jwt.claim.sub='$winner_user'; set local role authenticated; select public.accept_pair_invite('$winner_code'); select pg_sleep(6); commit" \
    >"$TMP/$label.first" 2>&1 &
  first_pid=$!
  wait_for_state "repair_race_first_$label" "wait_event = 'PgSleep'"
  # Establish a repeatable-read snapshot before the winner commits. The unique
  # active-membership key, not merely a fresh-snapshot application check, must
  # prevent a second active couple even under this isolation level.
  PGAPPNAME="repair_race_second_$label" psql -XqAt -v ON_ERROR_STOP=1 -c \
    "begin isolation level repeatable read; set local statement_timeout='12s'; set local request.jwt.claim.sub='$loser_user'; set local role authenticated; select public.accept_pair_invite('$loser_code'); commit" \
    >"$TMP/$label.second" 2>&1 &
  second_pid=$!
  wait_for_state "repair_race_second_$label" "wait_event_type = 'Lock'"
  if ! wait "$first_pid"; then cat "$TMP/$label.first" >&2; echo "FAIL: first $label acceptance" >&2; exit 1; fi
  first_pid=''
  if wait "$second_pid"; then cat "$TMP/$label.second" >&2; echo "FAIL: both $label acceptances succeeded" >&2; exit 1; fi
  second_pid=''
  if ! grep -Eiq 'already paired|invalid or expired|could not serialize|duplicate key' "$TMP/$label.second"; then
    cat "$TMP/$label.second" >&2; echo "FAIL: unexpected $label failure" >&2; exit 1
  fi
  echo "ok - $label concurrent acceptance has one winner"
}

a=00000000-0000-0000-0000-000000000101
b=00000000-0000-0000-0000-000000000102
c=00000000-0000-0000-0000-000000000103
d=00000000-0000-0000-0000-000000000104
e=00000000-0000-0000-0000-000000000105
f=00000000-0000-0000-0000-000000000106
code_a=$(make_invite "$a")
code_b=$(make_invite "$b")
run_race distinct_invites "$c" "$code_a" "$c" "$code_b"
[[ $(sql "select count(*) from public.active_couple_members where user_id='$c'") == 1 ]] || { echo 'FAIL: duplicate active memberships' >&2; exit 1; }
[[ $(sql "select count(*) from public.active_couple_members where user_id in ('$a','$b','$c')") == 2 ]] || { echo 'FAIL: partial or extra memberships after distinct-invite race' >&2; exit 1; }
[[ $(sql "select count(*) from public.couple_members where user_id in ('$a','$b','$c')") == 2 ]] || { echo 'FAIL: partial couple after distinct-invite race' >&2; exit 1; }
code_d=$(make_invite "$d")
run_race same_invite "$e" "$code_d" "$f" "$code_d"
[[ $(sql "select count(*) from public.active_couple_members where user_id in ('$d','$e','$f')") == 2 ]] || { echo 'FAIL: same invite created multiple active pairs' >&2; exit 1; }
[[ $(sql "select count(*) from public.couple_members where user_id in ('$d','$e','$f')") == 2 ]] || { echo 'FAIL: same invite left partial memberships' >&2; exit 1; }
[[ $(sql "select count(*) from public.pair_invites where code='$code_d' and accepted_by='$e' and accepted_at is not null") == 1 ]] || { echo 'FAIL: invite consumption inconsistent' >&2; exit 1; }
echo 'Concurrent pairing tests passed.'
