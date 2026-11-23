-- =====================================================================
-- TeachyRooms — account consolidation, step 2: BACKUP (copies only, changes nothing that exists)
--
-- Copies every row that 03-merge.sql may change into a separate schema "merge_backup_20261123". Nothing is
-- deleted or modified. Run this BEFORE 03-merge.sql. 04-undo.sql restores from these copies.
-- Make also a full Supabase backup first: Dashboard → Database → Backups (or Project Settings → Backups).
-- =====================================================================
create schema if not exists merge_backup_20261123;
revoke all on schema merge_backup_20261123 from public, anon, authenticated;

create table merge_backup_20261123.ids as
  select (select id from auth.users where lower(email) = 'scipio.reimeringer@gmail.com') as main_id,
         (select id from auth.users where lower(email) = 'scipreimer@gmail.com') as other_id, now() as taken_at;

create table merge_backup_20261123.students as
  select s.* from public.students s, merge_backup_20261123.ids i where s.user_id in (i.main_id, i.other_id) or s.teacher_id in (i.main_id, i.other_id);
create table merge_backup_20261123.student_languages as
  select x.* from public.student_languages x, merge_backup_20261123.ids i where x.user_id in (i.main_id, i.other_id);
create table merge_backup_20261123.practice_sessions as
  select x.* from public.practice_sessions x, merge_backup_20261123.ids i where x.user_id = i.other_id;
create table merge_backup_20261123.homework_submissions as
  select x.* from public.homework_submissions x, merge_backup_20261123.ids i where x.student_user_id = i.other_id;
create table merge_backup_20261123.portuguese_checklists as
  select x.* from public.portuguese_checklists x, merge_backup_20261123.ids i where x.user_id in (i.main_id, i.other_id);
create table merge_backup_20261123.game_rounds as
  select x.* from public.game_rounds x, merge_backup_20261123.ids i where x.explainer_user_id = i.other_id;
create table merge_backup_20261123.profiles as
  select p.* from public.profiles p, merge_backup_20261123.ids i where p.id in (i.main_id, i.other_id);

select 'backup ready' as status,
  (select count(*) from merge_backup_20261123.students) as students,
  (select count(*) from merge_backup_20261123.practice_sessions) as practice_sessions,
  (select count(*) from merge_backup_20261123.homework_submissions) as submissions;
