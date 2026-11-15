-- =====================================================================
-- TeachyRooms v33 — TEST analyses from an imported transcript (admins only).
--
-- Run ONCE in the Supabase SQL Editor AFTER v32.sql.
-- NON-DESTRUCTIVE: adds one column (default false, existing analyses unchanged),
-- one trigger and replaces one read function (same signature). Idempotent.
-- =====================================================================

alter table public.lesson_analyses add column if not exists is_test boolean not null default false;

-- TEST analyses: only an admin creates them, they stay TEST, and they can never be approved
-- (approval is what shares a summary, words and goals with the student).
create or replace function public.check_test_analysis() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.is_test and not public.is_admin() then
    raise exception 'TEST_ADMIN_ONLY';
  end if;
  if tg_op = 'UPDATE' and old.is_test and not new.is_test then
    raise exception 'TEST_STAYS_TEST';
  end if;
  if new.is_test and new.status = 'approved' then
    raise exception 'TEST_NOT_SHAREABLE';
  end if;
  return new;
end; $$;
drop trigger if exists analyses_test_guard on public.lesson_analyses;
create trigger analyses_test_guard before insert or update on public.lesson_analyses
  for each row execute function public.check_test_analysis();

-- What students can read: never a TEST analysis (defence in depth; they cannot be approved anyway).
create or replace function public.student_lesson_summaries(sid uuid)
returns table(id uuid, lesson_date date, final jsonb, approved_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.lesson_date, a.final, a.approved_at from public.lesson_analyses a
   where a.student_id = sid and a.status = 'approved' and not a.is_test and public.can_access_student(sid)
   order by a.lesson_date desc, a.approved_at desc;
$$;
revoke all on function public.student_lesson_summaries(uuid) from public;
grant execute on function public.student_lesson_summaries(uuid) to authenticated;
