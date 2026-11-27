-- =====================================================================
-- TeachyRooms v76 — the daily learning route (rounds of existing games after the daily challenge).
--
-- Run ONCE in the Supabase SQL Editor AFTER v75.sql. NON-DESTRUCTIVE and idempotent: one new nullable column on the
-- v75 table daily_runs. It stores today's planned rounds with their frozen questions, the current round, the position
-- inside it and the results, so the route continues exactly on any device. Policies of daily_runs stay the same.
-- =====================================================================
alter table public.daily_runs add column if not exists route jsonb;
