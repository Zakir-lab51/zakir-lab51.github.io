-- Zakir Lab — student accounts (run AFTER setup.sql and admin.sql)
-- SQL Editor → New query → paste → Run. Safe to re-run.
--
-- Adds: a public profile (display name only) for every signed-in student,
-- verified scores (the server stamps who took the test, the browser can't),
-- and synced progress (recently opened PDFs) across devices.

-- ─────────────────────────────────────────────
-- 1. Profiles
-- ─────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(btrim(display_name)) between 1 and 40),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- display names appear on the leaderboard, so they are public; nothing else is stored here
drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select
  to anon, authenticated using (true);

drop policy if exists "students edit own profile" on public.profiles;
create policy "students edit own profile" on public.profiles for update
  to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

-- new sign-ups get a profile named after their first name (never their email)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(split_part(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ' ', 1), ''),
      'Student'
    ), 40)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- accounts created before this script (e.g. the admin login) get a profile too
insert into public.profiles (id, display_name)
select u.id,
       left(coalesce(nullif(split_part(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), ' ', 1), ''), 'Student'), 40)
from auth.users u
on conflict (id) do nothing;

-- renaming updates the name on that student's past leaderboard entries
create or replace function public.profile_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.display_name := btrim(new.display_name);
  new.updated_at := now();
  if new.display_name is distinct from old.display_name then
    update public.scores set player = new.display_name where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profile_before_update on public.profiles;
create trigger profile_before_update
  before update on public.profiles
  for each row execute function public.profile_before_update();

-- ─────────────────────────────────────────────
-- 2. Verified scores
-- ─────────────────────────────────────────────
alter table public.scores add column if not exists user_id uuid references public.profiles (id) on delete cascade;
alter table public.scores add column if not exists verified boolean generated always as (user_id is not null) stored;
create index if not exists scores_user_idx on public.scores (user_id, created_at desc);

-- the server decides who took the test: signed in → their account and
-- profile name; guest → no account. Whatever the browser sends is ignored.
create or replace function public.stamp_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  name text;
begin
  new.user_id := null;
  new.created_at := now();
  if uid is not null then
    select display_name into name from public.profiles where id = uid;
    if name is not null then
      new.user_id := uid;
      new.player := name;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_score on public.scores;
create trigger stamp_score
  before insert on public.scores
  for each row execute function public.stamp_score();

-- ─────────────────────────────────────────────
-- 3. Synced progress (recently opened PDFs)
-- ─────────────────────────────────────────────
create table if not exists public.progress (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  recents             jsonb not null default '[]'::jsonb
                      check (jsonb_typeof(recents) = 'array' and pg_column_size(recents) < 32000),
  recents_cleared_at  timestamptz,
  updated_at          timestamptz not null default now()
);
alter table public.progress enable row level security;

drop policy if exists "students read own progress" on public.progress;
create policy "students read own progress" on public.progress for select
  to authenticated using (user_id = (select auth.uid()));

drop policy if exists "students create own progress" on public.progress;
create policy "students create own progress" on public.progress for insert
  to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "students update own progress" on public.progress;
create policy "students update own progress" on public.progress for update
  to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.progress from anon, authenticated;
grant select, insert, update on public.progress to authenticated;
