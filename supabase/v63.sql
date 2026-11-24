-- =====================================================================
-- TeachyRooms v63 — register payments (several lessons at once, optional amount), prepaid credit in lessons,
-- corrections, and the learner's own payment history.
--
-- Run ONCE in the Supabase SQL Editor AFTER v61.sql (v62 may come in between). NON-DESTRUCTIVE: one new table, one
-- new nullable column, new functions. Existing lessons and payments are untouched. Idempotent.
--
-- * payment_records: one registration (date, optional amount + currency, note, optional credit in lessons).
--   A lesson is paid by at most ONE registration (lessons.payment_record_id) → no double registration.
-- * Credit = a lesson package (v61) linked to the registration; using it marks the lesson paid, once.
-- * Correction = void_payment: the registration stays visible as "gecorrigeerd", its lessons are open again and its
--   unused/used credit is withdrawn. Nothing financial is ever sent to Google Calendar.
-- =====================================================================
create table if not exists public.payment_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  paid_on date not null default current_date,
  amount_cents integer check (amount_cents is null or amount_cents between 0 and 100000000),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  note text check (note is null or char_length(note) <= 500),         -- teacher only (not in the learner's history)
  credit_lessons integer not null default 0 check (credit_lessons between 0 and 200),
  package_id uuid references public.lesson_packages(id) on delete set null,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  voided_at timestamptz, voided_by uuid references auth.users(id)
);
create index if not exists payment_records_student_idx on public.payment_records(student_id, paid_on desc);
alter table public.payment_records enable row level security;
drop policy if exists payment_records_teacher on public.payment_records;
create policy payment_records_teacher on public.payment_records for select to authenticated using (public.is_student_teacher(student_id));
grant select on public.payment_records to authenticated;                        -- writes only through the functions
alter table public.lessons add column if not exists payment_record_id uuid references public.payment_records(id) on delete set null;

/** Register one payment: mark the chosen lessons of THIS student paid (lessons already paid are skipped) and/or add
 *  a credit of N lessons. Returns the registration id. */
create or replace function public.record_payment(p_student uuid, p_lessons uuid[], p_amount_cents int, p_currency text, p_paid_on date, p_note text, p_credit int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare rid uuid; pk uuid; n int;
begin
  if not public.is_student_teacher(p_student) then raise exception 'Not authorized'; end if;
  if coalesce(array_length(p_lessons, 1), 0) = 0 and coalesce(p_credit, 0) = 0 then raise exception 'Nothing to register'; end if;
  if p_currency is not null and p_currency !~ '^[A-Z]{3}$' then raise exception 'Invalid currency'; end if;
  insert into public.payment_records(student_id, paid_on, amount_cents, currency, note, credit_lessons)
  values (p_student, coalesce(p_paid_on, current_date), p_amount_cents, case when p_amount_cents is null then null else coalesce(p_currency, 'EUR') end,
          nullif(left(coalesce(p_note, ''), 500), ''), greatest(0, coalesce(p_credit, 0)))
  returning id into rid;
  update public.lessons set payment_status = 'paid', payment_record_id = rid, payment_confirmed_at = now(), payment_confirmed_by = (select auth.uid())
   where id = any(coalesce(p_lessons, '{}')) and student_id = p_student and payment_status is distinct from 'paid';   -- a paid lesson is never registered twice
  get diagnostics n = row_count;
  if coalesce(p_credit, 0) > 0 then
    insert into public.lesson_packages(student_id, lessons_total, price_cents, currency, paid_at, confirmed_by, note)
    values (p_student, p_credit, case when n = 0 then p_amount_cents end, coalesce(p_currency, 'EUR'), coalesce(p_paid_on, current_date)::timestamptz, (select auth.uid()), 'Tegoed')
    returning id into pk;
    update public.payment_records set package_id = pk where id = rid;
  end if;
  if n = 0 and coalesce(p_credit, 0) = 0 then raise exception 'Already paid'; end if;     -- rolls back: no empty registration
  return rid;
end; $$;

/** Use one lesson of credit for a lesson (planned later): debit once and mark it paid. */
create or replace function public.use_credit(p_lesson uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare l public.lessons; pk uuid; rid uuid;
begin
  select * into l from public.lessons where id = p_lesson;
  if l.id is null or not public.is_student_teacher(l.student_id) then raise exception 'Not authorized'; end if;
  if l.payment_status = 'paid' then return false; end if;
  if not public.package_debit_internal(p_lesson, (select auth.uid())) then return false; end if;   -- no credit left / already used
  select u.package_id into pk from public.lesson_package_uses u where u.lesson_id = p_lesson;
  select r.id into rid from public.payment_records r where r.package_id = pk and r.voided_at is null;
  update public.lessons set payment_status = 'paid', payment_record_id = rid, payment_confirmed_at = now(), payment_confirmed_by = (select auth.uid()) where id = p_lesson;
  return true;
end; $$;

/** Correct a wrong registration: it stays in the history as corrected; its lessons are open again; its credit is withdrawn. */
create or replace function public.void_payment(p_record uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.payment_records;
begin
  select * into r from public.payment_records where id = p_record;
  if r.id is null or not public.is_student_teacher(r.student_id) then raise exception 'Not authorized'; end if;
  if r.voided_at is not null then return; end if;
  update public.lessons set payment_status = 'open', payment_record_id = null, payment_confirmed_at = null, payment_confirmed_by = null where payment_record_id = r.id;
  if r.package_id is not null then
    delete from public.lesson_package_uses where package_id = r.package_id;
    delete from public.lesson_packages where id = r.package_id;
  end if;
  update public.payment_records set voided_at = now(), voided_by = (select auth.uid()) where id = r.id;
end; $$;

/** The learner's own payment history (no teacher notes). */
create or replace function public.my_payment_history(sid uuid) returns table(id uuid, paid_on date, amount_cents int, currency text, lessons int, credit_lessons int, voided boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.paid_on, r.amount_cents, r.currency, (select count(*)::int from public.lessons l where l.payment_record_id = r.id), r.credit_lessons, r.voided_at is not null
  from public.payment_records r where r.student_id = sid and public.can_access_student(sid) order by r.paid_on desc, r.created_at desc limit 100;
$$;

revoke all on function public.record_payment(uuid, uuid[], int, text, date, text, int), public.use_credit(uuid), public.void_payment(uuid), public.my_payment_history(uuid) from public, anon;
grant execute on function public.record_payment(uuid, uuid[], int, text, date, text, int), public.use_credit(uuid), public.void_payment(uuid), public.my_payment_history(uuid) to authenticated;
