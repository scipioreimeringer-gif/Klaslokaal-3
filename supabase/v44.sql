-- =====================================================================
-- TeachyRooms v44 — homework deadline and the level of a word (for the "Woorden" filters).
--
-- Run ONCE in the Supabase SQL Editor AFTER v43.sql.
-- NON-DESTRUCTIVE: only adds two nullable columns and one trigger; the new level column of
-- existing words is filled from the level of their relation (no existing value is changed).
-- Idempotent: safe to run twice.
-- =====================================================================

-- Optional deadline per assignment (set by the teacher; existing assignments simply have none).
alter table public.assignments add column if not exists due_at timestamptz;

-- Level of the student when the word was added (A0–C2), so the word list can be filtered by level.
alter table public.vocab_items add column if not exists level text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vocab_items_level') then
    alter table public.vocab_items add constraint vocab_items_level check (level is null or level ~ '^(A0|A1|A2|B1|B2|C1|C2)$');
  end if;
end $$;
update public.vocab_items v set level = s.level
  from public.students s
 where v.student_id = s.id and v.level is null and s.level ~ '^(A0|A1|A2|B1|B2|C1|C2)$';

create or replace function public.vocab_items_set_level() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.level is null then
    select case when s.level ~ '^(A0|A1|A2|B1|B2|C1|C2)$' then s.level end into new.level from public.students s where s.id = new.student_id;
  end if;
  return new;
end; $$;
drop trigger if exists vocab_items_set_level on public.vocab_items;
create trigger vocab_items_set_level before insert on public.vocab_items for each row execute function public.vocab_items_set_level();
