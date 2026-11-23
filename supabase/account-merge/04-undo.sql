-- =====================================================================
-- TeachyRooms — account consolidation, step 4: UNDO (puts every changed link back from the backup of 02-backup.sql)
-- Only the columns that 03-merge.sql changes are restored. Rows created after the merge are not touched.
-- =====================================================================
begin;
update public.students s set user_id = b.user_id from merge_backup_20261123.students b where s.id = b.id and s.user_id is distinct from b.user_id;
update public.practice_sessions s set user_id = b.user_id from merge_backup_20261123.practice_sessions b where s.id = b.id;
update public.homework_submissions s set student_user_id = b.student_user_id from merge_backup_20261123.homework_submissions b where s.id = b.id;
update public.game_rounds s set explainer_user_id = b.explainer_user_id from merge_backup_20261123.game_rounds b where s.id = b.id;
update public.student_languages s set user_id = b.user_id from merge_backup_20261123.student_languages b where s.id = b.id;
update public.portuguese_checklists s set user_id = b.user_id from merge_backup_20261123.portuguese_checklists b where s.user_id = (select main_id from merge_backup_20261123.ids)
  and b.user_id = (select other_id from merge_backup_20261123.ids) and not exists (select 1 from merge_backup_20261123.portuguese_checklists c where c.user_id = (select main_id from merge_backup_20261123.ids));
commit;
select 'undo done' as status;
