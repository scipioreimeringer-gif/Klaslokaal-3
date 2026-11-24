-- =====================================================================
-- TeachyRooms v60 — AI memory per student (= per teacher–student–language relation).
--
-- Run ONCE in the Supabase SQL Editor AFTER v59.sql. NON-DESTRUCTIVE: only new tables and functions; no lesson,
-- report, recording or student row is changed. Idempotent: safe to run twice.
--
-- Layers
--   1. Core profile      student_memory.profile (compact jsonb) — fast to read, never the full history
--   2. Development        memory_patterns: one row per error pattern / topic (status, confidence, frequency per
--                        LESSON, examples with source lesson, first/last seen, teacher corrections kept)
--   3. History           the existing sources (reports, notes, homework, vocabulary) — referenced, never copied
-- Updates
--   * memory_apply(): written after every published AI report, from data the analysis ALREADY produced (no extra
--     AI call). Idempotent per report (memory_sources), optimistic version check (no lost updates).
--   * Level / goal changes are only PROPOSALS (memory_proposals); the teacher accepts or rejects them.
-- Access: only the teacher of the relation (is_student_teacher — an admin role alone gives no access). The learner
-- gets only memory_focus(): which grammar points to practise (no notes, no examples of others).
-- =====================================================================

create table if not exists public.student_memory (
  student_id uuid primary key references public.students(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,          -- {goals, interests, strengths[], weaknesses[], preferences, next_goals[], notes}
  version integer not null default 0,
  lessons_processed integer not null default 0,
  last_lesson_date date,
  maintained_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.memory_patterns (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  kind text not null check (kind in ('error','topic')),
  key text not null check (char_length(key) between 1 and 120),
  label text not null check (char_length(label) between 1 and 200),
  error_type text,
  status text not null default 'new' check (status in ('new','learning','fair','mastered','review')),
  confidence text not null default 'low' check (confidence in ('low','medium','high')),
  lessons_seen integer not null default 0,              -- lessons in which it was observed (not every repetition)
  occurrences integer not null default 0,               -- all observations incl. repetitions within a lesson
  uncertain integer not null default 0,                 -- observations that may be a transcription error
  slips integer not null default 0,                     -- slips of the tongue (not counted as a grammar error)
  clean_lessons integer not null default 0,             -- later lessons with the topic, without the error
  examples jsonb not null default '[]'::jsonb,          -- [{original, corrected, lesson_date, analysis_id, certain}] max 6
  history jsonb not null default '[]'::jsonb,           -- [{lesson_date, analysis_id, n, clean}] max 20 (development)
  first_seen date, last_seen date, last_clean date,
  hidden boolean not null default false,
  teacher_status text check (teacher_status in ('new','learning','fair','mastered','review')),
  teacher_note text check (teacher_note is null or char_length(teacher_note) <= 1000),
  updated_at timestamptz not null default now(),
  unique (student_id, kind, key)
);
create index if not exists memory_patterns_student_idx on public.memory_patterns(student_id, kind, status);

create table if not exists public.memory_sources (               -- idempotency: each report is applied once
  student_id uuid not null references public.students(id) on delete cascade,
  analysis_id uuid not null,
  lesson_date date,
  applied_at timestamptz not null default now(),
  primary key (student_id, analysis_id)
);

create table if not exists public.memory_proposals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  field text not null check (field in ('level','goals')),
  current_value text, proposed_value text not null check (char_length(proposed_value) <= 1000),
  reason text check (reason is null or char_length(reason) <= 1000),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(), decided_at timestamptz
);
create unique index if not exists memory_proposals_one_pending on public.memory_proposals(student_id, field) where status = 'pending';

alter table public.student_memory enable row level security;
alter table public.memory_patterns enable row level security;
alter table public.memory_sources enable row level security;
alter table public.memory_proposals enable row level security;
do $$ declare t text; begin
  foreach t in array array['student_memory','memory_patterns','memory_sources','memory_proposals'] loop
    execute format('drop policy if exists %I on public.%I', t || '_teacher', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_student_teacher(student_id)) with check (public.is_student_teacher(student_id))', t || '_teacher', t);
  end loop;
end $$;
grant select, update, delete on public.student_memory, public.memory_patterns, public.memory_proposals to authenticated;
grant select on public.memory_sources to authenticated;
revoke insert on public.memory_patterns, public.memory_sources, public.student_memory from authenticated;   -- only via memory_apply

/** Apply the merged result of ONE report (computed by lib/memory/merge.ts from the report + current memory).
 *  p_patterns: full rows for the patterns that change (teacher fields are never overwritten here).
 *  Returns 'applied' | 'duplicate' (this report was applied before) | raises STALE (memory changed meanwhile). */
create or replace function public.memory_apply(p_student uuid, p_analysis uuid, p_lesson_date date, p_base_version int, p_patterns jsonb, p_profile jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare v int; p jsonb;
begin
  if not public.is_student_teacher(p_student) then raise exception 'Not authorized'; end if;
  if not exists (select 1 from public.lesson_analyses a where a.id = p_analysis and a.student_id = p_student) then raise exception 'Unknown report'; end if;
  perform pg_advisory_xact_lock(hashtext('memory:' || p_student::text));
  if exists (select 1 from public.memory_sources s where s.student_id = p_student and s.analysis_id = p_analysis) then return 'duplicate'; end if;
  insert into public.student_memory(student_id) values (p_student) on conflict (student_id) do nothing;
  select version into v from public.student_memory where student_id = p_student;
  if v <> coalesce(p_base_version, 0) then raise exception 'STALE'; end if;
  for p in select * from jsonb_array_elements(coalesce(p_patterns, '[]'::jsonb)) loop
    insert into public.memory_patterns as m(student_id, kind, key, label, error_type, status, confidence, lessons_seen, occurrences, uncertain, slips, clean_lessons,
      examples, history, first_seen, last_seen, last_clean, updated_at)
    values (p_student, p->>'kind', left(p->>'key', 120), left(p->>'label', 200), p->>'error_type', p->>'status', p->>'confidence',
      (p->>'lessons_seen')::int, (p->>'occurrences')::int, (p->>'uncertain')::int, (p->>'slips')::int, (p->>'clean_lessons')::int,
      coalesce(p->'examples', '[]'::jsonb), coalesce(p->'history', '[]'::jsonb),
      nullif(p->>'first_seen', '')::date, nullif(p->>'last_seen', '')::date, nullif(p->>'last_clean', '')::date, now())
    on conflict (student_id, kind, key) do update set
      label = excluded.label, error_type = excluded.error_type, status = excluded.status, confidence = excluded.confidence,
      lessons_seen = excluded.lessons_seen, occurrences = excluded.occurrences, uncertain = excluded.uncertain, slips = excluded.slips,
      clean_lessons = excluded.clean_lessons, examples = excluded.examples, history = excluded.history,
      first_seen = excluded.first_seen, last_seen = excluded.last_seen, last_clean = excluded.last_clean, updated_at = now();
      -- hidden / teacher_status / teacher_note are the teacher's and are kept
  end loop;
  update public.student_memory set profile = case when p_profile is null then profile else profile || p_profile end,
    version = version + 1, lessons_processed = lessons_processed + 1,
    last_lesson_date = greatest(last_lesson_date, p_lesson_date), updated_at = now()
  where student_id = p_student;
  insert into public.memory_sources(student_id, analysis_id, lesson_date) values (p_student, p_analysis, p_lesson_date);
  return 'applied';
end; $$;

/** Accept or reject a proposal. Accepting a level writes students.level (the only way the AI changes a level). */
create or replace function public.memory_decide(p_id uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.memory_proposals;
begin
  select * into r from public.memory_proposals where id = p_id;
  if r.id is null or not public.is_student_teacher(r.student_id) then raise exception 'Not authorized'; end if;
  if r.status <> 'pending' then return r.status; end if;
  if p_accept and r.field = 'level' then
    if r.proposed_value !~ '^(A0|A1|A2|B1|B2|C1|C2)$' then raise exception 'Invalid level'; end if;
    update public.students set level = r.proposed_value where id = r.student_id;
  elsif p_accept and r.field = 'goals' then
    insert into public.student_memory(student_id) values (r.student_id) on conflict (student_id) do nothing;
    update public.student_memory set profile = profile || jsonb_build_object('goals', r.proposed_value), updated_at = now() where student_id = r.student_id;
  end if;
  update public.memory_proposals set status = case when p_accept then 'accepted' else 'rejected' end, decided_at = now() where id = p_id;
  return case when p_accept then 'accepted' else 'rejected' end;
end; $$;

/** Proposals from the lesson preparation (one pending per field; a newer one replaces the older pending one). */
create or replace function public.memory_propose(p_student uuid, p_field text, p_value text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare cur text;
begin
  if not public.is_student_teacher(p_student) then raise exception 'Not authorized'; end if;
  if p_field = 'level' then
    if p_value !~ '^(A0|A1|A2|B1|B2|C1|C2)$' then return; end if;
    select level into cur from public.students where id = p_student;
  else select profile->>'goals' into cur from public.student_memory where student_id = p_student; end if;
  if cur is not distinct from p_value or coalesce(p_value, '') = '' then return; end if;
  if exists (select 1 from public.memory_proposals where student_id = p_student and field = p_field and status = 'rejected'
             and proposed_value = p_value and decided_at > now() - interval '30 days') then return; end if;   -- not again right after a "no"
  delete from public.memory_proposals where student_id = p_student and field = p_field and status = 'pending';
  insert into public.memory_proposals(student_id, field, current_value, proposed_value, reason) values (p_student, p_field, cur, left(p_value, 1000), left(p_reason, 1000));
end; $$;

/** What to practise (teacher AND linked learner): visible, not-low-confidence error patterns that need work, and
 *  mastered ones (to avoid only easy repeats). Labels and keys only — no notes, no examples. */
create or replace function public.memory_focus(sid uuid) returns table(key text, label text, status text, error_type text)
language sql stable security definer set search_path = '' as $$
  select m.key, m.label, coalesce(m.teacher_status, m.status), m.error_type from public.memory_patterns m
  where m.student_id = sid and m.kind = 'error' and not m.hidden and m.confidence <> 'low' and public.can_access_student(sid)
  order by case coalesce(m.teacher_status, m.status) when 'review' then 0 when 'learning' then 1 when 'new' then 2 when 'fair' then 3 else 4 end, m.lessons_seen desc
  limit 20;
$$;

revoke all on function public.memory_apply(uuid, uuid, date, int, jsonb, jsonb), public.memory_decide(uuid, boolean), public.memory_propose(uuid, text, text, text), public.memory_focus(uuid) from public, anon;
grant execute on function public.memory_apply(uuid, uuid, date, int, jsonb, jsonb), public.memory_decide(uuid, boolean), public.memory_propose(uuid, text, text, text), public.memory_focus(uuid) to authenticated;
