-- Zakir Lab — admin features (run AFTER setup.sql)
-- SQL Editor → New query → paste → Run. Safe to re-run.
--
-- Adds: admins list, uploaded notes (table + "notes" storage bucket),
-- admin access to suggestions and scores. Every admin permission is
-- checked by public.is_admin(), i.e. "is the signed-in user in admins?".

-- ─────────────────────────────────────────────
-- 1. Admins
-- ─────────────────────────────────────────────
create table if not exists public.admins (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  added_at  timestamptz not null default now()
);
alter table public.admins enable row level security;

drop policy if exists "admins can see themselves" on public.admins;
create policy "admins can see themselves" on public.admins for select
  to authenticated using (user_id = (select auth.uid()));

revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ─────────────────────────────────────────────
-- 2. Uploaded notes (shown on the subject pages)
-- ─────────────────────────────────────────────
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  subject     text not null check (subject in ('anatomy', 'physiology', 'biochemistry', 'hdpc', 'communication-skills')),
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  file_path   text not null unique check (char_length(file_path) between 1 and 300),
  size_bytes  bigint check (size_bytes >= 0),
  created_at  timestamptz not null default now()
);
create index if not exists notes_subject_idx on public.notes (subject, created_at desc);
alter table public.notes enable row level security;

drop policy if exists "notes are public" on public.notes;
create policy "notes are public" on public.notes for select
  to anon, authenticated using (true);

drop policy if exists "admins add notes" on public.notes;
create policy "admins add notes" on public.notes for insert
  to authenticated with check ((select public.is_admin()));

drop policy if exists "admins edit notes" on public.notes;
create policy "admins edit notes" on public.notes for update
  to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "admins remove notes" on public.notes;
create policy "admins remove notes" on public.notes for delete
  to authenticated using ((select public.is_admin()));

grant select on public.notes to anon, authenticated;
grant insert, update, delete on public.notes to authenticated;
revoke insert, update, delete, truncate on public.notes from anon;

-- PDF storage: public to read, only admins can write. 50 MB per file, PDFs only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notes', 'notes', true, 52428800, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins list note files" on storage.objects;
create policy "admins list note files" on storage.objects for select
  to authenticated using (bucket_id = 'notes' and (select public.is_admin()));

drop policy if exists "admins upload note files" on storage.objects;
create policy "admins upload note files" on storage.objects for insert
  to authenticated with check (bucket_id = 'notes' and (select public.is_admin()));

drop policy if exists "admins replace note files" on storage.objects;
create policy "admins replace note files" on storage.objects for update
  to authenticated using (bucket_id = 'notes' and (select public.is_admin()))
  with check (bucket_id = 'notes' and (select public.is_admin()));

drop policy if exists "admins delete note files" on storage.objects;
create policy "admins delete note files" on storage.objects for delete
  to authenticated using (bucket_id = 'notes' and (select public.is_admin()));

-- ─────────────────────────────────────────────
-- 3. Suggestions: admins can read, mark handled and delete
-- ─────────────────────────────────────────────
alter table public.suggestions add column if not exists handled boolean not null default false;

drop policy if exists "admins read suggestions" on public.suggestions;
create policy "admins read suggestions" on public.suggestions for select
  to authenticated using ((select public.is_admin()));

drop policy if exists "admins update suggestions" on public.suggestions;
create policy "admins update suggestions" on public.suggestions for update
  to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "admins delete suggestions" on public.suggestions;
create policy "admins delete suggestions" on public.suggestions for delete
  to authenticated using ((select public.is_admin()));

grant select, update, delete on public.suggestions to authenticated;

-- ─────────────────────────────────────────────
-- 4. Scores: admins can remove junk entries
-- ─────────────────────────────────────────────
drop policy if exists "admins delete scores" on public.scores;
create policy "admins delete scores" on public.scores for delete
  to authenticated using ((select public.is_admin()));

grant delete on public.scores to authenticated;
