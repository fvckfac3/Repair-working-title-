-- Run only through tests/run.sh, against its newly initialized local cluster.
\set ON_ERROR_STOP on

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"display_name":"Alex"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"display_name":"Blair"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"display_name":"Casey"}');
insert into public.pair_invites (code, inviter_id, expires_at)
  values (repeat('F', 64), '00000000-0000-0000-0000-000000000013', clock_timestamp() - interval '1 second');

create function pg_temp.act_as(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u, ''), false);
  execute 'set role authenticated';
end $$;
create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
create function pg_temp.expect_error(statement text, expected text, msg text)
returns void language plpgsql as $$
declare err text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics err = message_text;
    if position(expected in err) = 0 then
      raise exception 'FAIL: %: unexpected error: %', msg, err;
    end if;
    raise notice 'ok - %', msg;
    return;
  end;
  raise exception 'FAIL: %: statement unexpectedly succeeded', msg;
end $$;

-- The test harness grants ordinary API table privileges before migration.
-- Explicit revokes must survive those default grants.
select pg_temp.check(not has_table_privilege('anon', 'public.partner_assessment_summaries', 'select'), 'anon cannot read owner-rights assessment view');
select pg_temp.check(not has_table_privilege('authenticated', 'public.active_couple_members', 'select'), 'active-membership backstop is not API-readable');
select pg_temp.check(not has_table_privilege('authenticated', 'public.pairing_versions', 'select'), 'pairing lock state is not API-readable');
select pg_temp.check(not has_function_privilege('anon', 'public.accept_pair_invite(text)', 'execute'), 'anon cannot invoke pairing RPC');
select pg_temp.check(not has_function_privilege('anon', 'public.my_couple_id()', 'execute'), 'anon cannot invoke internal relationship helper');
select pg_temp.check(not has_function_privilege('authenticated', 'public.bind_full_share_to_couple()', 'execute'), 'trigger helper is not directly executable');
select pg_temp.check(not has_function_privilege('authenticated', 'public.touch_pairing_user(uuid)', 'execute'), 'pairing lock helper is not directly executable');
select pg_temp.check((select expires_at <= clock_timestamp() and revoked_at is not null from pair_invites where code = 'DEADBEEF'), 'legacy weak invite was revoked during migration');

-- Upgrade: existing relationship remains, existing client-supplied shares do not.
select pg_temp.act_as('00000000-0000-0000-0000-000000000012');
select pg_temp.check(my_couple_id() = '10000000-0000-0000-0000-000000000011', 'existing active pair survives migration');
select pg_temp.check(not exists(select 1 from activity_progress), 'legacy full progress is not automatically reauthorized');
select pg_temp.check(not exists(select 1 from checkins), 'legacy full check-in is not automatically reauthorized');
select pg_temp.check(not exists(select 1 from journal_entries), 'legacy full journal is not automatically reauthorized');
select pg_temp.check(not exists(select 1 from partner_assessment_summaries), 'legacy assessment summary is disabled');
reset role;

-- Both parties issue invitations; replacing a code revokes the previous code.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select create_pair_invite() as blair_code \gset
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select create_pair_invite() as old_code \gset
select pg_temp.check(length(:'old_code') = 64 and :'old_code' ~ '^[0-9A-F]{64}$', 'new invite has a long random code');
select pg_temp.expect_error(format('select public.accept_pair_invite(%L)', :'old_code'), 'cannot accept your own', 'self-acceptance denied');
select create_pair_invite() as code \gset
select pg_temp.check(:'code' <> :'old_code', 'replacement creates a distinct code');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error(format('select public.accept_pair_invite(%L)', :'old_code'), 'invalid or expired', 'replaced invite rejected');
select pg_temp.expect_error($q$select public.accept_pair_invite('DEADBEEF')$q$, 'invalid or expired', 'short legacy invite rejected');
select pg_temp.expect_error($q$select public.accept_pair_invite(repeat('F', 64))$q$, 'invalid or expired', 'expired high-entropy invite rejected');
select accept_pair_invite(:'code') as first_couple \gset
select pg_temp.check(my_couple_id() = :'first_couple'::uuid, 'acceptor becomes a member');
select pg_temp.expect_error(format('select public.accept_pair_invite(%L)', :'code'), 'invalid or expired', 'accepted invite cannot be reused');
select pg_temp.expect_error('select public.create_pair_invite()', 'already paired', 'paired user cannot invite');
select pg_temp.expect_error($q$insert into public.pair_invites(code, inviter_id) values ('forged', auth.uid())$q$, 'row-level security', 'direct invite insertion denied');
select pg_temp.expect_error($q$insert into public.active_couple_members(user_id, couple_id) values (auth.uid(), '10000000-0000-0000-0000-000000000011')$q$, 'permission denied', 'direct active membership insertion denied');
reset role;
select pg_temp.expect_error(format('insert into public.active_couple_members(user_id, couple_id) values (%L, %L)', '00000000-0000-0000-0000-00000000000a', :'first_couple'), 'duplicate key', 'unique active membership is enforced at the database level');

-- Alex's default, private and summary rows must remain owner-only. Each JSON
-- canary is sensitive free text; a summary policy must never expose raw rows.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
update private_settings set safety_mode = true;
insert into safety_screens (positive) values (true);
insert into journal_entries (prompt, ciphertext) values ('private', 'PRIVATE_JOURNAL');
insert into journal_entries (prompt, ciphertext, visibility) values ('full', 'FULL_JOURNAL', 'shared_full');
insert into journal_entries (prompt, ciphertext, visibility) values ('summary', 'SUMMARY_JOURNAL', 'shared_summary');
insert into activity_progress (item_id, status, data) values ('default', 'started', '{"secret":"DEFAULT_PROGRESS"}');
insert into activity_progress (item_id, status, data, visibility) values
  ('summary', 'completed', '{"answer":"SUMMARY_PROGRESS"}', 'shared_summary'),
  ('full', 'completed', '{"answer":"FULL_PROGRESS"}', 'shared_full');
insert into checkins (kind, answers) values ('daily', '{"secret":"DEFAULT_CHECKIN"}');
insert into checkins (kind, answers, visibility) values
  ('weekly', '{"secret":"SUMMARY_CHECKIN"}', 'shared_summary'),
  ('weekly', '{"secret":"FULL_CHECKIN"}', 'shared_full');
insert into assessment_responses (assessment_id, answers, scores, shared_scores, visibility) values
  ('summary', '{"secret":"RAW_ANSWER"}', '{"sensitive":"FULL_SCORE"}', '{"overall":{"nested":"SENSITIVE_CANARY"}}', 'shared_summary'),
  ('full', '{"secret":"FULL_ANSWER"}', '{"sensitive":"FULL_SCORE"}', '{"ordinary":"CLIENT_SECRET"}', 'shared_full');
select pg_temp.check((select visibility = 'private' from checkins where answers->>'secret' = 'DEFAULT_CHECKIN'), 'check-ins default private');
select pg_temp.check((select visibility = 'private' from activity_progress where item_id = 'default'), 'progress defaults private');
select pg_temp.check((select count(*) from journal_entries) = 3, 'owner can read own journal entries');
insert into conversation_sessions (couple_id, guide_id) values (my_couple_id(), 'guide');
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.check(not exists(select 1 from private_settings where user_id = '00000000-0000-0000-0000-00000000000a'), 'partner cannot see safety settings');
select pg_temp.check(not exists(select 1 from safety_screens), 'partner cannot see safety screens');
select pg_temp.check((select count(*) from journal_entries) = 1 and exists(select 1 from journal_entries where ciphertext = 'FULL_JOURNAL'), 'partner sees only explicitly full-shared journal');
select pg_temp.check((select count(*) from activity_progress) = 1 and exists(select 1 from activity_progress where item_id = 'full'), 'summary and default progress never expose raw data');
select pg_temp.check((select count(*) from checkins) = 1 and exists(select 1 from checkins where answers->>'secret' = 'FULL_CHECKIN'), 'summary and default check-ins never expose raw answers');
select pg_temp.check(not exists(select 1 from assessment_responses), 'partner cannot read raw assessments');
select pg_temp.check(not exists(select 1 from partner_assessment_summaries), 'untrusted shared_scores never exposed even with full visibility');
select pg_temp.check((select count(*) from profiles) = 2, 'partner can see current profile');
select pg_temp.expect_error($q$insert into public.checkins(user_id, kind, answers) values ('00000000-0000-0000-0000-00000000000a', 'daily', '{}')$q$, 'row-level security', 'cannot write data as partner');
select pg_temp.expect_error($q$insert into public.conversation_sessions(couple_id, guide_id, started_by) values (public.my_couple_id(), 'guide', '00000000-0000-0000-0000-00000000000a')$q$, 'row-level security', 'cannot impersonate session creator');
update conversation_sessions set phase = 1;
select pg_temp.check((select phase from conversation_sessions) = 1, 'partner can update conversation progress');
select pg_temp.expect_error($q$update public.conversation_sessions set started_by = auth.uid()$q$, 'identity is immutable', 'cannot rewrite session creator');
update journal_entries set ciphertext = 'TAMPERED';
reset role;
select pg_temp.check(not exists(select 1 from journal_entries where ciphertext = 'TAMPERED'), 'partner cannot modify owner rows');

-- Stranger cannot see partner-only data or members.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select pg_temp.check(not exists(select 1 from journal_entries), 'stranger sees no journals');
select pg_temp.check(not exists(select 1 from activity_progress), 'stranger sees no progress');
select pg_temp.check(not exists(select 1 from checkins), 'stranger sees no check-ins');
select pg_temp.check(not exists(select 1 from partner_assessment_summaries), 'stranger sees no assessment summaries');
select pg_temp.check((select count(*) from profiles) = 1, 'stranger sees only own profile');
select pg_temp.check(not exists(select 1 from couple_members), 'stranger sees no couple members');
reset role;

-- Unlink revokes partner reads and invalidates invitations issued before pairing.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select unlink_couple();
select pg_temp.check(not exists(select 1 from journal_entries), 'former partner immediately loses journal access');
select pg_temp.check(not exists(select 1 from activity_progress), 'former partner immediately loses progress access');
select pg_temp.check(not exists(select 1 from checkins), 'former partner immediately loses check-in access');
select pg_temp.check(not exists(select 1 from conversation_sessions), 'former partner loses session access');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect_error(format('select public.accept_pair_invite(%L)', :'blair_code'), 'invalid or expired', 'invite issued before a previous pairing cannot be reused after unlink');
reset role;

-- Full-sharing while unpaired cannot consent for an unknown future partner.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into activity_progress (item_id, status, visibility) values ('unpaired', 'started', 'shared_full');
select create_pair_invite() as second_code \gset
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select accept_pair_invite(:'second_code') as second_couple \gset
select pg_temp.check(not exists(select 1 from journal_entries), 'new partner cannot read previously shared journal');
select pg_temp.check(not exists(select 1 from activity_progress), 'new partner cannot read old or unpaired progress');
select pg_temp.check(not exists(select 1 from checkins), 'new partner cannot read previously shared check-in');
select pg_temp.check(not exists(select 1 from couple_members where user_id = '00000000-0000-0000-0000-00000000000b'), 'current partner cannot see former partner membership');
reset role;

-- Merely editing a shared row or setting the internal binding cannot rebind it.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
update activity_progress set data = '{"secret":"EDITED"}', shared_with_couple_id = my_couple_id() where item_id = 'full';
update checkins set shared_with_couple_id = my_couple_id() where answers->>'secret' = 'FULL_CHECKIN';
update journal_entries set shared_with_couple_id = my_couple_id() where ciphertext = 'FULL_JOURNAL';
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select pg_temp.check(not exists(select 1 from activity_progress), 'editing or forging a binding cannot reshare old progress');
select pg_temp.check(not exists(select 1 from checkins), 'forging a binding cannot reshare old check-in');
select pg_temp.check(not exists(select 1 from journal_entries), 'forging a binding cannot reshare old journal');
reset role;

-- A new explicit off/on decision binds only selected rows to the new couple.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
update activity_progress set visibility = 'private' where item_id = 'full';
update activity_progress set visibility = 'shared_full' where item_id = 'full';
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from activity_progress) = 1 and exists(select 1 from activity_progress where item_id = 'full'), 'explicit new-couple consent reshares only the selected row');
select pg_temp.check(not exists(select 1 from checkins), 'resharing one row does not reshare other data');
reset role;

\echo 'RLS and pairing regression tests passed.'
