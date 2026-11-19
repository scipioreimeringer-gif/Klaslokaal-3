-- =====================================================================
-- TeachyRooms v43 — automatic lesson registration from real joint presence.
--
-- Run ONCE in the Supabase SQL Editor AFTER v40.sql.
-- NON-DESTRUCTIVE: only adds a table, columns-free triggers and functions.
-- No DROP TABLE / DROP COLUMN / DELETE / UPDATE of existing rows.
-- Idempotent: safe to run twice.
--
-- A lesson counts only when the teacher AND the student were connected in the
-- live classroom at the same time for at least lesson_min_joint_seconds()
-- (default 120 s). A planned lesson alone, a teacher alone, or a recording
-- without joint presence never counts. A recording is optional.
-- =====================================================================

create table if not exists public.lesson_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,   -- = one teacher–student(–language) relation
  teacher_id uuid not null references auth.users(id) on delete cascade,
  session_key text not null,                         -- stable per classroom session on the teacher's device (refresh/reconnect keep it)
  lesson_id uuid references public.lessons(id) on delete set null,             -- planned lesson in the agenda, when it matches
  language text,
  lesson_date date not null,
  started_at timestamptz not null default now(),     -- first moment of joint presence
  ended_at timestamptz not null default now(),       -- last heartbeat with joint presence
  joint_seconds integer not null default 0 check (joint_seconds >= 0),
  registered_at timestamptz,                         -- set once joint_seconds reached the threshold; only these rows are lessons
  recording_id uuid references public.lesson_recordings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, session_key),
  constraint lesson_sessions_key check (session_key ~ '^[A-Za-z0-9_-]{8,64}$'),
  constraint lesson_sessions_language check (language is null or language ~ '^[a-z]{2}$')
);
create index if not exists lesson_sessions_student_idx on public.lesson_sessions(student_id, started_at desc);
create index if not exists lesson_sessions_teacher_idx on public.lesson_sessions(teacher_id, started_at desc);
create index if not exists lesson_sessions_lesson_idx on public.lesson_sessions(lesson_id);

alter table public.lesson_sessions enable row level security;
-- Read: the teacher of the relation and the linked student (after unlinking the student no longer sees them;
-- the rows stay with the teacher). Writes only through lesson_presence() below.
drop policy if exists "sessions read" on public.lesson_sessions;
create policy "sessions read" on public.lesson_sessions for select to authenticated
  using (public.can_access_student(student_id));
revoke insert, update, delete on public.lesson_sessions from authenticated, anon;

-- The threshold in one place (change it here; the classroom reads it from the heartbeat answer).
create or replace function public.lesson_min_joint_seconds() returns integer
language sql immutable set search_path = '' as $$ select 120 $$;
-- After this much silence a session is closed; a later heartbeat with the same key starts a new lesson.
create or replace function public.lesson_grace_seconds() returns integer
language sql immutable set search_path = '' as $$ select 900 $$;

-- Heartbeat from the teacher's classroom (about every 30 s while the student is connected, never per second).
-- joint = joint presence in seconds counted on the teacher's device for this session (monotonic).
create or replace function public.lesson_presence(sid uuid, skey text, joint integer, planned uuid default null, day date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare rel record; s public.lesson_sessions; j integer; d date; lid uuid; lang text; minj integer := public.lesson_min_joint_seconds();
begin
  if not public.is_student_teacher(sid) then raise exception 'Not authorized'; end if;
  select st.teacher_id, st.user_id, st.curriculum_subject into rel from public.students st where st.id = sid;
  if rel.user_id is null then raise exception 'NO_STUDENT_ACCOUNT'; end if;       -- no lesson without a linked student
  if skey is null or skey !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'Invalid session key'; end if;
  j := greatest(0, least(coalesce(joint, 0), 86400));
  d := case when day is not null and day between current_date - 1 and current_date + 1 then day else current_date end;

  select * into s from public.lesson_sessions x where x.student_id = sid and x.session_key = skey for update;
  if found then
    if s.ended_at < now() - make_interval(secs => public.lesson_grace_seconds()) then raise exception 'SESSION_EXPIRED'; end if;
    -- never more joint time than wall-clock time since the start (+ one heartbeat of slack)
    j := least(greatest(s.joint_seconds, j), floor(extract(epoch from now() - s.started_at))::integer + 60);
    update public.lesson_sessions set joint_seconds = j, ended_at = now(), updated_at = now(),
      registered_at = coalesce(registered_at, case when j >= minj then now() end)
     where id = s.id returning * into s;
  else
    j := least(j, 60);                                -- a new session starts with at most one heartbeat of joint time
    if planned is not null and exists(select 1 from public.lessons l where l.id = planned and l.student_id = sid and l.status <> 'cancelled') then
      lid := planned;
    else                                              -- reliable match only: a planned lesson of this relation around now, not yet used
      select l.id into lid from public.lessons l
       where l.student_id = sid and l.status <> 'cancelled'
         and now() between l.starts_at - interval '30 minutes' and l.ends_at + interval '30 minutes'
         and not exists(select 1 from public.lesson_sessions o where o.lesson_id = l.id and o.registered_at is not null)
       order by abs(extract(epoch from l.starts_at - now())) limit 1;
    end if;
    select coalesce(l.language, null) into lang from public.lessons l where l.id = lid;
    lang := coalesce(lang, case when rel.curriculum_subject ~ '^[a-z]{2}$' then rel.curriculum_subject end);
    insert into public.lesson_sessions(student_id, teacher_id, session_key, lesson_id, language, lesson_date, started_at, ended_at, joint_seconds, registered_at)
    values (sid, rel.teacher_id, skey, lid, lang, d, now() - make_interval(secs => j), now(), j, case when j >= minj then now() end)
    returning * into s;
  end if;
  return jsonb_build_object('id', s.id, 'joint_seconds', s.joint_seconds, 'registered', s.registered_at is not null, 'threshold', minj, 'lesson_id', s.lesson_id);
end; $$;
revoke all on function public.lesson_presence(uuid, text, integer, uuid, date) from public;
grant execute on function public.lesson_presence(uuid, text, integer, uuid, date) to authenticated;
revoke all on function public.lesson_min_joint_seconds(), public.lesson_grace_seconds() from public;
grant execute on function public.lesson_min_joint_seconds(), public.lesson_grace_seconds() to authenticated;

-- Recording status: a recording made during a session is linked to it (the recording stays optional).
create or replace function public.lesson_sessions_link_recording() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.lesson_sessions x set recording_id = new.id, updated_at = now()
   where x.id = (select o.id from public.lesson_sessions o
                  where o.student_id = new.student_id and o.recording_id is null
                    and new.created_at between o.started_at - interval '5 minutes' and o.ended_at + interval '30 minutes'
                  order by o.ended_at desc limit 1);
  return new;
end; $$;
drop trigger if exists lesson_sessions_link_recording on public.lesson_recordings;
create trigger lesson_sessions_link_recording after insert on public.lesson_recordings
  for each row execute function public.lesson_sessions_link_recording();
