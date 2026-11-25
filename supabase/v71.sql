-- v71: "Graag behandelen" — a student asks for a learning-line topic; the teacher may accept it and link it to a lesson.
-- Additive only (one new table). A request never changes a status and is never "covered" by itself.
create table if not exists public.topic_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  goal_id uuid not null references public.curriculum_goals(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'accepted', 'declined')),
  lesson_goal_id uuid references public.lesson_goals(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, goal_id)   -- no double requests
);
create index if not exists topic_requests_student_idx on public.topic_requests(student_id, status);
alter table public.topic_requests enable row level security;

drop policy if exists "topic requests read" on public.topic_requests;
create policy "topic requests read" on public.topic_requests for select to authenticated
  using (public.can_access_student(student_id));
-- the linked student asks (open, not linked to a lesson) for a topic it may see
drop policy if exists "topic requests student insert" on public.topic_requests;
create policy "topic requests student insert" on public.topic_requests for insert to authenticated
  with check (public.is_linked_student(student_id) and status = 'open' and lesson_goal_id is null
    and exists (select 1 from public.curriculum_goals g join public.students s on s.id = student_id
                where g.id = goal_id and (g.owner_teacher is null or g.owner_teacher = s.teacher_id)));
-- the student withdraws only an open request
drop policy if exists "topic requests student delete" on public.topic_requests;
create policy "topic requests student delete" on public.topic_requests for delete to authenticated
  using (public.is_linked_student(student_id) and status = 'open');
-- the teacher of this student accepts / declines / links / removes
drop policy if exists "topic requests teacher" on public.topic_requests;
create policy "topic requests teacher" on public.topic_requests for all to authenticated
  using (public.is_student_teacher(student_id)) with check (public.is_student_teacher(student_id));
grant select, insert, update, delete on public.topic_requests to authenticated;
