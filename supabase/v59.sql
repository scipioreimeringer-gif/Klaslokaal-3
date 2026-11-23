-- =====================================================================
-- TeachyRooms v59 — simple booking: weekly availability of the teacher, time blocks (holiday / private), and
-- learners booking a single or weekly lesson inside that availability.
--
-- Run ONCE in the Supabase SQL Editor AFTER v57.sql (and v58.sql). NON-DESTRUCTIVE: one new table, one new column
-- with a default, one length rule widened (a time block may last up to 62 days, e.g. a holiday), new functions.
-- No lesson, appointment or user is changed. Idempotent: safe to run twice.
--
-- Privacy: a learner never sees the teacher's agenda. free_slots() only returns free START TIMES for the learner's
-- own lessons; double bookings are refused by the existing lessons_guard (all roles, v57).
-- =====================================================================

-- 1. Time blocks = personal appointments of kind 'block' (always busy)
alter table public.personal_events add column if not exists kind text not null default 'personal';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'personal_events_kind') then
    alter table public.personal_events add constraint personal_events_kind check (kind in ('personal','block'));
  end if;
  alter table public.personal_events drop constraint if exists personal_events_length;
  alter table public.personal_events add constraint personal_events_length
    check (ends_at - starts_at <= case when kind = 'block' then interval '62 days' else interval '24 hours' end);
end $$;

-- 2. Weekly availability (the teacher's own wall-clock times in the teacher's time zone)
create table if not exists public.teacher_availability (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),          -- ISO: 1 = Monday … 7 = Sunday
  start_time time not null,
  end_time time not null,
  timezone text not null default 'Europe/Amsterdam',
  constraint teacher_availability_order check (end_time > start_time)
);
create index if not exists teacher_availability_teacher_idx on public.teacher_availability(teacher_id, weekday);
alter table public.teacher_availability enable row level security;
drop policy if exists teacher_availability_owner on public.teacher_availability;
create policy teacher_availability_owner on public.teacher_availability for select to authenticated using (teacher_id = (select auth.uid()));
grant select on public.teacher_availability to authenticated;

/** Save the whole week at once: [{weekday, start:'09:00', end:'12:00'}, …] in time zone p_tz. */
create or replace function public.save_availability(p_tz text, p_blocks jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); b jsonb; n int := 0;
begin
  if not public.is_teacher() then raise exception 'Not authorized'; end if;
  if not public.is_valid_timezone(p_tz) then raise exception 'Invalid time zone'; end if;
  if jsonb_array_length(coalesce(p_blocks, '[]'::jsonb)) > 70 then raise exception 'Too many blocks'; end if;
  delete from public.teacher_availability where teacher_id = me;
  for b in select * from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) loop
    insert into public.teacher_availability(teacher_id, weekday, start_time, end_time, timezone)
    values (me, (b->>'weekday')::smallint, (b->>'start')::time, (b->>'end')::time, p_tz);
    n := n + 1;
  end loop;
  return n;
end; $$;

/** Is [s, e) inside one availability block of teacher t (in that block's own time zone, same local day)? */
create or replace function public.in_availability(t uuid, s timestamptz, e timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teacher_availability a
    where a.teacher_id = t
      and extract(isodow from s at time zone a.timezone) = a.weekday
      and (s at time zone a.timezone)::date = (e at time zone a.timezone - interval '1 microsecond')::date
      and (s at time zone a.timezone)::time >= a.start_time
      and (e at time zone a.timezone)::time <= a.end_time
      and (e at time zone a.timezone)::time > (s at time zone a.timezone)::time);
$$;

/** Is [s, e) free for teacher t and learner u — across all roles + blocking appointments of both? (no details out) */
create or replace function public.slot_free(t uuid, u uuid, s timestamptz, e timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.lessons l left join public.students x on x.id = l.student_id
                     where l.status <> 'cancelled' and tstzrange(l.starts_at, l.ends_at) && tstzrange(s, e)
                       and (l.teacher_id in (t, u) or x.user_id in (t, u)))
     and not exists (select 1 from public.personal_events p
                     where p.owner_id in (t, u) and p.blocks_lessons and tstzrange(p.starts_at, p.ends_at) && tstzrange(s, e));
$$;
revoke all on function public.in_availability(uuid, timestamptz, timestamptz), public.slot_free(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;

/** Free start times (every 30 min) on one day of the LEARNER's calendar, for the learner's own relation. */
create or replace function public.free_slots(p_student uuid, p_day date, p_minutes int, p_tz text)
returns table(starts_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare st public.students; me uuid := (select auth.uid()); d0 timestamptz; d1 timestamptz;
begin
  select * into st from public.students where id = p_student;
  if st.id is null or st.user_id is distinct from me or st.archived_at is not null then raise exception 'Not authorized'; end if;
  if p_minutes is null or p_minutes < 15 or p_minutes > 240 then raise exception 'Invalid duration'; end if;
  if not public.is_valid_timezone(p_tz) then raise exception 'Invalid time zone'; end if;
  d0 := p_day::timestamp at time zone p_tz; d1 := (p_day + 1)::timestamp at time zone p_tz;
  return query
    select distinct c.s from (
      select g.s from public.teacher_availability a,
        generate_series(p_day - 1, p_day + 1, interval '1 day') as dd(d),
        lateral generate_series((dd.d::date + a.start_time) at time zone a.timezone,
                                (dd.d::date + a.end_time) at time zone a.timezone - make_interval(mins => p_minutes),
                                interval '30 minutes') as g(s)
      where a.teacher_id = st.teacher_id and extract(isodow from dd.d) = a.weekday) c
    where c.s >= d0 and c.s < d1 and c.s > now() + interval '1 hour'
      and public.in_availability(st.teacher_id, c.s, c.s + make_interval(mins => p_minutes))
      and public.slot_free(st.teacher_id, me, c.s, c.s + make_interval(mins => p_minutes))
    order by 1;
end; $$;

/** The learner books one lesson or the same moment for p_weeks weeks (all or nothing). */
create or replace function public.book_lesson(p_student uuid, p_start timestamptz, p_minutes int, p_weeks int default 1)
returns setof public.lessons
language plpgsql security definer set search_path = '' as $$
declare st public.students; me uuid := (select auth.uid()); tz text; i int; s timestamptz; series uuid; row public.lessons;
begin
  select * into st from public.students where id = p_student;
  if st.id is null or st.user_id is distinct from me or st.archived_at is not null then raise exception 'Not authorized'; end if;
  if st.teacher_id = me then raise exception 'Not authorized'; end if;                       -- own test profile: plan as teacher
  if p_minutes is null or p_minutes < 15 or p_minutes > 240 then raise exception 'Invalid duration'; end if;
  if p_weeks is null or p_weeks < 1 or p_weeks > 12 then raise exception 'Invalid number of weeks'; end if;
  select a.timezone into tz from public.teacher_availability a where a.teacher_id = st.teacher_id limit 1;
  if tz is null then raise exception 'NO_AVAILABILITY'; end if;
  series := case when p_weeks > 1 then gen_random_uuid() end;
  for i in 0 .. p_weeks - 1 loop
    s := ((p_start at time zone tz) + make_interval(weeks => i)) at time zone tz;            -- same wall-clock time (DST-safe)
    if s <= now() + interval '1 hour' then raise exception 'TOO_SOON'; end if;
    if not public.in_availability(st.teacher_id, s, s + make_interval(mins => p_minutes)) then
      raise exception 'NOT_AVAILABLE %', to_char(s at time zone tz, 'YYYY-MM-DD HH24:MI');
    end if;
    insert into public.lessons(student_id, teacher_id, starts_at, ends_at, timezone, series_id, created_via, created_by)
    values (st.id, st.teacher_id, s, s + make_interval(mins => p_minutes), tz, series, 'booking_link', me)
    returning * into row;                                                                    -- lessons_guard: double bookings
    return next row;
  end loop;
end; $$;

/** Does the teacher of this relation offer booking at all? (for showing the button; no details) */
create or replace function public.can_book(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.students s join public.teacher_availability a on a.teacher_id = s.teacher_id
                 where s.id = p_student and s.user_id = (select auth.uid()) and s.teacher_id <> s.user_id and s.archived_at is null);
$$;

revoke all on function public.save_availability(text, jsonb), public.free_slots(uuid, date, int, text), public.book_lesson(uuid, timestamptz, int, int), public.can_book(uuid) from public, anon;
grant execute on function public.save_availability(text, jsonb), public.free_slots(uuid, date, int, text), public.book_lesson(uuid, timestamptz, int, int), public.can_book(uuid) to authenticated;
