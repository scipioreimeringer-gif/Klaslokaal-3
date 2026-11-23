-- =====================================================================
-- TeachyRooms v57 — one central agenda for every role + Google Calendar per account with a choice of what is
-- synchronised + availability across roles + task list.
--
-- Run ONCE in the Supabase SQL Editor AFTER v56.sql.
-- NON-DESTRUCTIVE: new tables, new columns with defaults, replaced functions/trigger functions. No lesson, student,
-- profile or role is changed or deleted. Existing Google Calendar connections keep working exactly as before
-- (they keep synchronising only the lessons the teacher gives). Idempotent: safe to run twice.
--
-- 1. personal_events      own appointments, private to their owner (RLS).
-- 2. Google Calendar      the existing connection (calendar_connections, one per account) is now available to every
--                         account (teacher and/or learner) and has three switches: lessons I give / lessons I follow /
--                         personal appointments. Nothing is sent before the account holder confirmed the choice
--                         (sync_confirmed_at). Lessons I give keep the two-way sync of v45; lessons I follow and personal
--                         appointments are sent one way (TeachyRooms → Google) with stable event ids
--                         (calendar_extra_links). A lesson in which I am both teacher and learner is sent ONCE.
-- 3. lessons_guard        double-booking check across roles: a teacher who follows a lesson at that time (or has a
--                         personal appointment) is busy; a learner who gives a lesson at that time is busy.
-- 4. tasks                manual tasks (private) + remembered "done/hidden" of automatic tasks.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Personal appointments
-- ---------------------------------------------------------------------
create table if not exists public.personal_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  notes text check (notes is null or char_length(notes) <= 4000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Europe/Amsterdam',
  blocks_lessons boolean not null default true,          -- counts as "busy" when planning lessons
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_events_order check (ends_at > starts_at),
  constraint personal_events_length check (ends_at - starts_at <= interval '24 hours')
);
create index if not exists personal_events_owner_time_idx on public.personal_events(owner_id, starts_at);
alter table public.personal_events enable row level security;
drop policy if exists personal_events_owner on public.personal_events;
create policy personal_events_owner on public.personal_events for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.personal_events to authenticated;

-- ---------------------------------------------------------------------
-- 2. Google Calendar: one connection per account, with a choice of what is synchronised
-- ---------------------------------------------------------------------
do $$
declare fresh boolean := not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'calendar_connections' and column_name = 'sync_confirmed_at');
begin
  alter table public.calendar_connections add column if not exists sync_teaching boolean not null default true;
  alter table public.calendar_connections add column if not exists sync_learning boolean not null default true;
  alter table public.calendar_connections add column if not exists sync_personal boolean not null default false;
  alter table public.calendar_connections add column if not exists sync_confirmed_at timestamptz;
  if fresh then
    -- existing connections (made before v57) keep their behaviour: only lessons I give, already confirmed
    update public.calendar_connections set sync_learning = false, sync_confirmed_at = coalesce(created_at, now()) where calendar_id is not null;
  end if;
end $$;

create table if not exists public.calendar_extra_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('learn','personal')),
  item_id uuid not null,                                 -- lesson id or personal event id (no FK: deletions must reach Google)
  event_id text not null,
  fingerprint text,
  primary key (user_id, item_id)
);
alter table public.calendar_extra_links enable row level security;
revoke all on public.calendar_extra_links from anon, authenticated;

-- outbox trigger: lessons I give are only queued when I chose to synchronise them (and confirmed)
create or replace function public.gcal_lessons_outbox() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t uuid; l uuid; ev text;
begin
  if coalesce(current_setting('teachy.gcal_apply', true), '') = '1' then return null; end if;   -- change came from Google
  t := case when tg_op = 'DELETE' then old.teacher_id else new.teacher_id end;
  l := case when tg_op = 'DELETE' then old.id else new.id end;
  if tg_op = 'DELETE' then
    select k.event_id into ev from public.calendar_links k where k.lesson_id = l;
    delete from public.calendar_outbox o where o.lesson_id = l;
    if ev is not null and exists (select 1 from public.calendar_connections c where c.teacher_id = t and c.calendar_id is not null) then
      insert into public.calendar_outbox(teacher_id, lesson_id, op, event_id) values (t, l, 'delete', ev);
    end if;
    delete from public.calendar_links k where k.lesson_id = l;
    return null;
  end if;
  if not exists (select 1 from public.calendar_connections c where c.teacher_id = t and c.calendar_id is not null
                 and c.sync_teaching and c.sync_confirmed_at is not null) then return null; end if;
  if tg_op = 'UPDATE' and new.starts_at = old.starts_at and new.ends_at = old.ends_at and new.status = old.status
     and new.timezone = old.timezone and new.language is not distinct from old.language
     and new.title is not distinct from old.title and new.description is not distinct from old.description
     and new.student_id = old.student_id then return null; end if;
  perform public.gcal_enqueue(t, l);
  return null;
end; $$;

/** Learner profiles count too: every account with lessons (given or followed) may connect its own Google account. */
create or replace function public.gcal_may_connect() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (public.is_teacher() or exists (select 1 from public.students s where s.user_id = (select auth.uid())));
$$;

create or replace function public.gcal_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('connected', true, 'email', c.google_email, 'calendar_id', c.calendar_id, 'calendar_name', c.calendar_name,
      'invite_students', c.invite_students, 'status', c.status, 'last_error', c.last_error, 'last_synced_at', c.last_synced_at,
      'push', c.channel_expires_at is not null and c.channel_expires_at > now(),
      'pending', (select count(*) from public.calendar_outbox o where o.teacher_id = c.teacher_id),
      'failed', (select count(*) from public.calendar_outbox o where o.teacher_id = c.teacher_id and o.attempts > 0),
      'sync_teaching', c.sync_teaching, 'sync_learning', c.sync_learning, 'sync_personal', c.sync_personal,
      'confirmed', c.sync_confirmed_at is not null, 'is_teacher', public.is_teacher())
    from public.calendar_connections c where c.teacher_id = (select auth.uid())), jsonb_build_object('connected', false, 'is_teacher', public.is_teacher()));
$$;

-- connect: another Google account than before never reuses the old account's calendar, links or queue (v52) — and
-- a new connection always starts UNCONFIRMED: nothing is sent until the account holder chose calendar + types
create or replace function public.gcal_connect(p_email text, p_refresh_enc text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); old_email text; had boolean;
begin
  if not public.gcal_may_connect() then raise exception 'Not authorized'; end if;
  if coalesce(p_refresh_enc, '') !~ '^v1:' then raise exception 'Invalid token'; end if;
  select true, google_email into had, old_email from public.calendar_connections where teacher_id = me;
  if coalesce(had, false) and (old_email is null or p_email is null or lower(old_email) <> lower(left(p_email, 320))) then
    delete from public.calendar_outbox where teacher_id = me;
    delete from public.calendar_links where teacher_id = me;
    delete from public.calendar_extra_links where user_id = me;
    delete from public.calendar_connections where teacher_id = me;
  end if;
  insert into public.calendar_connections(teacher_id, google_email, refresh_token_enc, sync_teaching, sync_learning, sync_personal, sync_confirmed_at)
  values (me, left(p_email, 320), p_refresh_enc, public.is_teacher(), true, false, null)
  on conflict (teacher_id) do update set google_email = excluded.google_email, refresh_token_enc = excluded.refresh_token_enc,
    status = 'ok', last_error = null, updated_at = now();                                   -- same account again: keeps its choices
end; $$;

create or replace function public.gcal_context() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('refresh_enc', c.refresh_token_enc, 'calendar_id', c.calendar_id, 'sync_token', c.sync_token, 'invite', c.invite_students,
    'channel_id', c.channel_id, 'resource_id', c.channel_resource_id, 'channel_expires_at', c.channel_expires_at, 'status', c.status,
    'confirmed', c.sync_confirmed_at is not null, 'sync_teaching', c.sync_teaching and public.is_teacher(), 'sync_learning', c.sync_learning, 'sync_personal', c.sync_personal)
  from public.calendar_connections c where c.teacher_id = (select auth.uid());
$$;

-- choosing (or changing) the target calendar: links of the previous calendar are forgotten; lessons are only queued
-- when the choice of types was already confirmed (otherwise after gcal_set_types)
create or replace function public.gcal_choose_calendar(p_calendar text, p_name text) returns int
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); old text; n int; c public.calendar_connections;
begin
  select * into c from public.calendar_connections where teacher_id = me;
  if not found then raise exception 'Not connected'; end if;
  old := c.calendar_id;
  if coalesce(p_calendar, '') = '' then raise exception 'Invalid calendar'; end if;
  update public.calendar_connections set calendar_id = left(p_calendar, 300), calendar_name = left(p_name, 200), updated_at = now(),
    sync_token = case when old is distinct from p_calendar then null else sync_token end,
    channel_id = case when old is distinct from p_calendar then null else channel_id end,
    channel_resource_id = case when old is distinct from p_calendar then null else channel_resource_id end,
    channel_token_hash = case when old is distinct from p_calendar then null else channel_token_hash end,
    channel_expires_at = case when old is distinct from p_calendar then null else channel_expires_at end
  where teacher_id = me;
  if old is distinct from p_calendar then
    delete from public.calendar_links where teacher_id = me;
    delete from public.calendar_extra_links where user_id = me;
    delete from public.calendar_outbox where teacher_id = me;
  end if;
  if c.sync_confirmed_at is not null and c.sync_teaching and public.is_teacher() then
    perform public.gcal_enqueue(me, l.id) from public.lessons l
     where l.teacher_id = me and l.ends_at > now() - interval '30 days' and l.status <> 'cancelled'
       and not exists (select 1 from public.calendar_links k where k.lesson_id = l.id);
  end if;
  select count(*) into n from public.calendar_outbox where teacher_id = me;
  return n;
end; $$;

/** The explicit choice (and consent) of what goes to Google. Switching a type off removes its events from Google. */
create or replace function public.gcal_set_types(p_teaching boolean, p_learning boolean, p_personal boolean) returns int
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); c public.calendar_connections; teach boolean := coalesce(p_teaching, false) and public.is_teacher(); n int;
begin
  select * into c from public.calendar_connections where teacher_id = me;
  if not found then raise exception 'Not connected'; end if;
  if c.calendar_id is null then raise exception 'Choose a calendar first'; end if;
  update public.calendar_connections set sync_teaching = teach, sync_learning = coalesce(p_learning, false), sync_personal = coalesce(p_personal, false),
    sync_confirmed_at = now(), updated_at = now() where teacher_id = me;
  if teach then
    perform public.gcal_enqueue(me, l.id) from public.lessons l
     where l.teacher_id = me and l.ends_at > now() - interval '30 days' and l.status <> 'cancelled'
       and not exists (select 1 from public.calendar_links k where k.lesson_id = l.id);
  else
    delete from public.calendar_outbox where teacher_id = me and op = 'upsert';
    insert into public.calendar_outbox(teacher_id, lesson_id, op, event_id) select me, k.lesson_id, 'delete', k.event_id from public.calendar_links k where k.teacher_id = me;
    delete from public.calendar_links where teacher_id = me;
  end if;
  select count(*) into n from public.calendar_outbox where teacher_id = me;
  return n;
end; $$;

/** One-way part: what should be in Google for "lessons I follow" and "personal appointments", and what must go.
 *  Lessons I give are never in here (they have the two-way sync), so a lesson in which I am both teacher and learner
 *  is sent once. Window: 30 days back to 180 days ahead. */
create or replace function public.gcal_extra_plan() returns jsonb
language sql stable security definer set search_path = '' as $$
  with c as (select * from public.calendar_connections where teacher_id = (select auth.uid()) and sync_confirmed_at is not null and calendar_id is not null),
  want as (
    select 'learn'::text as kind, l.id as item_id, l.starts_at, l.ends_at, l.timezone, l.status, l.language, s.id as student_id,
      s.curriculum_subject, s.lesson_language, coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1)) as teacher_name, null::text as title
    from c, public.lessons l join public.students s on s.id = l.student_id left join public.profiles p on p.id = l.teacher_id
    where c.sync_learning and s.user_id = c.teacher_id and l.teacher_id <> c.teacher_id and l.status <> 'cancelled'
      and l.ends_at > now() - interval '30 days' and l.starts_at < now() + interval '180 days'
    union all
    select 'personal', e.id, e.starts_at, e.ends_at, e.timezone, 'scheduled', null, null, null, null, null, e.title
    from c, public.personal_events e
    where c.sync_personal and e.owner_id = c.teacher_id and e.ends_at > now() - interval '30 days' and e.starts_at < now() + interval '180 days')
  select jsonb_build_object(
    'want', coalesce((select jsonb_agg(to_jsonb(w) || jsonb_build_object('event_id', k.event_id, 'fingerprint', k.fingerprint))
      from want w left join public.calendar_extra_links k on k.item_id = w.item_id and k.user_id = (select auth.uid())), '[]'::jsonb),
    'remove', coalesce((select jsonb_agg(jsonb_build_object('item_id', k.item_id, 'event_id', k.event_id))
      from public.calendar_extra_links k where k.user_id = (select auth.uid())
        and not exists (select 1 from want w where w.item_id = k.item_id)
        -- older than the window but still valid: stays in Google, untouched
        and not exists (select 1 from c, public.lessons l join public.students s on s.id = l.student_id
                         where l.id = k.item_id and c.sync_learning and s.user_id = c.teacher_id and l.teacher_id <> c.teacher_id and l.status <> 'cancelled' and l.ends_at <= now() - interval '30 days')
        and not exists (select 1 from c, public.personal_events e where e.id = k.item_id and c.sync_personal and e.owner_id = c.teacher_id and e.ends_at <= now() - interval '30 days')), '[]'::jsonb));
$$;

create or replace function public.gcal_extra_done(p_kind text, p_item uuid, p_event_id text, p_fingerprint text, p_removed boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if p_removed then delete from public.calendar_extra_links where user_id = me and item_id = p_item; return; end if;
  if p_kind = 'learn' and not exists (select 1 from public.lessons l join public.students s on s.id = l.student_id where l.id = p_item and s.user_id = me) then return; end if;
  if p_kind = 'personal' and not exists (select 1 from public.personal_events e where e.id = p_item and e.owner_id = me) then return; end if;
  if p_kind not in ('learn','personal') then return; end if;
  insert into public.calendar_extra_links(user_id, kind, item_id, event_id, fingerprint) values (me, p_kind, p_item, left(p_event_id, 300), left(p_fingerprint, 100))
  on conflict (user_id, item_id) do update set event_id = excluded.event_id, fingerprint = excluded.fingerprint, kind = excluded.kind;
end; $$;

create or replace function public.gcal_apply(p_events jsonb, p_sync_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); r jsonb;
begin
  if not exists (select 1 from public.calendar_connections where teacher_id = me) then raise exception 'Not connected'; end if;
  r := public.gcal_apply_internal(me, p_events);                                            -- only events linked to MY given lessons
  if p_sync_token is not null then update public.calendar_connections set sync_token = p_sync_token where teacher_id = me; end if;
  return r;
end; $$;

create or replace function public.gcal_save_state(p_sync_token text, p_reset_sync boolean, p_channel_id text, p_resource_id text, p_token_hash text, p_expires timestamptz, p_status text, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.calendar_connections set
    sync_token = case when p_reset_sync then null else coalesce(p_sync_token, sync_token) end,
    channel_id = coalesce(p_channel_id, channel_id), channel_resource_id = coalesce(p_resource_id, channel_resource_id),
    channel_token_hash = coalesce(p_token_hash, channel_token_hash), channel_expires_at = coalesce(p_expires, channel_expires_at),
    status = coalesce(p_status, status),
    last_error = case when p_status = 'ok' and p_error is null then last_error else coalesce(p_error, last_error) end,
    last_synced_at = case when p_status = 'ok' then now() else last_synced_at end, updated_at = now()
  where teacher_id = (select auth.uid());
end; $$;

create or replace function public.gcal_disconnect() returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  delete from public.calendar_outbox where teacher_id = me;
  delete from public.calendar_links where teacher_id = me;
  delete from public.calendar_extra_links where user_id = me;
  delete from public.calendar_connections where teacher_id = me;                             -- lessons and appointments are untouched
end; $$;

revoke all on function public.gcal_may_connect(), public.gcal_status(), public.gcal_connect(text, text), public.gcal_context(), public.gcal_choose_calendar(text, text),
  public.gcal_set_types(boolean, boolean, boolean), public.gcal_extra_plan(), public.gcal_extra_done(text, uuid, text, text, boolean),
  public.gcal_apply(jsonb, text), public.gcal_save_state(text, boolean, text, text, text, timestamptz, text, text), public.gcal_disconnect() from public, anon;
grant execute on function public.gcal_may_connect(), public.gcal_status(), public.gcal_connect(text, text), public.gcal_context(), public.gcal_choose_calendar(text, text),
  public.gcal_set_types(boolean, boolean, boolean), public.gcal_extra_plan(), public.gcal_extra_done(text, uuid, text, text, boolean),
  public.gcal_apply(jsonb, text), public.gcal_save_state(text, boolean, text, text, text, timestamptz, text, text), public.gcal_disconnect() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Double booking across roles (replaces the v30 guard; same checks + the other role + personal appointments)
-- ---------------------------------------------------------------------
create or replace function public.lessons_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare rel_teacher uuid; rel_user uuid; clash timestamptz;
begin
  select s.teacher_id, s.user_id into rel_teacher, rel_user from public.students s where s.id = new.student_id;
  if rel_teacher is null then raise exception 'Unknown student'; end if;
  new.teacher_id := rel_teacher;
  if not public.is_valid_timezone(new.timezone) then raise exception 'Invalid time zone'; end if;
  new.updated_at := now();
  if new.status = 'cancelled' and new.cancelled_at is null then new.cancelled_at := now(); end if;
  if new.status <> 'cancelled' then
    -- serialize per person (fixed order, so two people planning at once can never deadlock)
    perform pg_advisory_xact_lock(hashtext(x::text)) from unnest(array[rel_teacher, rel_user]) x where x is not null order by x::text;
    -- the teacher: gives another lesson, OR follows a lesson as learner, OR has a personal appointment that blocks
    select l.starts_at into clash from public.lessons l left join public.students s on s.id = l.student_id
     where l.id <> new.id and l.status <> 'cancelled' and (l.teacher_id = rel_teacher or s.user_id = rel_teacher)
       and tstzrange(l.starts_at, l.ends_at) && tstzrange(new.starts_at, new.ends_at) limit 1;
    if clash is not null then raise exception 'DOUBLE_BOOKING_TEACHER %', to_char(clash at time zone new.timezone, 'YYYY-MM-DD HH24:MI'); end if;
    select e.starts_at into clash from public.personal_events e
     where e.owner_id = rel_teacher and e.blocks_lessons and tstzrange(e.starts_at, e.ends_at) && tstzrange(new.starts_at, new.ends_at) limit 1;
    if clash is not null then raise exception 'DOUBLE_BOOKING_PERSONAL %', to_char(clash at time zone new.timezone, 'YYYY-MM-DD HH24:MI'); end if;
    if rel_user is not null and rel_user <> rel_teacher then
      -- the learner: follows another lesson (any teacher), OR gives a lesson as teacher
      select l.starts_at into clash from public.lessons l left join public.students s on s.id = l.student_id
       where l.id <> new.id and l.status <> 'cancelled' and (s.user_id = rel_user or l.teacher_id = rel_user)
         and tstzrange(l.starts_at, l.ends_at) && tstzrange(new.starts_at, new.ends_at) limit 1;
      if clash is not null then raise exception 'DOUBLE_BOOKING_STUDENT %', to_char(clash at time zone new.timezone, 'YYYY-MM-DD HH24:MI'); end if;
    end if;
  end if;
  return new;
end; $$;

-- ---------------------------------------------------------------------
-- 4. Tasks
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  notes text check (notes is null or char_length(notes) <= 4000),
  priority text not null default 'normal' check (priority in ('high','normal','low')),
  due_at timestamptz,
  role text not null default 'teacher' check (role in ('teacher','student')),
  student_id uuid references public.students(id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_owner_idx on public.tasks(owner_id, done_at, due_at);
alter table public.tasks enable row level security;
drop policy if exists tasks_owner on public.tasks;
create policy tasks_owner on public.tasks for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.tasks to authenticated;

-- "done" / "hidden" for an AUTOMATIC task (the task itself is computed from existing data; this only remembers the decision)
create table if not exists public.task_dismissals (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_key text not null check (char_length(task_key) <= 200),
  dismissed_at timestamptz not null default now(),
  primary key (owner_id, task_key)
);
alter table public.task_dismissals enable row level security;
drop policy if exists task_dismissals_owner on public.task_dismissals;
create policy task_dismissals_owner on public.task_dismissals for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.task_dismissals to authenticated;
