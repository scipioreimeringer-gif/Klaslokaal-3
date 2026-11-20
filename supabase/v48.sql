-- =====================================================================
-- TeachyRooms v48 — daily practice: spaced repetition for mistakes and lesson exercises, daily sessions.
--
-- Run ONCE in the Supabase SQL Editor AFTER v47.sql.
-- NON-DESTRUCTIVE: adds one table and one function, and allows the practice kind 'daily'. Idempotent.
--
-- One learning system, no parallel stores:
-- * words      → vocab_items (existing spaced repetition: record_vocab_practice)
-- * mistakes, grammar and earlier homework items → practice_items (this file), keyed by the id of the approved error
--   in the lesson report ("err:<analysis>:<error>") or the homework item ("hw:<assignment>:<n>")
-- * results    → practice_sessions (existing), kind 'daily' = one finished daily practice (streak = consecutive days)
-- =====================================================================

alter table public.practice_sessions drop constraint if exists practice_sessions_kind_check;
alter table public.practice_sessions add constraint practice_sessions_kind_check
  check (kind in ('flashcards','quiz','typing','match','sentence','conjugate','errors','exercise','homework','daily'));

create table if not exists public.practice_items (
  student_id uuid not null references public.students(id) on delete cascade,
  item_key text not null check (item_key ~ '^(err|hw|gr):[A-Za-z0-9:_-]{1,200}$'),
  kind text not null check (kind in ('error','homework','grammar')),
  label text not null default '' check (char_length(label) <= 120),   -- grammar topic / main category, for the overview
  streak integer not null default 0,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  due_at timestamptz not null default now(),
  last_practiced_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (student_id, item_key)
);
create index if not exists practice_items_due_idx on public.practice_items(student_id, due_at);
alter table public.practice_items enable row level security;
drop policy if exists "practice items read" on public.practice_items;
create policy "practice items read" on public.practice_items for select to authenticated using (public.can_access_student(student_id));
revoke insert, update, delete on public.practice_items from anon, authenticated;
grant select on public.practice_items to authenticated;

-- Same rhythm as the word list: wrong → again in ~10 minutes; right → 1, 2.2, 4.8, 10.6 … days (max 60).
create or replace function public.record_practice_item(p_student uuid, p_key text, p_kind text, p_label text, p_correct boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare s int; d numeric;
begin
  if not (public.is_linked_student(p_student) or public.is_student_teacher(p_student)) then raise exception 'Not authorized'; end if;
  insert into public.practice_items(student_id, item_key, kind, label) values (p_student, p_key, p_kind, left(coalesce(p_label, ''), 120))
  on conflict (student_id, item_key) do update set label = case when excluded.label <> '' then excluded.label else public.practice_items.label end;
  select streak into s from public.practice_items where student_id = p_student and item_key = p_key for update;
  s := case when p_correct then s + 1 else 0 end;
  d := case when not p_correct then 0.007 else least(60, power(2.2, s - 1)) end;
  update public.practice_items set streak = s,
    correct_count = correct_count + (case when p_correct then 1 else 0 end),
    wrong_count = wrong_count + (case when p_correct then 0 else 1 end),
    due_at = now() + make_interval(secs => d * 86400), last_practiced_at = now()
  where student_id = p_student and item_key = p_key;
end; $$;
revoke all on function public.record_practice_item(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.record_practice_item(uuid, text, text, text, boolean) to authenticated;
