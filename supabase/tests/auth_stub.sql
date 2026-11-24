-- Minimal stand-in for Supabase's auth schema, roles and realtime publication,
-- so the migrations and RLS tests can run against a plain Postgres instance.
-- NOT used against a real Supabase project.
-- Roles are cluster-wide, so create them only once.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create publication supabase_realtime;

-- Mimic API roles' usual default table grants before running migrations. RLS
-- and explicit revocations, not a test-only denial of all privileges, must
-- protect the data. Anonymous access is included to exercise PUBLIC grants.
grant usage on schema public to anon, authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
