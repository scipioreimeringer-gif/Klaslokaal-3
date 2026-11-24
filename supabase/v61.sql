-- =====================================================================
-- TeachyRooms v61 — simple payment administration (no payments are processed, nothing is invoiced).
--
-- Run ONCE in the Supabase SQL Editor AFTER v60.sql. NON-DESTRUCTIVE: new nullable columns, new tables, new
-- functions; the lesson status rule is WIDENED (adds "student / teacher did not show up"). Existing lessons keep
-- payment_status NULL = unknown — never assumed unpaid. Idempotent: safe to run twice.
--
--   lessons.payment_status   null (unknown/off) | open | reported (student says paid) | paid (teacher confirmed) | na
--   lessons.price_cents/currency   the agreed price COPIED at booking time (a later price change never alters it)
--   student_billing          optional tariff per student (price, currency, duration, method, per lesson/package/month)
--   lesson_packages / lesson_package_uses   prepaid lessons; one use per lesson (no double debit)
-- Lesson status and payment status are separate. Only the teacher confirms; the learner can only REPORT.
-- Nothing of this is sent to Google Calendar (the calendar functions never read these columns).
-- =====================================================================

alter table public.profiles add column if not exists billing_enabled boolean not null default false;   -- per teacher, off by default

alter table public.lessons add column if not exists payment_status text;
alter table public.lessons add column if not exists price_cents integer;
alter table public.lessons add column if not exists currency text;
alter table public.lessons add column if not exists payment_reported_at timestamptz;
alter table public.lessons add column if not exists payment_confirmed_at timestamptz;
alter table public.lessons add column if not exists payment_confirmed_by uuid references auth.users(id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'lessons_payment_status') then
    alter table public.lessons add constraint lessons_payment_status check (payment_status is null or payment_status in ('open','reported','paid','na'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lessons_price') then
    alter table public.lessons add constraint lessons_price check ((price_cents is null or price_cents between 0 and 10000000) and (currency is null or currency ~ '^[A-Z]{3}$'));
  end if;
  alter table public.lessons drop constraint if exists lessons_status_check;
  alter table public.lessons add constraint lessons_status_check check (status in ('scheduled','completed','cancelled','no_show_student','no_show_teacher'));
end $$;

create table if not exists public.student_billing (
  student_id uuid primary key references public.students(id) on delete cascade,
  price_cents integer check (price_cents is null or price_cents between 0 and 10000000),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  default_minutes integer check (default_minutes is null or default_minutes between 15 and 480),
  method text check (method is null or char_length(method) <= 100),
  mode text not null default 'lesson' check (mode in ('lesson','package','month')),
  updated_at timestamptz not null default now()
);
create table if not exists public.lesson_packages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  lessons_total integer not null check (lessons_total between 1 and 200),
  price_cents integer check (price_cents is null or price_cents between 0 and 100000000),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  paid_at timestamptz,                                   -- received (money); null = not received yet
  confirmed_by uuid references auth.users(id),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create table if not exists public.lesson_package_uses (
  lesson_id uuid primary key references public.lessons(id) on delete cascade,   -- one debit per lesson, ever
  package_id uuid not null references public.lesson_packages(id) on delete cascade,
  used_at timestamptz not null default now(),
  by_user uuid references auth.users(id)
);
alter table public.student_billing enable row level security;
alter table public.lesson_packages enable row level security;
alter table public.lesson_package_uses enable row level security;
drop policy if exists student_billing_teacher on public.student_billing;
create policy student_billing_teacher on public.student_billing for all to authenticated using (public.is_student_teacher(student_id)) with check (public.is_student_teacher(student_id));
drop policy if exists student_billing_learner on public.student_billing;
create policy student_billing_learner on public.student_billing for select to authenticated using (public.is_linked_student(student_id));
drop policy if exists lesson_packages_teacher on public.lesson_packages;
create policy lesson_packages_teacher on public.lesson_packages for all to authenticated using (public.is_student_teacher(student_id)) with check (public.is_student_teacher(student_id));
drop policy if exists lesson_packages_learner on public.lesson_packages;
create policy lesson_packages_learner on public.lesson_packages for select to authenticated using (public.is_linked_student(student_id));
drop policy if exists lesson_package_uses_read on public.lesson_package_uses;
create policy lesson_package_uses_read on public.lesson_package_uses for select to authenticated
  using (exists (select 1 from public.lesson_packages p where p.id = package_id and public.can_access_student(p.student_id)));
grant select, insert, update, delete on public.student_billing, public.lesson_packages to authenticated;
grant select on public.lesson_package_uses to authenticated;                    -- writes only through the functions below

-- the agreed price is copied onto every NEW lesson (only when billing is on for this teacher and a tariff exists)
create or replace function public.lessons_billing_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
declare b public.student_billing;
begin
  if new.payment_status is not null or new.price_cents is not null then return new; end if;
  if not exists (select 1 from public.profiles p where p.id = new.teacher_id and p.billing_enabled) then return new; end if;
  select * into b from public.student_billing where student_id = new.student_id;
  if b.student_id is null then return new; end if;
  new.price_cents := b.price_cents; new.currency := b.currency;
  new.payment_status := case b.mode when 'lesson' then 'open' else 'na' end;     -- package / month: paid elsewhere
  return new;
end; $$;
drop trigger if exists lessons_billing_defaults on public.lessons;
create trigger lessons_billing_defaults before insert on public.lessons for each row execute function public.lessons_billing_defaults();

/** Package debit for one lesson (idempotent). Oldest package with lessons left first. */
create or replace function public.package_debit_internal(p_lesson uuid, p_by uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare l public.lessons; pk uuid;
begin
  select * into l from public.lessons where id = p_lesson;
  if l.id is null or exists (select 1 from public.lesson_package_uses where lesson_id = p_lesson) then return false; end if;
  select p.id into pk from public.lesson_packages p
   where p.student_id = l.student_id and p.lessons_total > (select count(*) from public.lesson_package_uses u where u.package_id = p.id)
   order by p.created_at limit 1 for update;
  if pk is null then return false; end if;
  insert into public.lesson_package_uses(lesson_id, package_id, by_user) values (p_lesson, pk, p_by) on conflict (lesson_id) do nothing;
  return found;
end; $$;
revoke all on function public.package_debit_internal(uuid, uuid) from public, anon, authenticated;

-- a lesson that is really completed uses one lesson of a package (only when the student pays per package)
create or replace function public.lessons_package_debit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and exists (select 1 from public.student_billing b where b.student_id = new.student_id and b.mode = 'package') then
    perform public.package_debit_internal(new.id, (select auth.uid()));
  end if;
  return null;
end; $$;
drop trigger if exists lessons_package_debit on public.lessons;
create trigger lessons_package_debit after update of status on public.lessons for each row execute function public.lessons_package_debit();

-- a planned lesson in which teacher and student were really together (registered session) is completed
create or replace function public.sessions_complete_lesson() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.registered_at is not null and old.registered_at is null and new.lesson_id is not null then
    update public.lessons set status = 'completed' where id = new.lesson_id and status = 'scheduled';
  end if;
  return null;
end; $$;
drop trigger if exists sessions_complete_lesson on public.lesson_sessions;
create trigger sessions_complete_lesson after update of registered_at on public.lesson_sessions for each row execute function public.sessions_complete_lesson();

/** Teacher: payment status of a lesson (who and when is kept). */
create or replace function public.set_payment(p_lesson uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.lessons;
begin
  select * into l from public.lessons where id = p_lesson;
  if l.id is null or not public.is_student_teacher(l.student_id) then raise exception 'Not authorized'; end if;
  if p_status is not null and p_status not in ('open','paid','na') then raise exception 'Invalid status'; end if;
  update public.lessons set payment_status = p_status,
    payment_confirmed_at = case when p_status = 'paid' then now() else null end,
    payment_confirmed_by = case when p_status = 'paid' then (select auth.uid()) else null end
  where id = p_lesson;
end; $$;

/** Learner: "Ik heb betaald" — only a report; never "paid". */
create or replace function public.report_payment(p_lesson uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.lessons;
begin
  select * into l from public.lessons where id = p_lesson;
  if l.id is null or not public.is_linked_student(l.student_id) then raise exception 'Not authorized'; end if;
  if l.payment_status is distinct from 'open' then raise exception 'Nothing to report'; end if;
  update public.lessons set payment_status = 'reported', payment_reported_at = now() where id = p_lesson;
end; $$;

/** Teacher: debit a cancelled / no-show lesson from the package (cancellation rules) or undo a debit. */
create or replace function public.package_debit(p_lesson uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare l public.lessons;
begin
  select * into l from public.lessons where id = p_lesson;
  if l.id is null or not public.is_student_teacher(l.student_id) then raise exception 'Not authorized'; end if;
  if not p_on then delete from public.lesson_package_uses where lesson_id = p_lesson; return true; end if;
  return public.package_debit_internal(p_lesson, (select auth.uid()));
end; $$;

/** Packages with use counts (teacher and the learner themself). */
create or replace function public.package_balance(sid uuid) returns table(id uuid, lessons_total int, used int, remaining int, price_cents int, currency text, paid_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.lessons_total, count(u.lesson_id)::int, (p.lessons_total - count(u.lesson_id))::int, p.price_cents, p.currency, p.paid_at, p.created_at
  from public.lesson_packages p left join public.lesson_package_uses u on u.package_id = p.id
  where p.student_id = sid and public.can_access_student(sid)
  group by p.id order by p.created_at;
$$;

/** Teacher switches the payment administration on or off (own profile only). */
create or replace function public.set_billing_enabled(p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_teacher() then raise exception 'Not authorized'; end if;
  update public.profiles set billing_enabled = coalesce(p_on, false) where id = (select auth.uid());
end; $$;
revoke all on function public.set_billing_enabled(boolean) from public, anon;
grant execute on function public.set_billing_enabled(boolean) to authenticated;

revoke all on function public.set_payment(uuid, text), public.report_payment(uuid), public.package_debit(uuid, boolean), public.package_balance(uuid) from public, anon;
grant execute on function public.set_payment(uuid, text), public.report_payment(uuid), public.package_debit(uuid, boolean), public.package_balance(uuid) to authenticated;
