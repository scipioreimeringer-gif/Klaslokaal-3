-- =====================================================================
-- TeachyRooms v35 — word list from the canvas, flashcards and word games
-- (30 Seconds / Taboo) in the live classroom.
--
-- Run ONCE in the Supabase SQL Editor AFTER v34.sql.
-- NON-DESTRUCTIVE: only adds columns (with defaults), tables, functions and policies.
-- Existing words, progress and practice results stay exactly as they are. One CHECK
-- constraint is widened (word source 'canvas' allowed); existing rows already satisfy it.
-- Idempotent: safe to run twice.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Word list: extra fields (language, part of speech, origin)
-- ---------------------------------------------------------------------
alter table public.vocab_items add column if not exists lang text check (lang is null or lang ~ '^[a-z]{2}(-[A-Z]{2})?$');
alter table public.vocab_items add column if not exists pos text check (pos is null or char_length(pos) <= 40);
alter table public.vocab_items add column if not exists lesson_id uuid references public.lessons(id) on delete set null;
alter table public.vocab_items add column if not exists source_page text check (source_page is null or char_length(source_page) <= 120);
alter table public.vocab_items add column if not exists difficult boolean not null default false; -- set by the AI analysis or the teacher; only affects priority, never "mastered"
alter table public.vocab_items drop constraint if exists vocab_items_source_check;
alter table public.vocab_items add constraint vocab_items_source_check check (source in ('teacher','lesson','ai','student','canvas'));
create index if not exists vocab_items_lesson_idx on public.vocab_items(student_id, lesson_date desc);

-- ---------------------------------------------------------------------
-- 2. Suggested words (canvas recognition + AI analysis): reviewed by the teacher first.
--    One row per word per student: a rejected word is not suggested again.
-- ---------------------------------------------------------------------
create table if not exists public.vocab_suggestions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  term text not null check (char_length(term) between 1 and 120),
  translation text not null default '' check (char_length(translation) <= 300),
  example text not null default '' check (char_length(example) <= 300),
  pos text check (pos is null or char_length(pos) <= 40),
  kind text not null default 'word' check (kind in ('word','expression')),
  lang text,
  origin text not null default 'canvas' check (origin in ('canvas','analysis')),
  lesson_date date,
  lesson_id uuid references public.lessons(id) on delete set null,
  source_page text check (source_page is null or char_length(source_page) <= 120),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists vocab_suggestions_unique on public.vocab_suggestions(student_id, lower(term));
alter table public.vocab_suggestions enable row level security;
drop policy if exists "vocab suggestions teacher" on public.vocab_suggestions;
create policy "vocab suggestions teacher" on public.vocab_suggestions for all to authenticated
  using (public.is_student_teacher(student_id)) with check (public.is_student_teacher(student_id));
grant select, insert, update, delete on public.vocab_suggestions to authenticated;

-- Canvas pages already scanned (same content → no new AI request).
create table if not exists public.vocab_canvas_scans (
  student_id uuid not null references public.students(id) on delete cascade,
  page_hash text not null check (char_length(page_hash) between 8 and 80),
  found integer not null default 0,
  scanned_at timestamptz not null default now(),
  primary key (student_id, page_hash)
);
alter table public.vocab_canvas_scans enable row level security;
drop policy if exists "canvas scans teacher" on public.vocab_canvas_scans;
create policy "canvas scans teacher" on public.vocab_canvas_scans for all to authenticated
  using (public.is_student_teacher(student_id)) with check (public.is_student_teacher(student_id));
grant select, insert, update, delete on public.vocab_canvas_scans to authenticated;

-- ---------------------------------------------------------------------
-- 3. Taboo cards: forbidden words per word and level, generated once (cost control).
--    Teacher only: the student never reads this table directly.
-- ---------------------------------------------------------------------
create table if not exists public.vocab_taboo (
  vocab_id uuid not null references public.vocab_items(id) on delete cascade,
  level text not null check (level in ('A0','A1','A2','B1','B2','C1','C2')),
  words text[] not null check (cardinality(words) between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (vocab_id, level)
);
alter table public.vocab_taboo enable row level security;
drop policy if exists "taboo teacher" on public.vocab_taboo;
create policy "taboo teacher" on public.vocab_taboo for all to authenticated
  using (exists(select 1 from public.vocab_items v where v.id = vocab_id and public.is_student_teacher(v.student_id)))
  with check (exists(select 1 from public.vocab_items v where v.id = vocab_id and public.is_student_teacher(v.student_id)));
grant select, insert, update, delete on public.vocab_taboo to authenticated;

-- ---------------------------------------------------------------------
-- 4. Game rounds: the cards of a round are readable ONLY by the explaining player.
--    The guessing player (teacher or student) gets nothing from the database:
--    hidden at the access-rights level, not with CSS.
-- ---------------------------------------------------------------------
create table if not exists public.game_rounds (
  id uuid primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  session_id uuid not null,
  round_no integer not null check (round_no between 1 and 500),
  kind text not null check (kind in ('thirty','taboo')),
  explainer_user_id uuid not null references auth.users(id) on delete cascade,
  vocab_ids uuid[] not null,
  cards jsonb not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, round_no)
);
create index if not exists game_rounds_session_idx on public.game_rounds(session_id);
alter table public.game_rounds enable row level security;
drop policy if exists "game rounds explainer reads" on public.game_rounds;
create policy "game rounds explainer reads" on public.game_rounds for select to authenticated
  using (explainer_user_id = (select auth.uid()) and public.can_access_student(student_id));
drop policy if exists "game rounds teacher creates" on public.game_rounds;
-- the teacher (host) creates a round for themself or for the linked student of this relation
create policy "game rounds teacher creates" on public.game_rounds for insert to authenticated
  with check (public.is_student_teacher(student_id) and created_by = (select auth.uid())
    and (explainer_user_id = (select auth.uid())
         or explainer_user_id = (select s.user_id from public.students s where s.id = student_id)));
grant select, insert on public.game_rounds to authenticated;

-- Words already used in this game session (ids only, for "no repeats"); never returns card content.
create or replace function public.game_used_words(p_session uuid, p_student uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct x), '{}') from public.game_rounds r, unnest(r.vocab_ids) x
  where r.session_id = p_session and r.student_id = p_student and public.is_student_teacher(p_student);
$$;
revoke all on function public.game_used_words(uuid, uuid) from public;
grant execute on function public.game_used_words(uuid, uuid) to authenticated;

-- Explainer marks a word as guessed: counts as correct practice for the student's word
-- (same spaced-repetition rule as flashcards). Only the explainer of that round may do it.
create or replace function public.game_mark_guessed(p_round uuid, p_vocab uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select * into r from public.game_rounds where id = p_round;
  if not found or r.explainer_user_id <> (select auth.uid()) or not (p_vocab = any(r.vocab_ids)) then raise exception 'Not authorized'; end if;
  update public.vocab_items set correct_count = correct_count + 1, last_practiced_at = now(), updated_at = now() where id = p_vocab and student_id = r.student_id;
end; $$;
revoke all on function public.game_mark_guessed(uuid, uuid) from public;
grant execute on function public.game_mark_guessed(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. AI usage log: two new kinds (word recognition, taboo cards) with their own daily limits.
-- ---------------------------------------------------------------------
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('translate','tidy','analysis','transcription','exercises','prepare','assistant','vocab','games'));
