-- =====================================================================
-- TeachyRooms v45 — Google Calendar two-way sync for planned lessons.
--
-- Run ONCE in the Supabase SQL Editor AFTER v44.sql.
-- NON-DESTRUCTIVE: adds two nullable lesson columns (title, description), three tables, one trigger and
-- functions. No existing row is changed. Idempotent: safe to run twice.
--
-- Design
-- * One Google connection per teacher. The OAuth refresh token is stored ENCRYPTED (AES-256-GCM, key only on
--   the server, env GCAL_TOKEN_KEY). The tables have NO client policies: only the checked functions below
--   read or write them (teacher = auth.uid(); webhook = secret channel token, stored as a SHA-256 hash).
-- * Stable link lesson ↔ Google event (calendar_links); the event id itself is derived from the lesson id,
--   so creating the same lesson twice can never produce two events.
-- * Local changes go to an outbox (trigger on lessons). Changes that come FROM Google are applied with a
--   transaction flag, so they never echo back (no endless loop).
-- * Conflict rule: a local change that has not been sent yet wins over a Google change of the same lesson;
--   a Google change that TeachyRooms cannot accept (double booking, all-day event, > 8 hours) is not applied
--   and the TeachyRooms version is written back to Google, with a readable message for the teacher.
-- * Only events that TeachyRooms created are synchronised; other events in the teacher's calendar are never read
--   into TeachyRooms. Deleting an event in Google cancels the lesson (data is kept).
-- =====================================================================

alter table public.lessons add column if not exists title text;
alter table public.lessons add column if not exists description text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'lessons_title_len') then
    alter table public.lessons add constraint lessons_title_len check (title is null or char_length(title) <= 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lessons_description_len') then
    alter table public.lessons add constraint lessons_description_len check (description is null or char_length(description) <= 4000);
  end if;
end $$;

create table if not exists public.calendar_connections (
  teacher_id uuid primary key references auth.users(id) on delete cascade,
  google_email text,
  refresh_token_enc text not null,                       -- AES-256-GCM ciphertext, never plain text
  calendar_id text,                                      -- chosen Google calendar (null = not chosen yet)
  calendar_name text,
  invite_students boolean not null default false,        -- optional: invite the student (profile e-mail) as a guest
  sync_token text,                                       -- Google incremental sync token
  channel_id text unique,                                -- push notification channel
  channel_resource_id text,
  channel_token_hash text,                               -- SHA-256 of the secret channel token
  channel_expires_at timestamptz,
  status text not null default 'ok' check (status in ('ok','error','revoked')),
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.calendar_links (
  lesson_id uuid primary key,                            -- no FK: the link must survive the lesson's delete trigger
  teacher_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  google_updated timestamptz,                            -- last Google "updated" we wrote or applied (echo guard)
  created_at timestamptz not null default now(),
  unique (teacher_id, event_id)
);
create table if not exists public.calendar_outbox (
  id bigserial primary key,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null,
  op text not null check (op in ('upsert','delete')),
  event_id text,                                         -- for deletes (the lesson row is gone)
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);
create unique index if not exists calendar_outbox_upsert_once on public.calendar_outbox(lesson_id) where op = 'upsert';
create index if not exists calendar_outbox_teacher_idx on public.calendar_outbox(teacher_id, id);

alter table public.calendar_connections enable row level security;
alter table public.calendar_links enable row level security;
alter table public.calendar_outbox enable row level security;
revoke all on public.calendar_connections, public.calendar_links, public.calendar_outbox from anon, authenticated;

-- ---------------------------------------------------------------------
-- Outbox trigger: every relevant change of a lesson of a connected teacher
-- ---------------------------------------------------------------------
create or replace function public.gcal_enqueue(p_teacher uuid, p_lesson uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.calendar_outbox(teacher_id, lesson_id, op) values (p_teacher, p_lesson, 'upsert')
  on conflict (lesson_id) where op = 'upsert' do update set attempts = 0, last_error = null, created_at = now();
$$;
revoke all on function public.gcal_enqueue(uuid, uuid) from public, anon, authenticated;

create or replace function public.gcal_lessons_outbox() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t uuid; l uuid; ev text;
begin
  if coalesce(current_setting('teachy.gcal_apply', true), '') = '1' then return null; end if;   -- change came from Google
  t := case when tg_op = 'DELETE' then old.teacher_id else new.teacher_id end;
  l := case when tg_op = 'DELETE' then old.id else new.id end;
  if not exists (select 1 from public.calendar_connections c where c.teacher_id = t and c.calendar_id is not null) then return null; end if;
  if tg_op = 'DELETE' then
    select k.event_id into ev from public.calendar_links k where k.lesson_id = l;
    delete from public.calendar_outbox o where o.lesson_id = l;
    if ev is not null then
      insert into public.calendar_outbox(teacher_id, lesson_id, op, event_id) values (t, l, 'delete', ev);
      delete from public.calendar_links k where k.lesson_id = l;
    end if;
    return null;
  end if;
  if tg_op = 'UPDATE' and new.starts_at = old.starts_at and new.ends_at = old.ends_at and new.status = old.status
     and new.timezone = old.timezone and new.language is not distinct from old.language
     and new.title is not distinct from old.title and new.description is not distinct from old.description
     and new.student_id = old.student_id then return null; end if;                                  -- e.g. reminder_sent_at
  perform public.gcal_enqueue(t, l);
  return null;
end; $$;
drop trigger if exists gcal_lessons_outbox on public.lessons;
create trigger gcal_lessons_outbox after insert or update or delete on public.lessons for each row execute function public.gcal_lessons_outbox();

-- ---------------------------------------------------------------------
-- Applying changes that came from Google (internal; two checked entry points below)
-- p_events: [{id, status, start, end, tz, summary, description, updated, all_day}] — summary/description null = unchanged default
-- ---------------------------------------------------------------------
create or replace function public.gcal_apply_internal(p_teacher uuid, p_events jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e jsonb; lk public.calendar_links; ls public.lessons; upd timestamptz; applied int := 0; skipped int := 0; conflicts int := 0; msg text;
begin
  for e in select * from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) loop
    select * into lk from public.calendar_links k where k.teacher_id = p_teacher and k.event_id = e->>'id';
    if not found then skipped := skipped + 1; continue; end if;                              -- not a TeachyRooms event
    upd := nullif(e->>'updated', '')::timestamptz;
    if lk.google_updated is not null and upd is not null and upd <= lk.google_updated then skipped := skipped + 1; continue; end if;  -- own write / seen before
    if exists (select 1 from public.calendar_outbox o where o.lesson_id = lk.lesson_id) then conflicts := conflicts + 1; continue; end if;  -- local change pending wins
    select * into ls from public.lessons x where x.id = lk.lesson_id;
    if not found then delete from public.calendar_links k where k.lesson_id = lk.lesson_id; continue; end if;
    begin
      perform set_config('teachy.gcal_apply', '1', true);
      if e->>'status' = 'cancelled' then
        if ls.status <> 'cancelled' then update public.lessons set status = 'cancelled' where id = ls.id; end if;
      elsif coalesce((e->>'all_day')::boolean, false) or nullif(e->>'start', '') is null then
        raise exception 'ALL_DAY';
      else
        update public.lessons set
          starts_at = (e->>'start')::timestamptz, ends_at = (e->>'end')::timestamptz,
          timezone = case when public.is_valid_timezone(e->>'tz') then e->>'tz' else timezone end,
          title = case when e ? 'summary' then nullif(left(e->>'summary', 200), '') else title end,
          description = case when e ? 'description' then nullif(left(e->>'description', 4000), '') else description end,
          status = case when status = 'cancelled' then 'scheduled' else status end
        where id = ls.id;
      end if;
      perform set_config('teachy.gcal_apply', '', true);
      applied := applied + 1;
    exception when others then
      perform set_config('teachy.gcal_apply', '', true);
      conflicts := conflicts + 1;
      msg := case when sqlerrm like 'DOUBLE_BOOKING%' then 'Een wijziging in Google Calendar overlapt met een andere les; de les in TeachyRooms is ongewijzigd en Google is teruggezet.'
                  when sqlerrm = 'ALL_DAY' then 'Een les is in Google Calendar een hele-dag-afspraak geworden; TeachyRooms heeft de oorspronkelijke tijd teruggezet.'
                  else 'Een wijziging in Google Calendar kon niet worden overgenomen; TeachyRooms heeft de les teruggezet.' end;
      perform public.gcal_enqueue(p_teacher, ls.id);                                          -- write the TeachyRooms version back
    end;
    update public.calendar_links k set google_updated = greatest(coalesce(k.google_updated, upd), coalesce(upd, k.google_updated)) where k.lesson_id = lk.lesson_id;
  end loop;
  update public.calendar_connections c set last_synced_at = now(), updated_at = now(), last_error = coalesce(msg, case when c.status = 'ok' then null else c.last_error end)
   where c.teacher_id = p_teacher;
  return jsonb_build_object('applied', applied, 'skipped', skipped, 'conflicts', conflicts);
end; $$;
revoke all on function public.gcal_apply_internal(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Teacher (logged in) — called by the server routes with the teacher's own session
-- ---------------------------------------------------------------------
create or replace function public.gcal_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('connected', true, 'email', c.google_email, 'calendar_id', c.calendar_id, 'calendar_name', c.calendar_name,
      'invite_students', c.invite_students, 'status', c.status, 'last_error', c.last_error, 'last_synced_at', c.last_synced_at,
      'push', c.channel_expires_at is not null and c.channel_expires_at > now(),
      'pending', (select count(*) from public.calendar_outbox o where o.teacher_id = c.teacher_id),
      'failed', (select count(*) from public.calendar_outbox o where o.teacher_id = c.teacher_id and o.attempts > 0))
    from public.calendar_connections c where c.teacher_id = (select auth.uid())), jsonb_build_object('connected', false));
$$;

create or replace function public.gcal_connect(p_email text, p_refresh_enc text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_teacher() then raise exception 'Not authorized'; end if;
  if coalesce(p_refresh_enc, '') !~ '^v1:' then raise exception 'Invalid token'; end if;     -- only ciphertext is accepted
  insert into public.calendar_connections(teacher_id, google_email, refresh_token_enc)
  values ((select auth.uid()), left(p_email, 320), p_refresh_enc)
  on conflict (teacher_id) do update set google_email = excluded.google_email, refresh_token_enc = excluded.refresh_token_enc,
    status = 'ok', last_error = null, updated_at = now();                                   -- reconnect keeps calendar and links
end; $$;

create or replace function public.gcal_context() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('refresh_enc', c.refresh_token_enc, 'calendar_id', c.calendar_id, 'sync_token', c.sync_token, 'invite', c.invite_students,
    'channel_id', c.channel_id, 'resource_id', c.channel_resource_id, 'channel_expires_at', c.channel_expires_at, 'status', c.status)
  from public.calendar_connections c where c.teacher_id = (select auth.uid()) and public.is_teacher();
$$;

create or replace function public.gcal_choose_calendar(p_calendar text, p_name text) returns int
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); old text; n int;
begin
  select calendar_id into old from public.calendar_connections where teacher_id = me and public.is_teacher();
  if not found then raise exception 'Not connected'; end if;
  if coalesce(p_calendar, '') = '' then raise exception 'Invalid calendar'; end if;
  update public.calendar_connections set calendar_id = left(p_calendar, 300), calendar_name = left(p_name, 200), updated_at = now(),
    sync_token = case when old is distinct from p_calendar then null else sync_token end,
    channel_id = case when old is distinct from p_calendar then null else channel_id end,
    channel_resource_id = case when old is distinct from p_calendar then null else channel_resource_id end,
    channel_token_hash = case when old is distinct from p_calendar then null else channel_token_hash end,
    channel_expires_at = case when old is distinct from p_calendar then null else channel_expires_at end
  where teacher_id = me;
  if old is distinct from p_calendar then delete from public.calendar_links where teacher_id = me; end if;
  -- push the lessons of the last 30 days and the future (never older history, never other teachers' lessons)
  perform public.gcal_enqueue(me, l.id) from public.lessons l
   where l.teacher_id = me and l.ends_at > now() - interval '30 days' and l.status <> 'cancelled'
     and not exists (select 1 from public.calendar_links k where k.lesson_id = l.id);
  select count(*) into n from public.calendar_outbox where teacher_id = me;
  return n;
end; $$;

create or replace function public.gcal_set_invite(p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  update public.calendar_connections set invite_students = coalesce(p_on, false), updated_at = now() where teacher_id = me and public.is_teacher();
  if not found then raise exception 'Not connected'; end if;
  -- switching on adds the student as guest to upcoming lessons; switching off never removes guests already invited
  if p_on then perform public.gcal_enqueue(me, l.id) from public.lessons l where l.teacher_id = me and l.starts_at > now() and l.status <> 'cancelled'; end if;
end; $$;

/** Pending outbox items with everything needed to build the Google event (only the caller's own lessons). */
create or replace function public.gcal_outbox(p_limit int default 50) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x.id), '[]'::jsonb) from (
    select o.id, o.op, o.lesson_id, coalesce(o.event_id, k.event_id) as event_id, o.attempts,
      l.starts_at, l.ends_at, l.timezone, l.status, l.language, l.title, l.description, l.student_id,
      s.name as student_name, s.email as student_email, s.curriculum_subject, s.lesson_language, s.subject
    from public.calendar_outbox o
    left join public.lessons l on l.id = o.lesson_id
    left join public.students s on s.id = l.student_id
    left join public.calendar_links k on k.lesson_id = o.lesson_id
    where o.teacher_id = (select auth.uid()) and o.attempts < 8
    order by o.id limit greatest(1, least(coalesce(p_limit, 50), 200))) x;
$$;

create or replace function public.gcal_outbox_done(p_id bigint, p_event_id text, p_updated timestamptz, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); o public.calendar_outbox;
begin
  select * into o from public.calendar_outbox where id = p_id and teacher_id = me;
  if not found then return; end if;
  if p_error is not null then
    update public.calendar_outbox set attempts = attempts + 1, last_error = left(p_error, 500) where id = p_id;
    update public.calendar_connections set last_error = left(p_error, 500), updated_at = now() where teacher_id = me;
    return;
  end if;
  if o.op = 'upsert' and p_event_id is not null and exists (select 1 from public.lessons l where l.id = o.lesson_id and l.teacher_id = me) then
    insert into public.calendar_links(lesson_id, teacher_id, event_id, google_updated) values (o.lesson_id, me, p_event_id, p_updated)
    on conflict (lesson_id) do update set event_id = excluded.event_id, google_updated = greatest(public.calendar_links.google_updated, excluded.google_updated);
  end if;
  delete from public.calendar_outbox where id = p_id;
end; $$;

create or replace function public.gcal_apply(p_events jsonb, p_sync_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); r jsonb;
begin
  if not exists (select 1 from public.calendar_connections where teacher_id = me) or not public.is_teacher() then raise exception 'Not connected'; end if;
  r := public.gcal_apply_internal(me, p_events);
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
  where teacher_id = (select auth.uid()) and public.is_teacher();
end; $$;

create or replace function public.gcal_clear_error() returns void
language sql security definer set search_path = '' as $$
  update public.calendar_connections set last_error = null, updated_at = now() where teacher_id = (select auth.uid());
  update public.calendar_outbox set attempts = 0, last_error = null where teacher_id = (select auth.uid());
$$;

create or replace function public.gcal_disconnect() returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  delete from public.calendar_outbox where teacher_id = me;
  delete from public.calendar_links where teacher_id = me;
  delete from public.calendar_connections where teacher_id = me;                             -- lessons themselves are untouched
end; $$;

-- ---------------------------------------------------------------------
-- Google push notifications (no user session): checked with the secret channel token (SHA-256 hash)
-- ---------------------------------------------------------------------
create or replace function public.gcal_webhook_context(p_channel text, p_token_hash text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('teacher_id', c.teacher_id, 'refresh_enc', c.refresh_token_enc, 'calendar_id', c.calendar_id, 'sync_token', c.sync_token)
  from public.calendar_connections c
  where c.channel_id = p_channel and c.channel_token_hash is not null and c.channel_token_hash = p_token_hash and c.status <> 'revoked';
$$;
create or replace function public.gcal_webhook_apply(p_channel text, p_token_hash text, p_events jsonb, p_sync_token text, p_error text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t uuid; r jsonb := '{}'::jsonb;
begin
  select teacher_id into t from public.calendar_connections where channel_id = p_channel and channel_token_hash = p_token_hash;
  if t is null then raise exception 'Unknown channel'; end if;
  if p_error is not null then
    update public.calendar_connections set status = case when p_error = 'revoked' then 'revoked' else status end,
      last_error = case when p_error = 'revoked' then 'Google heeft de toegang ingetrokken. Verbind Google Calendar opnieuw.' else left(p_error, 500) end, updated_at = now()
     where teacher_id = t;
    return r;
  end if;
  r := public.gcal_apply_internal(t, p_events);
  if p_sync_token is not null then update public.calendar_connections set sync_token = p_sync_token where teacher_id = t; end if;
  return r;
end; $$;

revoke all on function public.gcal_status(), public.gcal_connect(text, text), public.gcal_context(), public.gcal_choose_calendar(text, text),
  public.gcal_set_invite(boolean), public.gcal_outbox(int), public.gcal_outbox_done(bigint, text, timestamptz, text), public.gcal_apply(jsonb, text),
  public.gcal_save_state(text, boolean, text, text, text, timestamptz, text, text), public.gcal_clear_error(), public.gcal_disconnect(),
  public.gcal_webhook_context(text, text), public.gcal_webhook_apply(text, text, jsonb, text, text) from public;
grant execute on function public.gcal_status(), public.gcal_connect(text, text), public.gcal_context(), public.gcal_choose_calendar(text, text),
  public.gcal_set_invite(boolean), public.gcal_outbox(int), public.gcal_outbox_done(bigint, text, timestamptz, text), public.gcal_apply(jsonb, text),
  public.gcal_save_state(text, boolean, text, text, text, timestamptz, text, text), public.gcal_clear_error(), public.gcal_disconnect() to authenticated;
grant execute on function public.gcal_webhook_context(text, text), public.gcal_webhook_apply(text, text, jsonb, text, text) to anon, authenticated;
