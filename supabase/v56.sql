-- =====================================================================
-- TeachyRooms v56 — AI lesson reports: automatic, published at once, visible progress, consent afterwards.
--
-- Run ONCE in the Supabase SQL Editor AFTER v48.sql (v52 may come in between).
-- NON-DESTRUCTIVE: adds two functions. No table, no row and no policy is changed; nothing is deleted. Idempotent.
--
-- * student_analysis_status(sid): per recording of the student's own lessons ONLY the processing state (no transcript,
--   no audio, no draft content): no consent yet · queued · transcribing · analysing · available · failed · hidden.
--   The report itself stays readable only through student_lesson_summaries (published reports).
-- * give_ai_consent(p_recording): the linked student (or the teacher) gives AI consent afterwards for an existing
--   recording of their own lesson. Never for anyone else's recording. The existing consent check on lesson_analyses
--   (both consents required) stays in force.
-- =====================================================================

create or replace function public.student_analysis_status(sid uuid)
returns table(recording_id uuid, lesson_id uuid, lesson_date date, state text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, coalesce(a.lesson_id, r.lesson_id), coalesce(a.lesson_date, r.lesson_date, r.created_at::date),
    case
      when a.id is null and (r.ai_consent_teacher_at is null or r.ai_consent_student_at is null) then 'no_consent'
      when a.id is null then 'queued'
      when a.status = 'approved' then 'available'
      when a.status = 'failed' then 'failed'
      when coalesce((a.stage_detail->>'hidden')::boolean, false) then 'hidden'
      when a.transcript is null then 'transcribing'
      else 'analysing' end,
    coalesce(a.updated_at, r.created_at)
  from public.lesson_recordings r
  left join public.lesson_analyses a on a.recording_id = r.id and not coalesce(a.is_test, false)
  where r.student_id = sid and public.can_access_student(sid)
  order by r.created_at desc;
$$;
revoke all on function public.student_analysis_status(uuid) from public, anon;
grant execute on function public.student_analysis_status(uuid) to authenticated;

create or replace function public.give_ai_consent(p_recording uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.lesson_recordings;
begin
  select * into r from public.lesson_recordings where id = p_recording;
  if not found then raise exception 'Recording not found'; end if;
  if public.is_linked_student(r.student_id) then
    update public.lesson_recordings set ai_consent_student_at = coalesce(ai_consent_student_at, now()) where id = p_recording;
  end if;
  if public.is_student_teacher(r.student_id) then
    update public.lesson_recordings set ai_consent_teacher_at = coalesce(ai_consent_teacher_at, now()) where id = p_recording;
  end if;
  if not (public.is_linked_student(r.student_id) or public.is_student_teacher(r.student_id)) then raise exception 'Not authorized'; end if;
  select * into r from public.lesson_recordings where id = p_recording;
  return case when r.ai_consent_teacher_at is not null and r.ai_consent_student_at is not null then 'both' else 'waiting' end;
end; $$;
revoke all on function public.give_ai_consent(uuid) from public, anon;
grant execute on function public.give_ai_consent(uuid) to authenticated;
