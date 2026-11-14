-- =====================================================================
-- TeachyRooms v27 — per-student classroom storage, multi-role accounts,
-- lesson history, vocabulary, recordings.
--
-- Run ONCE in the Supabase SQL Editor of your EXISTING project, after
-- schema.sql, v21-approval.sql, v22-invitations.sql and v23-homework.sql.
--
-- SAFE / NON-DESTRUCTIVE:
--  * no DROP TABLE, no DROP COLUMN, no DELETE, no UPDATE of existing rows
--    (except filling the new students.room_code column for existing rows)
--  * every statement is idempotent: running it twice is harmless
--  * it also (re)creates the v26 tables, because v26.sql contained a
--    syntax error and may never have run successfully
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Extra columns on students (all with defaults, existing data kept)
-- ---------------------------------------------------------------------
alter table public.students add column if not exists level text not null default '';
alter table public.students add column if not exists lesson_language text not null default 'nl';
alter table public.students add column if not exists about text not null default '';
-- Private video-room code per student (used by the live classroom).
-- Visible only to the student's teacher and the linked student account.
alter table public.students add column if not exists room_code text;
update public.students
   set room_code = substr(replace(gen_random_uuid()::text,'-',''),1,20)
 where room_code is null;
alter table public.students alter column room_code set default substr(replace(gen_random_uuid()::text,'-',''),1,20);
alter table public.students alter column room_code set not null;
create unique index if not exists students_room_code_unique on public.students(room_code);

-- ---------------------------------------------------------------------
-- 2. Access helper functions (SECURITY DEFINER avoids RLS recursion)
-- ---------------------------------------------------------------------
create or replace function public.is_student_teacher(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.students s
                where s.id = sid and s.teacher_id = (select auth.uid()))
         and public.is_teacher();
$$;
create or replace function public.is_linked_student(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.students s
                where s.id = sid and s.user_id = (select auth.uid()));
$$;
create or replace function public.can_access_student(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_student_teacher(sid) or public.is_linked_student(sid);
$$;
-- Safe text -> uuid conversion for storage paths (returns null instead of error)
create or replace function public.try_uuid(t text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return t::uuid;
exception when others then
  return null;
end; $$;
revoke all on function public.is_student_teacher(uuid), public.is_linked_student(uuid),
  public.can_access_student(uuid), public.try_uuid(text) from public;
grant execute on function public.is_student_teacher(uuid), public.is_linked_student(uuid),
  public.can_access_student(uuid), public.try_uuid(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. v26 tables (re-created safely; v26.sql had a syntax error)
-- ---------------------------------------------------------------------
create table if not exists public.student_lesson_spaces (
  student_id uuid primary key references public.students(id) on delete cascade,
  shared_board text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.student_lesson_spaces enable row level security;
drop policy if exists "lesson space read" on public.student_lesson_spaces;
create policy "lesson space read" on public.student_lesson_spaces for select to authenticated
  using (public.can_access_student(student_id));
drop policy if exists "lesson space insert" on public.student_lesson_spaces;
create policy "lesson space insert" on public.student_lesson_spaces for insert to authenticated
  with check (public.can_access_student(student_id));
drop policy if exists "lesson space update" on public.student_lesson_spaces;
create policy "lesson space update" on public.student_lesson_spaces for update to authenticated
  using (public.can_access_student(student_id)) with check (public.can_access_student(student_id));

create table if not exists public.teacher_private_notes (
  student_id uuid primary key references public.students(id) on delete cascade,
  notes text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.teacher_private_notes enable row level security;
drop policy if exists "private teacher read" on public.teacher_private_notes;
create policy "private teacher read" on public.teacher_private_notes for select to authenticated
  using (public.is_student_teacher(student_id));
drop policy if exists "private teacher insert" on public.teacher_private_notes;
create policy "private teacher insert" on public.teacher_private_notes for insert to authenticated
  with check (public.is_student_teacher(student_id));
drop policy if exists "private teacher update" on public.teacher_private_notes;
create policy "private teacher update" on public.teacher_private_notes for update to authenticated
  using (public.is_student_teacher(student_id)) with check (public.is_student_teacher(student_id));

create table if not exists public.portuguese_checklists (
  user_id uuid primary key references auth.users(id) on delete cascade,
  completed jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.portuguese_checklists enable row level security;
drop policy if exists "own checklist read" on public.portuguese_checklists;
create policy "own checklist read" on public.portuguese_checklists for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own checklist insert" on public.portuguese_checklists;
create policy "own checklist insert" on public.portuguese_checklists for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "own checklist update" on public.portuguese_checklists;
create policy "own checklist update" on public.portuguese_checklists for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 4. Classroom state per student: drawn whiteboards + canvas pages
--    Read: teacher + linked student. Write: only that student's teacher
--    (during the live lesson the student's drawings reach the teacher's
--    browser in real time and are saved from there).
-- ---------------------------------------------------------------------
create table if not exists public.classroom_states (
  student_id uuid primary key references public.students(id) on delete cascade,
  board jsonb,
  canvas jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.classroom_states enable row level security;
drop policy if exists "classroom read" on public.classroom_states;
create policy "classroom read" on public.classroom_states for select to authenticated
  using (public.can_access_student(student_id));
drop policy if exists "classroom insert" on public.classroom_states;
create policy "classroom insert" on public.classroom_states for insert to authenticated
  with check (public.is_student_teacher(student_id));
drop policy if exists "classroom update" on public.classroom_states;
create policy "classroom update" on public.classroom_states for update to authenticated
  using (public.is_student_teacher(student_id)) with check (public.is_student_teacher(student_id));

-- ---------------------------------------------------------------------
-- 5. Lesson entries: one row per student per lesson day
--    (lesson notes, vocabulary, homework). Builds lesson history+progress.
-- ---------------------------------------------------------------------
create table if not exists public.lesson_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_date date not null,
  notes text not null default '',
  homework text not null default '',
  words jsonb not null default '[]'::jsonb,
  sorted jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, lesson_date)
);
create index if not exists lesson_entries_student_idx on public.lesson_entries(student_id, lesson_date desc);
alter table public.lesson_entries enable row level security;
drop policy if exists "lessons read" on public.lesson_entries;
create policy "lessons read" on public.lesson_entries for select to authenticated
  using (public.can_access_student(student_id));
drop policy if exists "lessons insert" on public.lesson_entries;
create policy "lessons insert" on public.lesson_entries for insert to authenticated
  with check (public.is_student_teacher(student_id));
drop policy if exists "lessons update" on public.lesson_entries;
create policy "lessons update" on public.lesson_entries for update to authenticated
  using (public.is_student_teacher(student_id)) with check (public.is_student_teacher(student_id));
drop policy if exists "lessons delete" on public.lesson_entries;
create policy "lessons delete" on public.lesson_entries for delete to authenticated
  using (public.is_student_teacher(student_id));

-- ---------------------------------------------------------------------
-- 6. Lesson recordings (audio) with recorded consent of both participants
-- ---------------------------------------------------------------------
create table if not exists public.lesson_recordings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null default 'audio/webm',
  size_bytes bigint not null default 0,
  duration_seconds integer not null default 0,
  teacher_consent_at timestamptz not null,
  student_consent_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint recording_path_matches_student check (split_part(storage_path,'/',1) = student_id::text)
);
create index if not exists lesson_recordings_student_idx on public.lesson_recordings(student_id, created_at desc);
alter table public.lesson_recordings enable row level security;
drop policy if exists "recordings read" on public.lesson_recordings;
create policy "recordings read" on public.lesson_recordings for select to authenticated
  using (public.can_access_student(student_id));
drop policy if exists "recordings insert" on public.lesson_recordings;
create policy "recordings insert" on public.lesson_recordings for insert to authenticated
  with check (public.is_student_teacher(student_id) and created_by = (select auth.uid()));
-- Both the teacher and the recorded student may delete a recording.
drop policy if exists "recordings delete" on public.lesson_recordings;
create policy "recordings delete" on public.lesson_recordings for delete to authenticated
  using (public.can_access_student(student_id));

-- Private storage bucket. Path layout: <student_id>/<random>.webm
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', false, 52428800,
        array['audio/webm','audio/ogg','audio/mp4','audio/mpeg','video/webm'])
on conflict (id) do nothing;
drop policy if exists "recordings upload by teacher" on storage.objects;
create policy "recordings upload by teacher" on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings'
              and public.is_student_teacher(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists "recordings read by participants" on storage.objects;
create policy "recordings read by participants" on storage.objects for select to authenticated
  using (bucket_id = 'recordings'
         and public.can_access_student(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists "recordings delete by participants" on storage.objects;
create policy "recordings delete by participants" on storage.objects for delete to authenticated
  using (bucket_id = 'recordings'
         and public.can_access_student(public.try_uuid((storage.foldername(name))[1])));

-- ---------------------------------------------------------------------
-- 7. One account, several roles: link teacher-created student profiles
--    to the logged-in account WITH the student's explicit consent.
--    Matching uses the verified e-mail of auth.users, never client input.
-- ---------------------------------------------------------------------
create or replace function public.my_pending_student_links()
returns table(student_id uuid, student_name text, subject text, teacher_name text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.subject, coalesce(nullif(p.full_name,''), p.email)
    from public.students s
    join public.profiles p on p.id = s.teacher_id
    join auth.users u on u.id = (select auth.uid())
   where s.user_id is null
     and u.email is not null
     and u.email_confirmed_at is not null
     and lower(s.email) = lower(u.email);
$$;
create or replace function public.accept_student_link(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare account_email text; confirmed timestamptz;
begin
  if (select auth.uid()) is null then raise exception 'Log in first'; end if;
  select lower(email), email_confirmed_at into account_email, confirmed from auth.users where id = (select auth.uid());
  if account_email is null or confirmed is null then raise exception 'E-mail address not verified'; end if;
  update public.students set user_id = (select auth.uid()), updated_at = now()
   where id = target and user_id is null and lower(email) = account_email;
  if not found then raise exception 'No matching student profile'; end if;
end; $$;
-- Names of my teachers (profiles RLS only exposes your own profile).
create or replace function public.my_teachers()
returns table(student_id uuid, teacher_name text)
language sql stable security definer set search_path = '' as $$
  select s.id, coalesce(nullif(p.full_name,''), p.email)
    from public.students s join public.profiles p on p.id = s.teacher_id
   where s.user_id = (select auth.uid());
$$;
revoke all on function public.my_pending_student_links(), public.accept_student_link(uuid), public.my_teachers() from public;
grant execute on function public.my_pending_student_links(), public.accept_student_link(uuid), public.my_teachers() to authenticated;

-- ---------------------------------------------------------------------
-- 8. Students may never change their own student record.
--    (No UPDATE/DELETE policy exists for students on public.students;
--    linking goes only through the checked functions above and v22.)
-- ---------------------------------------------------------------------
