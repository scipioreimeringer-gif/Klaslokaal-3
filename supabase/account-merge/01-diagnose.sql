-- =====================================================================
-- TeachyRooms — account consolidation, step 1: DIAGNOSE (read-only, changes nothing)
--
-- Run in the Supabase SQL Editor. It only SELECTs. Paste the result (or a screenshot) back to the developer;
-- the merge in 03-merge.sql is written for exactly what this shows.
--
--   main account   (stays):   scipio.reimeringer@gmail.com
--   other account  (source):  scipreimer@gmail.com
-- =====================================================================
with acc as (
  select (select id from auth.users where lower(email) = 'scipio.reimeringer@gmail.com') as main_id,
         (select id from auth.users where lower(email) = 'scipreimer@gmail.com') as other_id
)
select 'accounts' as what, json_build_object(
    'main', (select json_build_object('id', u.id, 'email', u.email, 'role', p.role) from auth.users u left join public.profiles p on p.id = u.id, acc where u.id = acc.main_id),
    'other', (select json_build_object('id', u.id, 'email', u.email, 'role', p.role) from auth.users u left join public.profiles p on p.id = u.id, acc where u.id = acc.other_id)) as detail
union all
-- student profiles (one row per teacher + language): who teaches, who is the linked learner
select 'student profiles', coalesce(json_agg(json_build_object('student_id', s.id, 'name', s.name, 'email', s.email, 'subject', s.subject,
    'language', public.relation_language(s.curriculum_subject, s.subject, s.lesson_language), 'level', s.level, 'teacher_is', case when s.teacher_id = acc.main_id then 'MAIN' when s.teacher_id = acc.other_id then 'OTHER' else 'someone else' end,
    'learner_is', case when s.user_id = acc.main_id then 'MAIN' when s.user_id = acc.other_id then 'OTHER' when s.user_id is null then 'not linked' else 'someone else' end,
    'lessons', (select count(*) from public.lessons l where l.student_id = s.id), 'words', (select count(*) from public.vocab_items v where v.student_id = s.id),
    'practice', (select count(*) from public.practice_sessions x where x.student_id = s.id), 'recordings', (select count(*) from public.lesson_recordings r where r.student_id = s.id))), '[]')
  from public.students s, acc where s.user_id in (acc.main_id, acc.other_id) or lower(s.email) in ('scipio.reimeringer@gmail.com', 'scipreimer@gmail.com')
union all
-- every row that points at the OTHER account directly (by user id)
select 'rows owned by the other account', json_build_object(
    'student_languages', (select count(*) from public.student_languages, acc where user_id = acc.other_id),
    'practice_sessions', (select count(*) from public.practice_sessions, acc where user_id = acc.other_id),
    'homework_submissions', (select count(*) from public.homework_submissions, acc where student_user_id = acc.other_id),
    'portuguese_checklists', (select count(*) from public.portuguese_checklists, acc where user_id = acc.other_id),
    'game_rounds (explainer)', (select count(*) from public.game_rounds, acc where explainer_user_id = acc.other_id),
    'lessons as teacher', (select count(*) from public.lessons, acc where teacher_id = acc.other_id),
    'students as teacher', (select count(*) from public.students, acc where teacher_id = acc.other_id),
    'calendar_connections', (select count(*) from public.calendar_connections, acc where teacher_id = acc.other_id),
    'ai_usage', (select count(*) from public.ai_usage, acc where user_id = acc.other_id))
union all
select 'self-study languages', coalesce(json_agg(json_build_object('account', case when user_id = acc.main_id then 'MAIN' else 'OTHER' end, 'language', language, 'level', level)), '[]')
  from public.student_languages, acc where user_id in (acc.main_id, acc.other_id);
