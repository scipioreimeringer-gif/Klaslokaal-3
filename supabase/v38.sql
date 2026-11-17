-- =====================================================================
-- TeachyRooms v38 — game rounds from the built-in word bank.
--
-- Run ONCE in the Supabase SQL Editor AFTER v35.sql (v36 and v37 had no database changes).
-- NON-DESTRUCTIVE: adds one column (with default) and one function. Existing rounds,
-- words and progress stay exactly as they are. Idempotent: safe to run twice.
-- =====================================================================

-- Word-bank items used in a round (ids like "nl-de-knoop-doorhakken").
-- Like the cards, they are only readable by the explaining player (existing RLS on game_rounds).
alter table public.game_rounds add column if not exists bank_ids text[] not null default '{}';

-- Word-bank items already used in this session (for "no repeats"), for the host teacher only.
-- Returns ids only, never card content; the guessing student gets an empty list.
create or replace function public.game_used_bank(p_session uuid, p_student uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct x), '{}') from public.game_rounds r, unnest(r.bank_ids) x
  where r.session_id = p_session and r.student_id = p_student and public.is_student_teacher(p_student);
$$;
revoke all on function public.game_used_bank(uuid, uuid) from public;
grant execute on function public.game_used_bank(uuid, uuid) to authenticated;
