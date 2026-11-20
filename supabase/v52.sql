-- =====================================================================
-- TeachyRooms v52 — Google Calendar: connecting ANOTHER Google account never reuses the old account's data.
--
-- Run ONCE in the Supabase SQL Editor AFTER v45.sql (v46–v48 may come in between).
-- NON-DESTRUCTIVE for lessons, students and appointments. Only ONE function is replaced; no table, no row is
-- changed by running this file. Idempotent: safe to run twice.
--
-- What changes: gcal_connect. Until now a new connection kept the chosen calendar, sync state, push channel and the
-- lesson↔event links of the previous connection ("reconnect"). That is right for the SAME Google account, but wrong
-- for another one: the new account would point at the old account's calendar. Now, when the Google e-mail differs,
-- the old connection data of THIS teacher (calendar_connections row, calendar_links, calendar_outbox) is removed
-- first — exactly what "Ontkoppelen" removes — and the new account starts from scratch (choose a calendar).
-- Lessons themselves (public.lessons) are never touched.
-- =====================================================================

create or replace function public.gcal_connect(p_email text, p_refresh_enc text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); old_email text; had boolean;
begin
  if not public.is_teacher() then raise exception 'Not authorized'; end if;
  if coalesce(p_refresh_enc, '') !~ '^v1:' then raise exception 'Invalid token'; end if;     -- only ciphertext is accepted
  select true, google_email into had, old_email from public.calendar_connections where teacher_id = me;
  if coalesce(had, false) and (old_email is null or p_email is null or lower(old_email) <> lower(left(p_email, 320))) then
    delete from public.calendar_outbox where teacher_id = me;
    delete from public.calendar_links where teacher_id = me;
    delete from public.calendar_connections where teacher_id = me;
  end if;
  insert into public.calendar_connections(teacher_id, google_email, refresh_token_enc)
  values (me, left(p_email, 320), p_refresh_enc)
  on conflict (teacher_id) do update set google_email = excluded.google_email, refresh_token_enc = excluded.refresh_token_enc,
    status = 'ok', last_error = null, updated_at = now();                                   -- same account again: keeps calendar and links
end; $$;
revoke all on function public.gcal_connect(text, text) from public, anon;
grant execute on function public.gcal_connect(text, text) to authenticated;
