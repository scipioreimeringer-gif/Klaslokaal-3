-- =====================================================================
-- TeachyRooms v75 — intelligent daily challenge: a personal, validated question bank and the frozen set of the day.
--
-- Run ONCE in the Supabase SQL Editor. NON-DESTRUCTIVE and idempotent: two NEW tables with RLS; nothing existing changes.
--   practice_questions: validated application questions per student relation (generated in batches, reused, never shown
--                       to anyone else). Linked to a learning-line topic and, when based on a mistake, to that mistake.
--   daily_runs:         the frozen set of one day + the answers so far → continue after a refresh / on another device;
--                       one row per relation and day, so the day is registered once.
-- Access: the linked student (own relation) and the relation's teacher. Nobody else.
-- =====================================================================
create table if not exists public.practice_questions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  lang text not null,
  topic text not null,
  topic_key text,
  goal_id uuid references public.curriculum_goals(id) on delete set null,
  source text not null check (source in ('topic', 'error', 'review')),
  error_ref text,
  level text,
  explain_lang text,
  payload jsonb not null,
  used_on date,
  times_used int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists practice_questions_student_idx on public.practice_questions(student_id, lang, used_on);
alter table public.practice_questions enable row level security;
drop policy if exists "practice_questions read" on public.practice_questions;
create policy "practice_questions read" on public.practice_questions for select to authenticated using (public.can_access_student(student_id));
drop policy if exists "practice_questions write" on public.practice_questions;
create policy "practice_questions write" on public.practice_questions for insert to authenticated
  with check (public.is_linked_student(student_id) or public.is_student_teacher(student_id));
drop policy if exists "practice_questions use" on public.practice_questions;
create policy "practice_questions use" on public.practice_questions for update to authenticated
  using (public.is_linked_student(student_id) or public.is_student_teacher(student_id))
  with check (public.is_linked_student(student_id) or public.is_student_teacher(student_id));

create table if not exists public.daily_runs (
  student_id uuid not null references public.students(id) on delete cascade,
  day date not null,
  questions jsonb not null,
  answers jsonb not null default '[]'::jsonb,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (student_id, day)
);
alter table public.daily_runs enable row level security;
drop policy if exists "daily_runs read" on public.daily_runs;
create policy "daily_runs read" on public.daily_runs for select to authenticated using (public.can_access_student(student_id));
drop policy if exists "daily_runs own insert" on public.daily_runs;
create policy "daily_runs own insert" on public.daily_runs for insert to authenticated with check (public.is_linked_student(student_id));
drop policy if exists "daily_runs own update" on public.daily_runs;
create policy "daily_runs own update" on public.daily_runs for update to authenticated using (public.is_linked_student(student_id)) with check (public.is_linked_student(student_id));
