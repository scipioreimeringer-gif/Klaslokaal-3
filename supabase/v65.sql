-- =====================================================================
-- TeachyRooms v65 — reliable import of big historical word lists from the canvas: progress per page is stored, so
-- the import continues after closing the page or switching students, batch by batch, with bounded retries.
--
-- Run ONCE in the Supabase SQL Editor AFTER v64.sql. NON-DESTRUCTIVE: one new table. Idempotent.
-- =====================================================================
create table if not exists public.vocab_import_progress (
  student_id uuid not null references public.students(id) on delete cascade,
  page_hash text not null,                      -- the page content: changed content = a new import from the start
  page_index integer not null default 0,
  page_title text,
  total integer not null default 0,             -- candidate words on the page
  next_offset integer not null default 0,       -- everything before this has been processed and saved
  added integer not null default 0,
  known integer not null default 0,             -- already in the word list (learning results kept)
  skipped integer not null default 0,           -- not vocabulary (headings, sentences, names …) — listed, never silent
  skipped_terms jsonb not null default '[]'::jsonb,
  attempts integer not null default 0,          -- failed attempts of the current batch (max 3, then status failed)
  status text not null default 'running' check (status in ('running','done','failed')),
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (student_id, page_hash)
);
alter table public.vocab_import_progress enable row level security;
drop policy if exists vocab_import_progress_teacher on public.vocab_import_progress;
create policy vocab_import_progress_teacher on public.vocab_import_progress for all to authenticated
  using (public.is_student_teacher(student_id)) with check (public.is_student_teacher(student_id));
grant select, insert, update, delete on public.vocab_import_progress to authenticated;
