-- Tiruan minimal lingkungan Supabase untuk database uji (PGlite / PostgreSQL biasa).
-- Hanya dipakai oleh test; JANGAN dijalankan ke Supabase.
create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists vault;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
do $$ begin create role supabase_realtime_admin nologin; exception when duplicate_object then null; end $$;

-- Hak default seperti Supabase: role API boleh memakai objek di schema public (RLS tetap berlaku).
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
grant select on auth.users to authenticated, service_role;

-- auth.uid() dibaca dari setting request.jwt.claim.sub (diatur helper `as()`).
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as
$$ select case when nullif(current_setting('request.jwt.claim.sub', true), '') is null then 'anon' else 'authenticated' end $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create or replace function auth.email() returns text language sql stable as
$$ select email from auth.users where id = auth.uid() $$;

create or replace function extensions.uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
create or replace function public.uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;

do $$ begin create publication supabase_realtime; exception when others then null; end $$;
