-- Zakir Lab — Supabase setup
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run: it only creates what is missing and replaces the policies.

-- ─────────────────────────────────────────────
-- 1. Quiz scores (shared leaderboard)
-- ─────────────────────────────────────────────
create table if not exists public.scores (
  id          uuid primary key default gen_random_uuid(),
  player      text not null check (char_length(btrim(player)) between 1 and 40),
  title       text not null check (char_length(title) between 1 and 120),
  correct     int  not null check (correct >= 0),
  wrong       int  not null check (wrong >= 0),
  skip        int  not null check (skip >= 0),
  total       int  not null check (total between 1 and 500),
  percent     int  not null check (percent between 0 and 100),
  created_at  timestamptz not null default now(),
  -- the numbers must add up, so hand-crafted nonsense rows are rejected
  constraint scores_counts_add_up check (correct + wrong + skip = total),
  constraint scores_percent_matches check (percent = round(correct * 100.0 / total))
);

create index if not exists scores_rank_idx  on public.scores (percent desc, correct desc, created_at);
create index if not exists scores_title_idx on public.scores (title);

alter table public.scores enable row level security;

-- anyone may read the leaderboard and add a score; nobody may edit or delete
drop policy if exists "scores are public" on public.scores;
create policy "scores are public"
  on public.scores for select
  to anon, authenticated
  using (true);

drop policy if exists "anyone can add a score" on public.scores;
create policy "anyone can add a score"
  on public.scores for insert
  to anon, authenticated
  with check (created_at between now() - interval '1 minute' and now() + interval '1 minute');

grant select, insert on public.scores to anon, authenticated;
revoke update, delete, truncate on public.scores from anon, authenticated;

-- ─────────────────────────────────────────────
-- 2. Suggestions (Suggest form)
-- ─────────────────────────────────────────────
create table if not exists public.suggestions (
  id          uuid primary key default gen_random_uuid(),
  name        text check (name is null or char_length(name) <= 80),
  topic       text check (topic is null or char_length(topic) <= 200),
  message     text not null check (char_length(btrim(message)) between 1 and 2000),
  page        text check (page is null or char_length(page) <= 200),
  created_at  timestamptz not null default now()
);

alter table public.suggestions enable row level security;

-- visitors can only submit; reading happens in the dashboard (Table Editor)
drop policy if exists "anyone can send a suggestion" on public.suggestions;
create policy "anyone can send a suggestion"
  on public.suggestions for insert
  to anon, authenticated
  with check (created_at between now() - interval '1 minute' and now() + interval '1 minute');

grant insert on public.suggestions to anon, authenticated;
revoke select, update, delete, truncate on public.suggestions from anon, authenticated;
