-- =====================================================================
-- TeachyRooms — account consolidation, step 4: UNDO (puts every link that 03-merge.sql changed back, from the backup
-- of 02-backup.sql). Only those columns are restored; rows created after the merge are not touched.
-- =====================================================================
begin;
alter table public.lessons disable trigger lessons_guard;
alter table public.lessons disable trigger gcal_lessons_outbox;
alter table public.lesson_analyses disable trigger analyses_consent;
alter table public.lesson_analyses disable trigger analyses_test_guard;
update public.profiles p set role = b.role, teaching_languages = b.teaching_languages, timezone = b.timezone, preferred_language = b.preferred_language, full_name = b.full_name
  from merge_backup_20261123.profiles b where p.id = b.id;
update public.students x set teacher_id = b.teacher_id from merge_backup_20261123.students b where x.id = b.id;
update public.student_invitations x set teacher_id = b.teacher_id from merge_backup_20261123.student_invitations b where x.id = b.id;
update public.lessons x set teacher_id = b.teacher_id, created_by = b.created_by from merge_backup_20261123.lessons b where x.id = b.id;
update public.lesson_sessions x set teacher_id = b.teacher_id from merge_backup_20261123.lesson_sessions b where x.id = b.id;
update public.lesson_recordings x set created_by = b.created_by from merge_backup_20261123.lesson_recordings b where x.id = b.id;
update public.lesson_analyses x set created_by = b.created_by, approved_by = b.approved_by from merge_backup_20261123.lesson_analyses b where x.id = b.id;
update public.curriculum_goals x set owner_teacher = b.owner_teacher from merge_backup_20261123.curriculum_goals b where x.id = b.id;
update public.classroom_states x set updated_by = b.updated_by from merge_backup_20261123.classroom_states b where x.student_id = b.student_id;
update public.game_rounds x set created_by = b.created_by, explainer_user_id = b.explainer_user_id from merge_backup_20261123.game_rounds b where x.id = b.id;
update public.ai_usage x set user_id = b.user_id from merge_backup_20261123.ai_usage b where x.id = b.id;
alter table public.lessons enable trigger lessons_guard;
alter table public.lessons enable trigger gcal_lessons_outbox;
alter table public.lesson_analyses enable trigger analyses_consent;
alter table public.lesson_analyses enable trigger analyses_test_guard;
commit;
select 'undo done' as status;
