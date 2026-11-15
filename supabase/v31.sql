-- =====================================================================
-- TeachyRooms v31 — add a language to an existing student (e.g. Dutch).
--
-- Run ONCE in the Supabase SQL Editor AFTER v30.sql.
-- NON-DESTRUCTIVE: adds one function only. No table changes, no UPDATE/DELETE.
-- Reuses the existing model: one students row = one teacher + student + language
-- relation with its own lesson data (v29). Idempotent.
-- =====================================================================

-- A teacher adds a language for a student they already teach. The new relation:
--  * gets its own, empty lesson data (nothing is copied or moved),
--  * is linked to the same student account if the existing relation is linked
--    (the student already accepted this teacher), otherwise the student sees an
--    invitation after logging in with that e-mail address,
--  * is rejected when this teacher already teaches the student that language.
create or replace function public.teacher_add_language(p_source uuid, p_language text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare src public.students; new_id uuid;
begin
  if p_language is null or p_language !~ '^[a-z]{2}$' then raise exception 'Invalid language'; end if;
  select * into src from public.students where id = p_source;
  if src.id is null or not public.is_student_teacher(p_source) then raise exception 'Not authorized'; end if;
  begin
    insert into public.students(teacher_id, user_id, email, name, curriculum_subject, lesson_language, level)
    values (src.teacher_id, src.user_id, src.email, src.name, p_language, p_language, '')
    returning id into new_id;
  exception when unique_violation then
    raise exception 'LANGUAGE_EXISTS';
  end;
  return new_id;
end; $$;
revoke all on function public.teacher_add_language(uuid, text) from public;
grant execute on function public.teacher_add_language(uuid, text) to authenticated;
