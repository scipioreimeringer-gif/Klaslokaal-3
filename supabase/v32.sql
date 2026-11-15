-- =====================================================================
-- TeachyRooms v32 — keep "languages I learn" separate from "languages I teach".
--
-- Run ONCE in the Supabase SQL Editor AFTER v31.sql.
-- NON-DESTRUCTIVE: only replaces two functions (same signatures). No table
-- changes, no UPDATE/DELETE of data. Idempotent.
-- =====================================================================

-- Invitations shown in MY student dashboard: never a relation where I am the teacher
-- (e.g. a test student a teacher created with their own e-mail address).
create or replace function public.my_pending_student_links()
returns table(student_id uuid, student_name text, subject text, teacher_name text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.subject, coalesce(nullif(p.full_name,''), p.email)
    from public.students s
    join public.profiles p on p.id = s.teacher_id
    join auth.users u on u.id = (select auth.uid())
   where s.user_id is null
     and s.teacher_id <> (select auth.uid())
     and u.email is not null
     and u.email_confirmed_at is not null
     and lower(s.email) = lower(u.email);
$$;

-- Accepting an invitation: same checks as v27, plus: a teacher cannot become their own student.
create or replace function public.accept_student_link(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare account_email text; confirmed timestamptz;
begin
  if (select auth.uid()) is null then raise exception 'Log in first'; end if;
  select lower(email), email_confirmed_at into account_email, confirmed from auth.users where id = (select auth.uid());
  if account_email is null or confirmed is null then raise exception 'E-mail address not verified'; end if;
  update public.students set user_id = (select auth.uid()), updated_at = now()
   where id = target and user_id is null and lower(email) = account_email
     and teacher_id <> (select auth.uid());
  if not found then raise exception 'No matching student profile'; end if;
end; $$;
revoke all on function public.my_pending_student_links(), public.accept_student_link(uuid) from public;
grant execute on function public.my_pending_student_links(), public.accept_student_link(uuid) to authenticated;
