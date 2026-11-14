-- TeachyRooms v26: run once AFTER v22 invitations. Existing data stays intact.
create table if not exists public.student_lesson_spaces (
 student_id uuid primary key references public.students(id) on delete cascade,
 shared_board text not null default '',
 updated_at timestamptz not null default now()
);
alter table public.student_lesson_spaces enable row level security;
drop policy if exists "lesson space read" on public.student_lesson_spaces;
create policy "lesson space read" on public.student_lesson_spaces for select to authenticated
 using (exists(select 1 from public.students s where s.id=student_id and (s.teacher_id=auth.uid() or s.user_id=auth.uid())));
drop policy if exists "lesson space insert" on public.student_lesson_spaces;
create policy "lesson space insert" on public.student_lesson_spaces for insert to authenticated
 with check (exists(select 1 from public.students s where s.id=student_id and (s.teacher_id=auth.uid() or s.user_id=auth.uid())));
drop policy if exists "lesson space update" on public.student_lesson_spaces;
create policy "lesson space update" on public.student_lesson_spaces for update to authenticated
 using (exists(select 1 from public.students s where s.id=student_id and (s.teacher_id=auth.uid() or s.user_id=auth.uid())))
 with check (exists(select 1 from public.students s where s.id=student_id and (s.teacher_id=auth.uid() or s.user_id=auth.uid())));
create table if not exists public.teacher_private_notes (
 student_id uuid primary key references public.students(id) on delete cascade,
 notes text not null default '', updated_at timestamptz not null default now()
);
alter table public.teacher_private_notes enable row level security;
drop policy if exists "private teacher read" on public.teacher_private_notes;
create policy "private teacher read" on public.teacher_private_notes for select to authenticated
 using (exists(select 1 from public.students s where s.id=student_id and s.teacher_id=auth.uid()));
drop policy if exists "private teacher insert" on public.teacher_private_notes;
create policy "private teacher insert" on public.teacher_private_notes for insert to authenticated
 with check (exists(select 1 from public.students s where s.id=student_id and s.teacher_id=auth.uid()));
drop policy if exists "private teacher update" on public.teacher_private_notes;
create policy "private teacher update" on public.teacher_private_notes for update to authenticated
 using (exists(select 1 from public.students s where s.id=student_id and s.teacher_id=auth.uid()))
 with check (exists(select 1 from public.students s where s.id=student_id and s.teacher_id=auth.uid()));
create table if not exists public.portuguese_checklists (
 user_id uuid primary key references auth.users(id) on delete cascade,
 completed jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.portuguese_checklists enable row level security;
drop policy if exists "own checklist read" on public.portuguese_checklists;
create policy "own checklist read" on public.portuguese_checklists for select to authenticated using(user_id=auth.uid());
drop policy if exists "own checklist insert" on public.portuguese_checklists;
create policy "own checklist insert" on public.portuguese_checklists for insert to authenticated with check(user_id=auth.uid());
drop policy if exists "own checklist update" on public.portuguese_checklists;
create policy "own checklist update" on public.portuguese_checklists for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
