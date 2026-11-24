-- Applied only to the isolated test cluster after the original migration.
-- Existing relationships must survive an upgrade, but old shares and weak
-- outstanding invitation codes must not acquire new authorization.
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000011', '{"display_name":"Legacy One"}'),
  ('00000000-0000-0000-0000-000000000012', '{"display_name":"Legacy Two"}'),
  ('00000000-0000-0000-0000-000000000013', '{"display_name":"Legacy Inviter"}');
insert into public.couples (id) values ('10000000-0000-0000-0000-000000000011');
insert into public.couple_members (couple_id, user_id) values
  ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000011'),
  ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012');
insert into public.pair_invites (code, inviter_id) values
  ('DEADBEEF', '00000000-0000-0000-0000-000000000013');
insert into public.activity_progress (user_id, item_id, status, data, visibility) values
  ('00000000-0000-0000-0000-000000000011', 'legacy', 'completed', '{"private":"LEGACY_PROGRESS"}', 'shared_full');
insert into public.checkins (user_id, kind, answers, visibility) values
  ('00000000-0000-0000-0000-000000000011', 'daily', '{"private":"LEGACY_CHECKIN"}', 'shared_full');
insert into public.journal_entries (user_id, prompt, ciphertext, visibility) values
  ('00000000-0000-0000-0000-000000000011', 'legacy', 'LEGACY_JOURNAL', 'shared_full');
insert into public.assessment_responses (user_id, assessment_id, answers, scores, shared_scores, visibility) values
  ('00000000-0000-0000-0000-000000000011', 'legacy', '{"private":"LEGACY_ANSWER"}', '{}', '{"overall":{"secret":"LEGACY_ASSESSMENT"}}', 'shared_summary');
