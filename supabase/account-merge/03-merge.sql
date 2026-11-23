-- =====================================================================
-- TeachyRooms — account consolidation, step 3: MERGE (only after 01 + 02 and your explicit approval)
--
-- Moves the TEACHER side of scipreimer@gmail.com to the main account scipio.reimeringer@gmail.com, so ONE login
-- has: teacher dashboard + admin, the 3 students with their 75 lessons, recordings, AI reports, homework and
-- statistics, AND the own learning environment (the main account is already the learner of "Scipio" (pt) and
-- "Scip test" (nl)).
--
-- What changes (only these links — the rows, their content and their timestamps stay as they are):
--   * profiles: main account role → admin (was teacher); teaching languages / time zone / interface language /
--     name copied from the other account only where the main account has none
--   * students.teacher_id, student_invitations.teacher_id           → main account
--   * lessons.teacher_id + created_by, lesson_sessions.teacher_id    → main account (update triggers paused so
--     updated_at, bookings and Google Calendar queues are NOT touched)
--   * lesson_recordings.created_by, lesson_analyses.created_by/approved_by, curriculum_goals.owner_teacher,
--     classroom_states.updated_by, game_rounds.created_by/explainer, ai_usage.user_id → main account
-- What does NOT change:
--   * nothing is deleted or copied; the other account, its login and its profile stay (role stays admin)
--   * the Google Calendar connection of the other account stays where it is and is NOT moved: lessons of the main
--     account are therefore no longer synchronised to that (old/Preply) calendar. Connect the right Google account
--     later from the main account.
--   * storage files (recordings, images) are stored per student, not per account: nothing to move
-- One transaction: all or nothing. Undo: 04-undo.sql.
-- =====================================================================
begin;
alter table public.lessons disable trigger lessons_guard;
alter table public.lessons disable trigger gcal_lessons_outbox;
alter table public.lesson_analyses disable trigger analyses_consent;
alter table public.lesson_analyses disable trigger analyses_test_guard;
do $$
declare m uuid; o uuid; n int;
begin
  select main_id, other_id into m, o from merge_backup_20261123.ids;               -- requires 02-backup.sql
  if m is null or o is null then raise exception 'One of the two accounts was not found'; end if;
  if m = o then raise exception 'Same account'; end if;

  -- profile of the main account: admin + settings it does not have yet
  update public.profiles p set role = 'admin',
    teaching_languages = case when coalesce(array_length(p.teaching_languages, 1), 0) = 0 then q.teaching_languages else p.teaching_languages end,
    timezone = coalesce(p.timezone, q.timezone), preferred_language = coalesce(p.preferred_language, q.preferred_language),
    full_name = coalesce(nullif(p.full_name, ''), q.full_name)
   from public.profiles q where p.id = m and q.id = o;

  update public.students set teacher_id = m where teacher_id = o;                 get diagnostics n = row_count; raise notice 'students: %', n;
  update public.student_invitations set teacher_id = m where teacher_id = o;
  update public.lessons set teacher_id = m where teacher_id = o;                   get diagnostics n = row_count; raise notice 'lessons: %', n;
  update public.lessons set created_by = m where created_by = o;
  update public.lesson_sessions set teacher_id = m where teacher_id = o;
  update public.lesson_recordings set created_by = m where created_by = o;         get diagnostics n = row_count; raise notice 'recordings: %', n;
  update public.lesson_analyses set created_by = m where created_by = o;           get diagnostics n = row_count; raise notice 'analyses: %', n;
  update public.lesson_analyses set approved_by = m where approved_by = o;
  update public.curriculum_goals set owner_teacher = m where owner_teacher = o;
  update public.classroom_states set updated_by = m where updated_by = o;
  update public.game_rounds set created_by = m where created_by = o;
  update public.game_rounds set explainer_user_id = m where explainer_user_id = o;
  update public.ai_usage set user_id = m where user_id = o;                        get diagnostics n = row_count; raise notice 'ai usage rows: %', n;
end $$;
alter table public.lessons enable trigger lessons_guard;
alter table public.lessons enable trigger gcal_lessons_outbox;
alter table public.lesson_analyses enable trigger analyses_consent;
alter table public.lesson_analyses enable trigger analyses_test_guard;

-- check: nothing of the teaching side is left on the other account
select 'left on the other account' as what, json_build_object(
  'students as teacher', (select count(*) from public.students s, merge_backup_20261123.ids i where s.teacher_id = i.other_id),
  'lessons as teacher', (select count(*) from public.lessons l, merge_backup_20261123.ids i where l.teacher_id = i.other_id),
  'recordings', (select count(*) from public.lesson_recordings r, merge_backup_20261123.ids i where r.created_by = i.other_id),
  'analyses', (select count(*) from public.lesson_analyses a, merge_backup_20261123.ids i where a.created_by = i.other_id),
  'main account role', (select role from public.profiles p, merge_backup_20261123.ids i where p.id = i.main_id)) as detail;
commit;
