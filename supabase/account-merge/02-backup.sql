-- =====================================================================
-- TeachyRooms — account consolidation, step 2: BACKUP (copies only, changes nothing that exists)
--
-- Situation (from 01-diagnose.sql, 23 Nov 2026):
--   scipio.reimeringer@gmail.com = MAIN account (stays): role teacher, already the LEARNER of "Scipio" (Portuguese,
--                                   other teacher) and "Scip test" (Dutch).
--   scipreimer@gmail.com          = TEACHER account (admin): 3 students, 75 lessons, recordings, analyses, AI usage.
-- 03-merge.sql moves the TEACHER side to the main account. This file copies every row it may change into the schema
-- "merge_backup_20261123", so 04-undo.sql can put everything back. Nothing is deleted or modified here.
-- Also make a full Supabase backup first (Dashboard → Database → Backups).
-- =====================================================================
create schema if not exists merge_backup_20261123;
revoke all on schema merge_backup_20261123 from public, anon, authenticated;
drop table if exists merge_backup_20261123.ids, merge_backup_20261123.profiles, merge_backup_20261123.students, merge_backup_20261123.student_invitations,
  merge_backup_20261123.lessons, merge_backup_20261123.lesson_sessions, merge_backup_20261123.lesson_recordings, merge_backup_20261123.lesson_analyses,
  merge_backup_20261123.curriculum_goals, merge_backup_20261123.classroom_states, merge_backup_20261123.game_rounds, merge_backup_20261123.ai_usage;

create table merge_backup_20261123.ids as
  select (select id from auth.users where lower(email) = 'scipio.reimeringer@gmail.com') as main_id,
         (select id from auth.users where lower(email) = 'scipreimer@gmail.com') as other_id, now() as taken_at;

create table merge_backup_20261123.profiles as select p.* from public.profiles p, merge_backup_20261123.ids i where p.id in (i.main_id, i.other_id);
create table merge_backup_20261123.students as select x.* from public.students x, merge_backup_20261123.ids i where x.teacher_id = i.other_id;
create table merge_backup_20261123.student_invitations as select x.* from public.student_invitations x, merge_backup_20261123.ids i where x.teacher_id = i.other_id;
create table merge_backup_20261123.lessons as select x.* from public.lessons x, merge_backup_20261123.ids i where x.teacher_id = i.other_id or x.created_by = i.other_id;
create table merge_backup_20261123.lesson_sessions as select x.* from public.lesson_sessions x, merge_backup_20261123.ids i where x.teacher_id = i.other_id;
create table merge_backup_20261123.lesson_recordings as select x.* from public.lesson_recordings x, merge_backup_20261123.ids i where x.created_by = i.other_id;
create table merge_backup_20261123.lesson_analyses as select x.id, x.created_by, x.approved_by from public.lesson_analyses x, merge_backup_20261123.ids i where x.created_by = i.other_id or x.approved_by = i.other_id;
create table merge_backup_20261123.curriculum_goals as select x.id, x.owner_teacher from public.curriculum_goals x, merge_backup_20261123.ids i where x.owner_teacher = i.other_id;
create table merge_backup_20261123.classroom_states as select x.student_id, x.updated_by from public.classroom_states x, merge_backup_20261123.ids i where x.updated_by = i.other_id;
create table merge_backup_20261123.game_rounds as select x.id, x.created_by, x.explainer_user_id from public.game_rounds x, merge_backup_20261123.ids i where x.created_by = i.other_id or x.explainer_user_id = i.other_id;
create table merge_backup_20261123.ai_usage as select x.id, x.user_id from public.ai_usage x, merge_backup_20261123.ids i where x.user_id = i.other_id;

select 'backup ready' as status,
  (select count(*) from merge_backup_20261123.students) as students, (select count(*) from merge_backup_20261123.lessons) as lessons,
  (select count(*) from merge_backup_20261123.lesson_recordings) as recordings, (select count(*) from merge_backup_20261123.lesson_analyses) as analyses,
  (select count(*) from merge_backup_20261123.ai_usage) as ai_usage;
