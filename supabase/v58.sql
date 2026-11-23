-- =====================================================================
-- TeachyRooms v58 — a recording that is saved LATER (the lesson was left by closing the tab, the app or the
-- browser; the classroom saves it the next time the teacher opens it) is still linked to its own lesson.
--
-- Run ONCE in the Supabase SQL Editor (after v57.sql). NON-DESTRUCTIVE: one function is replaced; no table and no
-- existing row is changed. Idempotent: safe to run twice.
--
-- Until now a recording was only linked to a lesson session when it was saved during or up to 30 minutes after that
-- session. Now, when no session matches in time, the session of the SAME student with the recording's own planned
-- lesson (lesson_id) — or else of the recording's own lesson day — is used, if it has no recording yet.
-- =====================================================================
create or replace function public.lesson_sessions_link_recording() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select o.id into sid from public.lesson_sessions o
   where o.student_id = new.student_id and o.recording_id is null
     and new.created_at between o.started_at - interval '5 minutes' and o.ended_at + interval '30 minutes'
   order by o.ended_at desc limit 1;
  if sid is null and new.lesson_id is not null then
    select o.id into sid from public.lesson_sessions o
     where o.student_id = new.student_id and o.recording_id is null and o.lesson_id = new.lesson_id
     order by o.joint_seconds desc limit 1;
  end if;
  if sid is null and new.lesson_date is not null then
    select o.id into sid from public.lesson_sessions o
     where o.student_id = new.student_id and o.recording_id is null and o.lesson_date = new.lesson_date
     order by o.joint_seconds desc limit 1;
  end if;
  if sid is not null then update public.lesson_sessions x set recording_id = new.id, updated_at = now() where x.id = sid; end if;
  return new;
end; $$;
