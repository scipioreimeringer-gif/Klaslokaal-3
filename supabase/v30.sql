-- =====================================================================
-- TeachyRooms v30 — lesson agenda: planned lessons linked to the existing
-- teacher–student relation, time zones, double-booking protection, and links
-- from recordings / analyses / homework to a lesson.
--
-- Run ONCE in the Supabase SQL Editor AFTER v29.sql.
-- NON-DESTRUCTIVE: only adds tables, columns, functions, triggers and policies.
-- No DROP TABLE / DROP COLUMN / DELETE / UPDATE of existing rows.
-- Idempotent: safe to run twice.
-- Prepared for later: Google Calendar sync (external_source/external_id),
-- e-mail reminders (reminder_sent_at) and booking links (created_via).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Time zone per account (the browser reports it; used to show the other side's local time)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists timezone text;

create or replace function public.is_valid_timezone(tz text) returns boolean
language sql stable set search_path = '' as $$
  select tz is not null and exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;

create or replace function public.set_my_timezone(tz text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_valid_timezone(tz) then raise exception 'Invalid time zone'; end if;
  update public.profiles set timezone = tz where id = (select auth.uid());
end; $$;

-- Time zone of me and the people I have lessons with (profiles RLS only exposes your own row).
create or replace function public.people_timezones()
returns table(user_id uuid, timezone text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.timezone from public.profiles p
   where p.id = (select auth.uid())
      or p.id in (select s.teacher_id from public.students s where s.user_id = (select auth.uid()))
      or p.id in (select s.user_id from public.students s where s.teacher_id = (select auth.uid()) and s.user_id is not null);
$$;

-- ---------------------------------------------------------------------
-- 2. Planned lessons
-- ---------------------------------------------------------------------
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,   -- = one teacher–student(–language) relation
  teacher_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Europe/Amsterdam',   -- the teacher's zone when planned (recurrence follows its local time, DST-safe)
  language text,                                       -- language of the lesson; null = language of the relation
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  series_id uuid,                                      -- weekly series
  cancelled_at timestamptz,
  created_via text not null default 'teacher' check (created_via in ('teacher','booking_link','import')),
  external_source text,                                -- e.g. 'google' (later)
  external_id text,
  reminder_sent_at timestamptz,                        -- e-mail reminders (later)
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lessons_time_order check (ends_at > starts_at),
  constraint lessons_max_length check (ends_at - starts_at <= interval '8 hours'),
  constraint lessons_language check (language is null or language ~ '^[a-z]{2}$')
);
create index if not exists lessons_teacher_time_idx on public.lessons(teacher_id, starts_at);
create index if not exists lessons_student_time_idx on public.lessons(student_id, starts_at);
create index if not exists lessons_series_idx on public.lessons(series_id);
create unique index if not exists lessons_external_unique on public.lessons(teacher_id, external_source, external_id) where external_id is not null;

-- Teacher-only notes per lesson (students never read these).
create table if not exists public.lesson_teacher_notes (
  lesson_id uuid primary key references public.lessons(id) on delete cascade,
  notes text not null default '' check (char_length(notes) <= 20000),
  updated_at timestamptz not null default now()
);

-- Integrity: teacher_id always equals the relation's teacher; valid zone; no double booking.
create or replace function public.lessons_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare rel_teacher uuid; rel_user uuid; clash timestamptz;
begin
  select s.teacher_id, s.user_id into rel_teacher, rel_user from public.students s where s.id = new.student_id;
  if rel_teacher is null then raise exception 'Unknown student'; end if;
  new.teacher_id := rel_teacher;
  if not public.is_valid_timezone(new.timezone) then raise exception 'Invalid time zone'; end if;
  new.updated_at := now();
  if new.status = 'cancelled' and new.cancelled_at is null then new.cancelled_at := now(); end if;
  if new.status <> 'cancelled' then
    -- serialize bookings per teacher so two parallel requests cannot both pass the check
    perform pg_advisory_xact_lock(hashtext(rel_teacher::text));
    select l.starts_at into clash from public.lessons l
     where l.id <> new.id and l.status <> 'cancelled' and l.teacher_id = rel_teacher
       and tstzrange(l.starts_at, l.ends_at) && tstzrange(new.starts_at, new.ends_at) limit 1;
    if clash is not null then raise exception 'DOUBLE_BOOKING_TEACHER %', to_char(clash at time zone new.timezone, 'YYYY-MM-DD HH24:MI'); end if;
    if rel_user is not null then
      select l.starts_at into clash from public.lessons l join public.students s on s.id = l.student_id
       where l.id <> new.id and l.status <> 'cancelled' and s.user_id = rel_user
         and tstzrange(l.starts_at, l.ends_at) && tstzrange(new.starts_at, new.ends_at) limit 1;
      if clash is not null then raise exception 'DOUBLE_BOOKING_STUDENT %', to_char(clash at time zone new.timezone, 'YYYY-MM-DD HH24:MI'); end if;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists lessons_guard on public.lessons;
create trigger lessons_guard before insert or update on public.lessons for each row execute function public.lessons_guard();

alter table public.lessons enable row level security;
drop policy if exists "lessons read" on public.lessons;
create policy "lessons read" on public.lessons for select to authenticated using (public.can_access_student(student_id));
drop policy if exists "lessons teacher insert" on public.lessons;
create policy "lessons teacher insert" on public.lessons for insert to authenticated
  with check (public.is_student_teacher(student_id) and created_by = (select auth.uid()));
drop policy if exists "lessons teacher update" on public.lessons;
create policy "lessons teacher update" on public.lessons for update to authenticated
  using (public.is_student_teacher(student_id)) with check (public.is_student_teacher(student_id));
drop policy if exists "lessons teacher delete" on public.lessons;
create policy "lessons teacher delete" on public.lessons for delete to authenticated using (public.is_student_teacher(student_id));
grant select, insert, update, delete on public.lessons to authenticated;

alter table public.lesson_teacher_notes enable row level security;
drop policy if exists "lesson notes teacher" on public.lesson_teacher_notes;
create policy "lesson notes teacher" on public.lesson_teacher_notes for all to authenticated
  using (exists (select 1 from public.lessons l where l.id = lesson_id and public.is_student_teacher(l.student_id)))
  with check (exists (select 1 from public.lessons l where l.id = lesson_id and public.is_student_teacher(l.student_id)));
grant select, insert, update, delete on public.lesson_teacher_notes to authenticated;

-- Plan one lesson or a weekly series in the given time zone (local wall time → DST-correct instants).
-- Runs with the caller's rights (RLS + guard apply); all-or-nothing.
create or replace function public.schedule_lessons(p_student uuid, p_local_start timestamp, p_tz text, p_minutes int,
                                                  p_weeks int default 1, p_language text default null, p_notes text default '')
returns setof public.lessons
language plpgsql set search_path = '' as $$
declare i int; s timestamptz; series uuid; row public.lessons;
begin
  if not public.is_student_teacher(p_student) then raise exception 'Not authorized'; end if;
  if not public.is_valid_timezone(p_tz) then raise exception 'Invalid time zone'; end if;
  if p_minutes is null or p_minutes < 10 or p_minutes > 480 then raise exception 'Invalid duration'; end if;
  if p_weeks is null or p_weeks < 1 or p_weeks > 52 then raise exception 'Invalid number of weeks'; end if;
  series := case when p_weeks > 1 then gen_random_uuid() end;
  for i in 0 .. p_weeks - 1 loop
    s := (p_local_start + make_interval(weeks => i)) at time zone p_tz;
    insert into public.lessons(student_id, teacher_id, starts_at, ends_at, timezone, language, series_id)
    values (p_student, (select auth.uid()), s, s + make_interval(mins => p_minutes), p_tz, nullif(p_language, ''), series)
    returning * into row;
    if coalesce(p_notes, '') <> '' then insert into public.lesson_teacher_notes(lesson_id, notes) values (row.id, p_notes); end if;
    return next row;
  end loop;
end; $$;

-- Move one lesson (local wall time in a zone → instant).
create or replace function public.reschedule_lesson(p_id uuid, p_local_start timestamp, p_tz text, p_minutes int)
returns public.lessons
language plpgsql set search_path = '' as $$
declare s timestamptz; row public.lessons;
begin
  if not public.is_valid_timezone(p_tz) then raise exception 'Invalid time zone'; end if;
  if p_minutes is null or p_minutes < 10 or p_minutes > 480 then raise exception 'Invalid duration'; end if;
  s := p_local_start at time zone p_tz;
  update public.lessons set starts_at = s, ends_at = s + make_interval(mins => p_minutes), timezone = p_tz
   where id = p_id returning * into row;
  if row.id is null then raise exception 'Not authorized'; end if;
  return row;
end; $$;

revoke all on function public.set_my_timezone(text), public.people_timezones(), public.schedule_lessons(uuid, timestamp, text, int, int, text, text), public.reschedule_lesson(uuid, timestamp, text, int) from public;
grant execute on function public.is_valid_timezone(text), public.set_my_timezone(text), public.people_timezones(), public.schedule_lessons(uuid, timestamp, text, int, int, text, text), public.reschedule_lesson(uuid, timestamp, text, int) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Link recordings, analyses and homework to a lesson (optional; a classroom
--    can still be opened without a planned lesson)
-- ---------------------------------------------------------------------
alter table public.lesson_recordings add column if not exists lesson_id uuid references public.lessons(id) on delete set null;
alter table public.lesson_analyses add column if not exists lesson_id uuid references public.lessons(id) on delete set null;
alter table public.assignments add column if not exists lesson_id uuid references public.lessons(id) on delete set null;
create index if not exists lesson_recordings_lesson_idx on public.lesson_recordings(lesson_id);
create index if not exists lesson_analyses_lesson_idx on public.lesson_analyses(lesson_id);
create index if not exists assignments_lesson_idx on public.assignments(lesson_id);

-- A linked lesson must belong to the same teacher–student relation.
create or replace function public.check_lesson_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.lesson_id is not null and not exists (select 1 from public.lessons l where l.id = new.lesson_id and l.student_id = new.student_id) then
    raise exception 'Lesson belongs to another student';
  end if;
  return new;
end; $$;
drop trigger if exists recordings_lesson_link on public.lesson_recordings;
create trigger recordings_lesson_link before insert or update of lesson_id on public.lesson_recordings for each row execute function public.check_lesson_link();
drop trigger if exists analyses_lesson_link on public.lesson_analyses;
create trigger analyses_lesson_link before insert or update of lesson_id on public.lesson_analyses for each row execute function public.check_lesson_link();
drop trigger if exists assignments_lesson_link on public.assignments;
create trigger assignments_lesson_link before insert or update of lesson_id on public.assignments for each row execute function public.check_lesson_link();

-- ---------------------------------------------------------------------
-- 4. AI consent afterwards for an existing recording. Each participant can only
--    give their OWN consent; analysis still requires both (v28 trigger).
-- ---------------------------------------------------------------------
create or replace function public.grant_ai_consent(p_recording uuid)
returns table(teacher_consent boolean, student_consent boolean)
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select r.student_id into sid from public.lesson_recordings r where r.id = p_recording;
  if sid is null then raise exception 'Recording not found'; end if;
  if public.is_student_teacher(sid) then
    update public.lesson_recordings set ai_consent_teacher_at = coalesce(ai_consent_teacher_at, now()) where id = p_recording;
  elsif public.is_linked_student(sid) then
    update public.lesson_recordings set ai_consent_student_at = coalesce(ai_consent_student_at, now()) where id = p_recording;
  else
    raise exception 'Not authorized';
  end if;
  return query select r.ai_consent_teacher_at is not null, r.ai_consent_student_at is not null from public.lesson_recordings r where r.id = p_recording;
end; $$;
revoke all on function public.grant_ai_consent(uuid) from public;
grant execute on function public.grant_ai_consent(uuid) to authenticated;
