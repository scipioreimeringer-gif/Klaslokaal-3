-- =====================================================================
-- TeachyRooms v40 — translations of approved lesson summaries (bilingual view).
--
-- Run ONCE in the Supabase SQL Editor AFTER v38.sql.
-- NON-DESTRUCTIVE: adds one table and one helper function. Nothing existing is changed.
-- Idempotent: safe to run twice.
--
-- Why a separate table: the existing translation_cache is readable by every logged-in user,
-- so private lesson texts must not go there. Rows here are visible only to the teacher and the
-- linked student of that analysis, and only for approved, non-TEST analyses.
-- =====================================================================

create or replace function public.can_read_analysis(aid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.lesson_analyses a
    where a.id = aid and a.status = 'approved' and not coalesce(a.is_test, false) and public.can_access_student(a.student_id));
$$;
revoke all on function public.can_read_analysis(uuid) from public;
grant execute on function public.can_read_analysis(uuid) to authenticated;

create table if not exists public.analysis_translations (
  analysis_id uuid not null references public.lesson_analyses(id) on delete cascade,
  lang text not null check (lang ~ '^[a-z]{2}$'),
  content_hash text not null check (char_length(content_hash) = 64),
  texts jsonb not null check (jsonb_typeof(texts) = 'array' and jsonb_array_length(texts) <= 120),
  created_at timestamptz not null default now(),
  primary key (analysis_id, lang, content_hash)
);
alter table public.analysis_translations enable row level security;

drop policy if exists "analysis translations read" on public.analysis_translations;
create policy "analysis translations read" on public.analysis_translations
  for select to authenticated using (public.can_read_analysis(analysis_id));
drop policy if exists "analysis translations insert" on public.analysis_translations;
create policy "analysis translations insert" on public.analysis_translations
  for insert to authenticated with check (public.can_read_analysis(analysis_id));
-- no update/delete policies: a translation belongs to one content version; a changed text gets a new row
