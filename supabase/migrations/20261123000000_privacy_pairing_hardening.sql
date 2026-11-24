-- Conservative hardening for existing and new installations.
-- Summary sharing is disabled: no server-validated summary schema exists yet.
-- Existing shared_full rows are deliberately not grandfathered into a couple.

begin;

alter table public.checkins alter column visibility set default 'private';

-- A row's full-share consent is bound to the active couple at the moment the
-- owner explicitly selects shared_full. No FK: this is an opaque authorization
-- binding, and deleting a couple must never rebind a row to a later couple.
alter table public.activity_progress add column shared_with_couple_id uuid;
alter table public.checkins add column shared_with_couple_id uuid;
alter table public.journal_entries add column shared_with_couple_id uuid;

-- Unlike a check followed by an insert, this primary key also prevents a user
-- from entering two active couples under concurrent or repeatable-read requests.
-- If old data already violates the invariant, this migration fails rather than
-- choosing a partner or exposing rows to an arbitrary partner.
create table public.active_couple_members (
  user_id uuid primary key,
  couple_id uuid not null,
  foreign key (couple_id, user_id)
    references public.couple_members (couple_id, user_id) on delete cascade
);
alter table public.active_couple_members enable row level security;
revoke all on public.active_couple_members from public, anon, authenticated;
do $$
begin
  if exists (
    select 1 from public.couples c
    join public.couple_members cm on cm.couple_id = c.id
    where c.status = 'active'
    group by c.id having count(*) > 2
  ) then
    raise exception 'invalid legacy data: active couple has more than two members';
  end if;
end $$;
insert into public.active_couple_members (user_id, couple_id)
  select cm.user_id, cm.couple_id
  from public.couple_members cm
  join public.couples c on c.id = cm.couple_id
  where c.status = 'active';

-- Besides advisory locks, touch a real per-user row on every pairing mutation.
-- At REPEATABLE READ a stale snapshot must fail with a serialization error,
-- rather than issuing an invite based on an outdated membership snapshot.
create table public.pairing_versions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  version bigint not null default 0
);
alter table public.pairing_versions enable row level security;
revoke all on public.pairing_versions from public, anon, authenticated;
create function public.touch_pairing_user(who uuid)
returns void language sql
set search_path = pg_catalog, public, pg_temp as $$
  insert into public.pairing_versions (user_id, version) values (who, 1)
  on conflict (user_id) do update set version = public.pairing_versions.version + 1
$$;

create or replace function public.my_couple_id()
returns uuid language sql stable security definer
set search_path = pg_catalog, public, pg_temp as $$
  select acm.couple_id
  from public.active_couple_members acm
  join public.couples c on c.id = acm.couple_id
  where acm.user_id = auth.uid() and c.status = 'active'
$$;

create or replace function public.is_partner(other uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.active_couple_members me
    join public.active_couple_members them on them.couple_id = me.couple_id
    join public.couples c on c.id = me.couple_id
    where me.user_id = auth.uid() and them.user_id = other
      and other <> auth.uid() and c.status = 'active'
  )
$$;

-- Historical membership rows of a current partner are not visible merely
-- because that person is currently a partner.
drop policy couple_members_read on public.couple_members;
create policy couple_members_read on public.couple_members for select
  using (user_id = auth.uid() or couple_id = public.my_couple_id());

create function public.bind_full_share_to_couple()
returns trigger language plpgsql
set search_path = pg_catalog, public, pg_temp as $$
begin
  if new.visibility <> 'shared_full' then
    new.shared_with_couple_id := null;
  elsif tg_op = 'INSERT' then
    new.shared_with_couple_id := public.my_couple_id();
  elsif old.visibility <> 'shared_full' then
    new.shared_with_couple_id := public.my_couple_id();
  else
    -- Ordinary edits and client-supplied binding values cannot silently
    -- re-share a row with a new partner.
    new.shared_with_couple_id := old.shared_with_couple_id;
  end if;
  return new;
end $$;

create trigger bind_activity_full_share before insert or update
  on public.activity_progress for each row execute function public.bind_full_share_to_couple();
create trigger bind_checkin_full_share before insert or update
  on public.checkins for each row execute function public.bind_full_share_to_couple();
create trigger bind_journal_full_share before insert or update
  on public.journal_entries for each row execute function public.bind_full_share_to_couple();

drop policy progress_partner_read on public.activity_progress;
create policy progress_partner_read on public.activity_progress for select
  using (visibility = 'shared_full' and shared_with_couple_id = public.my_couple_id()
         and public.is_partner(user_id));
drop policy checkins_partner_read on public.checkins;
create policy checkins_partner_read on public.checkins for select
  using (visibility = 'shared_full' and shared_with_couple_id = public.my_couple_id()
         and public.is_partner(user_id));
drop policy journal_partner_read on public.journal_entries;
create policy journal_partner_read on public.journal_entries for select
  using (visibility = 'shared_full' and shared_with_couple_id = public.my_couple_id()
         and public.is_partner(user_id));

-- Keep the view and its column types for API compatibility, but never return
-- owner-supplied shared_scores. They can contain arbitrary raw/sensitive data,
-- including under apparently innocuous keys. There is no safe allowlist yet.
create or replace view public.partner_assessment_summaries as
  select id, user_id, assessment_id, shared_scores, taken_at
  from public.assessment_responses
  where false;
revoke all on public.partner_assessment_summaries from public, anon;
grant select on public.partner_assessment_summaries to authenticated;

-- Invalidate all outstanding old, short codes. This intentionally requires new
-- invitations after deployment. New codes have 244 random bits (two UUID v4s).
alter table public.pair_invites add column revoked_at timestamptz;
update public.pair_invites
  set expires_at = least(expires_at, clock_timestamp()), revoked_at = clock_timestamp()
  where accepted_at is null;
-- Expired codes retain an index entry until replaced/revoked, which is harmless.
-- Every new invitation first revokes the previous one, even if already expired.
create unique index pair_invites_one_open_per_inviter on public.pair_invites (inviter_id)
  where accepted_at is null and revoked_at is null;

create or replace function public.create_pair_invite()
returns text language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $$
declare
  caller uuid := auth.uid();
  new_code text;
begin
  if caller is null then raise exception 'not authenticated'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repair.pair:' || caller::text, 0));
  perform public.touch_pairing_user(caller);
  if public.my_couple_id() is not null then raise exception 'already paired'; end if;
  -- At most one outstanding invitation per inviter; creating a replacement
  -- immediately revokes all previous codes.
  update public.pair_invites set expires_at = least(expires_at, clock_timestamp()), revoked_at = clock_timestamp()
    where inviter_id = caller and accepted_at is null and revoked_at is null;
  new_code := upper(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));
  insert into public.pair_invites (code, inviter_id) values (new_code, caller);
  return new_code;
end $$;

create or replace function public.accept_pair_invite(invite_code text)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $$
declare
  caller uuid := auth.uid();
  inv public.pair_invites%rowtype;
  inviter uuid;
  new_couple uuid;
begin
  if caller is null then raise exception 'not authenticated'; end if;
  if invite_code is null or upper(invite_code) !~ '^[0-9A-F]{64}$' then
    raise exception 'invite is invalid or expired';
  end if;
  -- Initial lookup only identifies which user locks to take. Re-read and
  -- validate under row lock after acquiring both user locks in UUID order.
  select inviter_id into inviter from public.pair_invites where code = upper(invite_code);
  if not found then raise exception 'invite is invalid or expired'; end if;
  if inviter = caller then raise exception 'cannot accept your own invite'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repair.pair:' || least(caller, inviter)::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repair.pair:' || greatest(caller, inviter)::text, 0));
  perform public.touch_pairing_user(least(caller, inviter));
  perform public.touch_pairing_user(greatest(caller, inviter));
  select * into inv from public.pair_invites where code = upper(invite_code) for update;
  if not found or inv.inviter_id <> inviter or inv.accepted_at is not null or inv.revoked_at is not null
     or inv.expires_at <= clock_timestamp() then
    raise exception 'invite is invalid or expired';
  end if;
  if public.my_couple_id() is not null then raise exception 'already paired'; end if;
  if exists (select 1 from public.active_couple_members where user_id = inviter) then
    raise exception 'inviter is already paired';
  end if;
  insert into public.couples default values returning id into new_couple;
  insert into public.couple_members (couple_id, user_id)
    values (new_couple, inviter), (new_couple, caller);
  -- This unique constraint is the final backstop even with older snapshots.
  insert into public.active_couple_members (couple_id, user_id)
    values (new_couple, inviter), (new_couple, caller);
  update public.pair_invites set accepted_by = caller, accepted_at = clock_timestamp()
    where code = inv.code;
  update public.pair_invites set expires_at = least(expires_at, clock_timestamp()), revoked_at = clock_timestamp()
    where inviter_id in (caller, inviter) and accepted_at is null and revoked_at is null;
  return new_couple;
end $$;

create or replace function public.unlink_couple()
returns void language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $$
declare
  caller uuid := auth.uid();
  current_couple uuid;
  partner uuid;
begin
  if caller is null then raise exception 'not authenticated'; end if;
  current_couple := public.my_couple_id();
  if current_couple is not null then
    select user_id into partner from public.active_couple_members
      where couple_id = current_couple and user_id <> caller limit 1;
    if partner is null then partner := caller; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repair.pair:' || least(caller, partner)::text, 0));
    if partner <> caller then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repair.pair:' || greatest(caller, partner)::text, 0));
    end if;
    perform public.touch_pairing_user(least(caller, partner));
    if partner <> caller then perform public.touch_pairing_user(greatest(caller, partner)); end if;
    if public.my_couple_id() is distinct from current_couple then
      raise exception 'pairing changed; retry unlink';
    end if;
    update public.pair_invites set expires_at = least(expires_at, clock_timestamp()), revoked_at = clock_timestamp()
      where inviter_id in (caller, partner) and accepted_at is null and revoked_at is null;
    update public.couples set status = 'unlinked', unlinked_at = clock_timestamp()
      where id = current_couple and status = 'active';
    delete from public.active_couple_members where couple_id = current_couple;
  end if;
end $$;

-- A pair may collaborate on conversation progress, but cannot impersonate
-- another user as the creator or alter the identity of an existing session.
drop policy conversation_couple on public.conversation_sessions;
create policy conversation_select on public.conversation_sessions for select
  using (couple_id = public.my_couple_id());
create policy conversation_insert on public.conversation_sessions for insert
  with check (couple_id = public.my_couple_id() and started_by = auth.uid());
create policy conversation_update on public.conversation_sessions for update
  using (couple_id = public.my_couple_id()) with check (couple_id = public.my_couple_id());
create policy conversation_delete on public.conversation_sessions for delete
  using (couple_id = public.my_couple_id());

create function public.prevent_conversation_identity_change()
returns trigger language plpgsql
set search_path = pg_catalog, public, pg_temp as $$
begin
  if new.id is distinct from old.id or new.couple_id is distinct from old.couple_id
     or new.started_by is distinct from old.started_by or new.started_at is distinct from old.started_at then
    raise exception 'conversation identity is immutable';
  end if;
  return new;
end $$;
create trigger conversation_identity_immutable before update on public.conversation_sessions
  for each row execute function public.prevent_conversation_identity_change();

-- PostgreSQL grants function execution to PUBLIC by default. Do not expose
-- pairing RPCs or internal helpers to anonymous callers via that default.
revoke all on function public.create_pair_invite() from public, anon;
revoke all on function public.accept_pair_invite(text) from public, anon;
revoke all on function public.unlink_couple() from public, anon;
revoke all on function public.my_couple_id() from public, anon;
revoke all on function public.is_partner(uuid) from public, anon;
revoke all on function public.bind_full_share_to_couple() from public, anon, authenticated;
revoke all on function public.prevent_conversation_identity_change() from public, anon, authenticated;
revoke all on function public.touch_pairing_user(uuid) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.create_pair_invite(), public.accept_pair_invite(text),
  public.unlink_couple(), public.my_couple_id(), public.is_partner(uuid) to authenticated;

commit;
