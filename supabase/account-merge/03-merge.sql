-- =====================================================================
-- TeachyRooms — account consolidation, step 3: MERGE (only after 01 + 02 and your explicit approval)
--
-- Moves the LEARNER side of scipreimer@gmail.com to the main account scipio.reimeringer@gmail.com:
--   * student profiles linked to the other account are linked to the main account (user_id). The profile rows
--     themselves (lessons, words, recordings, analyses, homework, timestamps) stay exactly where they are — they hang
--     on the student profile id, which does not change. No duplicates: nothing is copied.
--   * practice results, homework submissions, game turns and self-study languages follow the learner.
-- Does NOT delete anything: the other account, its login and its profile row stay (you can remove it later
-- yourself, or keep it). Teacher data of the main account is not touched. One transaction: all or nothing.
-- Undo: 04-undo.sql (uses the backup of 02-backup.sql).
-- =====================================================================
begin;
do $$
declare m uuid; o uuid; n int;
begin
  select main_id, other_id into m, o from merge_backup_20261123.ids;               -- requires 02-backup.sql
  if m is null or o is null then raise exception 'One of the two accounts was not found'; end if;
  if m = o then raise exception 'Same account'; end if;

  -- 1. student profiles: link the learner to the main account. If the main account is ALREADY the learner of a profile
  --    with the same teacher and language, nothing is moved for that one (reported below, decided by hand).
  update public.students s set user_id = m, updated_at = now()
   where s.user_id = o
     and not exists (select 1 from public.students t where t.user_id = m and t.teacher_id = s.teacher_id
                     and public.relation_language(t.curriculum_subject, t.subject, t.lesson_language) = public.relation_language(s.curriculum_subject, s.subject, s.lesson_language));
  get diagnostics n = row_count; raise notice 'student profiles linked to the main account: %', n;

  -- 2. results and work of the learner
  update public.practice_sessions set user_id = m where user_id = o;            get diagnostics n = row_count; raise notice 'practice sessions: %', n;
  update public.homework_submissions set student_user_id = m where student_user_id = o; get diagnostics n = row_count; raise notice 'homework submissions: %', n;
  update public.game_rounds set explainer_user_id = m where explainer_user_id = o; get diagnostics n = row_count; raise notice 'game rounds: %', n;

  -- 3. self-study languages: only languages the main account does not have yet (no duplicates)
  update public.student_languages x set user_id = m where x.user_id = o
     and not exists (select 1 from public.student_languages y where y.user_id = m and y.language = x.language);
  get diagnostics n = row_count; raise notice 'self-study languages moved: %', n;

  -- 4. Portuguese checklist: only when the main account has none
  if not exists (select 1 from public.portuguese_checklists where user_id = m) then
    update public.portuguese_checklists set user_id = m where user_id = o;
  end if;
end $$;

-- what stays with the other account (should be empty or only things you want to keep there)
select 'left on the other account' as what, json_build_object(
  'student profiles', (select count(*) from public.students s, merge_backup_20261123.ids i where s.user_id = i.other_id),
  'self-study languages', (select count(*) from public.student_languages x, merge_backup_20261123.ids i where x.user_id = i.other_id),
  'teacher students', (select count(*) from public.students s, merge_backup_20261123.ids i where s.teacher_id = i.other_id)) as detail;
commit;
