-- =====================================================================
-- TeachyRooms v46 — images in the shared Canvas.
--
-- Run ONCE in the Supabase SQL Editor AFTER v45.sql.
-- NON-DESTRUCTIVE: adds one private storage bucket and its policies. Idempotent: safe to run twice.
--
-- Files live in a PRIVATE bucket; the Canvas data only stores the path ("<student_id>/<sha256>.<ext>") and the width.
-- The file name is the SHA-256 of the content, so the same image is never stored twice for a student.
-- Who may: the teacher of the relation and the linked student read and add images of that student's Canvas;
-- only the teacher deletes. Nobody else (other students/teachers, anonymous users) can read them.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('canvas-images', 'canvas-images', false, 5242880, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "canvas images read" on storage.objects;
create policy "canvas images read" on storage.objects for select to authenticated
  using (bucket_id = 'canvas-images' and public.can_access_student(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists "canvas images add" on storage.objects;
create policy "canvas images add" on storage.objects for insert to authenticated
  with check (bucket_id = 'canvas-images'
    and public.can_access_student(public.try_uuid((storage.foldername(name))[1]))
    and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.(png|jpg|webp|gif)$');
drop policy if exists "canvas images delete" on storage.objects;
create policy "canvas images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'canvas-images' and public.is_student_teacher(public.try_uuid((storage.foldername(name))[1])));
