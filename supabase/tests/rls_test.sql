-- RLS regression tests. Run with: supabase/tests/run.sh
-- Any failed assertion raises an exception and aborts with a non-zero exit.
\set ON_ERROR_STOP on

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"display_name":"Alex"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"display_name":"Blair"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"display_name":"Casey"}');

create function pg_temp.act_as(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
end $$;

create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- Alex invites Blair
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select create_pair_invite() as code \gset
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select accept_pair_invite(:'code');
select pg_temp.check(my_couple_id() is not null, 'Blair is paired after accepting the invite');

-- Alex writes private + shared data
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
update private_settings set safety_mode = true;
insert into safety_screens (positive) values (true);
insert into journal_entries (prompt, ciphertext) values ('p', 'secret');
insert into journal_entries (prompt, ciphertext, visibility) values ('p', 'shared', 'shared_full');
insert into assessment_responses (assessment_id, answers, scores, visibility)
  values ('a', '{"q":1}', '{"overall":10}', 'private');
insert into assessment_responses (assessment_id, answers, scores, shared_scores, visibility)
  values ('b', '{"q":4}', '{"overall":90,"sensitive":1}', '{"overall":90}', 'shared_summary');
insert into checkins (kind, answers, visibility) values ('daily', '{"mood":3}', 'shared_summary');
insert into checkins (kind, answers, visibility) values ('daily', '{"mood":1}', 'private');
select pg_temp.check((select count(*) from journal_entries) = 2, 'owner sees all own journal entries');

-- Blair (partner)
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from private_settings) = 1, 'partner sees only own private_settings');
select pg_temp.check(not exists (select 1 from private_settings where user_id = '00000000-0000-0000-0000-00000000000a'), 'partner cannot see safety_mode');
select pg_temp.check((select count(*) from safety_screens) = 0, 'partner cannot see safety screens');
select pg_temp.check((select count(*) from journal_entries) = 1, 'partner sees only shared_full journal entries');
select pg_temp.check((select count(*) from assessment_responses) = 0, 'partner cannot read raw assessment rows');
select pg_temp.check((select count(*) from partner_assessment_summaries) = 1, 'partner sees shared summary via view');
select pg_temp.check((select shared_scores from partner_assessment_summaries) = '{"overall":90}', 'summary excludes raw answers and sensitive data');
select pg_temp.check((select count(*) from checkins) = 1, 'partner sees only shared check-ins');
select pg_temp.check((select count(*) from profiles) = 2, 'partner can read profile');
update journal_entries set ciphertext = 'tampered';
reset role;
select pg_temp.check((select count(*) from journal_entries where ciphertext = 'tampered') = 0, 'partner cannot modify owner rows');

-- Casey (stranger)
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from journal_entries) = 0, 'stranger sees no journals');
select pg_temp.check((select count(*) from partner_assessment_summaries) = 0, 'stranger sees no summaries');
select pg_temp.check((select count(*) from profiles) = 1, 'stranger sees only own profile');
select pg_temp.check((select count(*) from couple_members) = 0, 'stranger sees no couple members');

-- Unlinking revokes partner access immediately
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select unlink_couple();
select pg_temp.check((select count(*) from journal_entries) = 0, 'after unlink, former partner sees no shared journals');
select pg_temp.check((select count(*) from partner_assessment_summaries) = 0, 'after unlink, no shared summaries');

\echo 'All RLS tests passed.'
