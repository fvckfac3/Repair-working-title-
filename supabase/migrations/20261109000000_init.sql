-- Repair: initial schema
--
-- Privacy model
--   * Every user-generated row has an owner (user_id) and a visibility:
--       private         - only the owner, ever (default)
--       shared_summary  - partner sees scores/summary fields only (enforced in views)
--       shared_full     - partner sees the full row
--   * A partner is someone who shares an ACTIVE couple with you.
--   * safety_screens and the safety_mode flag are owner-only, no exceptions:
--     no policy grants partner access, and nothing in the app may reveal
--     that a screen was taken or flagged.

create extension if not exists pgcrypto;

create type visibility as enum ('private', 'shared_summary', 'shared_full');
create type couple_status as enum ('active', 'unlinked');

-- ------------------------------------------------------------------ profiles

create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  pronouns     text,
  created_at   timestamptz not null default now()
);

-- Owner-only private settings, kept apart from profiles so a partner-readable
-- profile row can never leak safety state.
create table public.private_settings (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  safety_mode  boolean not null default false,
  app_lock     boolean not null default false,
  settings     jsonb   not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------------- couples

create table public.couples (
  id         uuid primary key default gen_random_uuid(),
  status     couple_status not null default 'active',
  created_at timestamptz not null default now(),
  unlinked_at timestamptz
);

create table public.couple_members (
  couple_id uuid not null references public.couples (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

-- A user can belong to at most one active couple (enforced in accept_pair_invite).
create index couple_members_user_idx on public.couple_members (user_id);

create table public.pair_invites (
  code       text primary key,
  inviter_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users (id),
  accepted_at timestamptz
);

-- The caller's active couple id, or null.
create or replace function public.my_couple_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select cm.couple_id
  from couple_members cm join couples c on c.id = cm.couple_id
  where cm.user_id = auth.uid() and c.status = 'active'
  limit 1
$$;

-- True if `other` shares an active couple with the caller.
create or replace function public.is_partner(other uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from couple_members me
    join couple_members them on them.couple_id = me.couple_id and them.user_id = other
    join couples c on c.id = me.couple_id and c.status = 'active'
    where me.user_id = auth.uid() and other <> auth.uid()
  )
$$;

create or replace function public.create_pair_invite()
returns text
language plpgsql security definer set search_path = public as $$
declare
  new_code text := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if public.my_couple_id() is not null then raise exception 'already paired'; end if;
  insert into pair_invites (code, inviter_id) values (new_code, auth.uid());
  return new_code;
end $$;

create or replace function public.accept_pair_invite(invite_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv pair_invites%rowtype;
  new_couple uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into inv from pair_invites where code = upper(invite_code) for update;
  if not found or inv.accepted_at is not null or inv.expires_at < now() then
    raise exception 'invite is invalid or expired';
  end if;
  if inv.inviter_id = auth.uid() then raise exception 'cannot accept your own invite'; end if;
  if public.my_couple_id() is not null then raise exception 'already paired'; end if;
  if exists (
    select 1 from couple_members cm join couples c on c.id = cm.couple_id
    where cm.user_id = inv.inviter_id and c.status = 'active'
  ) then raise exception 'inviter is already paired'; end if;

  insert into couples default values returning id into new_couple;
  insert into couple_members (couple_id, user_id) values (new_couple, inv.inviter_id), (new_couple, auth.uid());
  update pair_invites set accepted_by = auth.uid(), accepted_at = now() where code = inv.code;
  return new_couple;
end $$;

-- Either partner may unlink. Shared rows stay owned by their authors and
-- immediately stop being visible to the former partner (is_partner -> false).
create or replace function public.unlink_couple()
returns void
language plpgsql security definer set search_path = public as $$
begin
  update couples set status = 'unlinked', unlinked_at = now()
  where id = public.my_couple_id();
end $$;

-- ------------------------------------------------------------------- content
-- Synced from the repo's compiled bundle by a service-role script.

create table public.content_modules (
  slug       text primary key,
  body       jsonb not null,
  version    text not null,
  updated_at timestamptz not null default now()
);

create table public.content_items (
  id          text primary key,
  module_slug text not null,
  type        text not null,
  body        jsonb not null,
  version     text not null,
  updated_at  timestamptz not null default now()
);

-- -------------------------------------------------------- user activity data

create table public.assessment_responses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  assessment_id text not null,
  answers       jsonb not null,
  scores        jsonb not null,  -- full AssessmentResult (owner only)
  -- What a partner may see: scores with sensitive subscales removed.
  shared_scores jsonb,
  visibility    visibility not null default 'private',
  taken_at      timestamptz not null default now()
);
create index on public.assessment_responses (user_id, assessment_id, taken_at desc);

create table public.activity_progress (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id      text not null,
  status       text not null check (status in ('started', 'completed')),
  step         int not null default 0,
  data         jsonb not null default '{}'::jsonb,  -- exercise answers
  visibility   visibility not null default 'private',
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, item_id)
);

create table public.journal_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  prompt     text not null,
  -- Encrypted on device before upload; the server never sees plaintext.
  ciphertext text not null,
  visibility visibility not null default 'private',
  created_at timestamptz not null default now()
);

create table public.checkins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('daily', 'weekly')),
  answers    jsonb not null,
  visibility visibility not null default 'shared_summary',
  created_at timestamptz not null default now()
);

-- Live two-phone conversation guides. Contains only progress state, no content.
create table public.conversation_sessions (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  guide_id   text not null,
  phase      int not null default 0,
  paused_until timestamptz,
  started_by uuid not null default auth.uid() references auth.users (id),
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);

create table public.safety_screens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  positive   boolean not null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------- RLS

alter table public.profiles              enable row level security;
alter table public.private_settings      enable row level security;
alter table public.couples               enable row level security;
alter table public.couple_members        enable row level security;
alter table public.pair_invites          enable row level security;
alter table public.content_modules       enable row level security;
alter table public.content_items         enable row level security;
alter table public.assessment_responses  enable row level security;
alter table public.activity_progress     enable row level security;
alter table public.journal_entries       enable row level security;
alter table public.checkins              enable row level security;
alter table public.conversation_sessions enable row level security;
alter table public.safety_screens        enable row level security;

-- profiles: owner full access; partner read-only.
create policy profiles_owner on public.profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_partner_read on public.profiles for select
  using (public.is_partner(user_id));

-- private_settings & safety_screens: OWNER ONLY. Do not add partner policies.
create policy private_settings_owner on public.private_settings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy safety_screens_owner on public.safety_screens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- couples / members: members can read; writes only through the functions above.
create policy couples_member_read on public.couples for select
  using (exists (select 1 from public.couple_members m where m.couple_id = couples.id and m.user_id = auth.uid()));
create policy couple_members_read on public.couple_members for select
  using (user_id = auth.uid() or public.is_partner(user_id));

-- invites: inviter can see their own invites; acceptance goes through the RPC.
create policy pair_invites_owner_read on public.pair_invites for select
  using (inviter_id = auth.uid());

-- content: readable by any signed-in user.
create policy content_modules_read on public.content_modules for select to authenticated using (true);
create policy content_items_read on public.content_items for select to authenticated using (true);

-- Owner-or-shared pattern for user data.
create policy assessment_owner on public.assessment_responses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- No partner policy on the base table: partners read the summary view below,
-- which never exposes raw answers or sensitive subscales.

create policy progress_owner on public.activity_progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy progress_partner_read on public.activity_progress for select
  using (visibility <> 'private' and public.is_partner(user_id));

create policy journal_owner on public.journal_entries for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy journal_partner_read on public.journal_entries for select
  using (visibility = 'shared_full' and public.is_partner(user_id));

create policy checkins_owner on public.checkins for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy checkins_partner_read on public.checkins for select
  using (visibility <> 'private' and public.is_partner(user_id));

create policy conversation_couple on public.conversation_sessions for all
  using (couple_id = public.my_couple_id()) with check (couple_id = public.my_couple_id());

-- Partners see shared assessments only through this view: shared_scores,
-- never raw answers. It runs with the owner's rights (bypassing RLS on the
-- base table), so the WHERE clause is the access check.
create view public.partner_assessment_summaries as
  select id, user_id, assessment_id, shared_scores, taken_at
  from public.assessment_responses
  where visibility <> 'private'
    and shared_scores is not null
    and public.is_partner(user_id);
revoke all on public.partner_assessment_summaries from anon;
grant select on public.partner_assessment_summaries to authenticated;

-- ---------------------------------------------------------- new-user trigger

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (user_id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  insert into private_settings (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Realtime for synced conversation guides.
alter publication supabase_realtime add table public.conversation_sessions;
