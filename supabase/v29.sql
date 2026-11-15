-- =====================================================================
-- TeachyRooms v29 — "Mijn talen" (several languages, several teachers),
-- self-study languages, profile photos.
--
-- Run ONCE in the Supabase SQL Editor AFTER v28.sql.
-- NON-DESTRUCTIVE: no DROP TABLE / DROP COLUMN / DELETE / UPDATE of rows.
-- It only adds tables, columns, functions, policies and a storage bucket.
-- One schema relaxation (section 1): the old rule "one row per teacher +
-- student e-mail" becomes "one row per teacher + student + LANGUAGE", so a
-- teacher can teach the same student two languages. Duplicates for the same
-- teacher + language stay impossible. The new rule is created BEFORE the old
-- one is removed, so there is never a moment without protection, and all
-- existing rows already satisfy it (the old rule was stricter).
-- Idempotent: safe to run twice.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Language of a teacher–student relation (same rule as lib/learning.ts subjectOf)
-- ---------------------------------------------------------------------
create or replace function public.relation_language(cs text, subj text, ll text) returns text
language sql immutable set search_path = '' as $$
  select case
    when coalesce(cs, '') <> '' then cs
    when coalesce(subj, '') ~* 'portug' then 'pt'
    when coalesce(subj, '') ~* '(nederl|dutch|nt2)' then 'nl'
    else coalesce(nullif(ll, ''), 'nl') end
$$;

-- one relation per teacher + student e-mail + language
create unique index if not exists students_teacher_email_lang_unique
  on public.students(teacher_id, email, public.relation_language(curriculum_subject, subject, lesson_language));
-- one linked account per teacher + language
create unique index if not exists students_teacher_user_lang_unique
  on public.students(teacher_id, user_id, public.relation_language(curriculum_subject, subject, lesson_language))
  where user_id is not null;
-- the old, stricter rules (they blocked a second language with the same teacher)
alter table public.students drop constraint if exists students_teacher_id_email_key;
drop index if exists public.students_teacher_user_unique;

-- ---------------------------------------------------------------------
-- 2. Self-study languages (a language the student learns without a teacher yet)
-- ---------------------------------------------------------------------
create table if not exists public.student_languages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  language text not null check (language ~ '^[a-z]{2}$'),
  level text check (level is null or level in ('A0','A1','A2','B1','B2','C1','C2')),
  created_at timestamptz not null default now(),
  unique (user_id, language)
);
alter table public.student_languages enable row level security;
drop policy if exists "own languages read" on public.student_languages;
create policy "own languages read" on public.student_languages for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own languages insert" on public.student_languages;
create policy "own languages insert" on public.student_languages for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "own languages update" on public.student_languages;
create policy "own languages update" on public.student_languages for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "own languages delete" on public.student_languages;
create policy "own languages delete" on public.student_languages for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.student_languages to authenticated;

-- ---------------------------------------------------------------------
-- 3. Profile: photo + languages a teacher offers
--    (profiles has no client UPDATE policy on purpose: role must stay protected)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists teaching_languages text[] not null default '{}';

create or replace function public.set_my_avatar(path text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Log in first'; end if;
  if path is not null and path !~ ('^' || me::text || '/[A-Za-z0-9._-]{1,80}$') then raise exception 'Invalid avatar path'; end if;
  update public.profiles set avatar_path = path where id = me;
end; $$;

create or replace function public.set_my_teaching_languages(langs text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); l text;
begin
  if not exists (select 1 from public.profiles where id = me and role in ('teacher','admin')) then raise exception 'Only teachers'; end if;
  if coalesce(array_length(langs, 1), 0) > 12 then raise exception 'Too many languages'; end if;
  foreach l in array coalesce(langs, '{}') loop
    if l !~ '^[a-z]{2}$' then raise exception 'Invalid language'; end if;
  end loop;
  update public.profiles set teaching_languages = coalesce(langs, '{}') where id = me;
end; $$;

-- Do I share a teacher–student relation with this account (or is it me)?
create or replace function public.shares_relation(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select other is not null and (
    other = (select auth.uid())
    or exists (select 1 from public.students s
                where (s.teacher_id = (select auth.uid()) and s.user_id = other)
                   or (s.user_id = (select auth.uid()) and s.teacher_id = other)));
$$;

-- Name + photo of me, my teachers and my students' accounts (profiles RLS only exposes your own row).
create or replace function public.related_people()
returns table(user_id uuid, full_name text, avatar_path text, google_avatar text, teaching_languages text[])
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(nullif(p.full_name, ''), p.email), p.avatar_path,
         case when coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture', '') ~ '^https://'
              then coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture') end,
         p.teaching_languages
    from public.profiles p
    left join auth.users u on u.id = p.id
   where p.id = (select auth.uid())
      or p.id in (select s.teacher_id from public.students s where s.user_id = (select auth.uid()))
      or p.id in (select s.user_id from public.students s where s.teacher_id = (select auth.uid()) and s.user_id is not null);
$$;
revoke all on function public.set_my_avatar(text), public.set_my_teaching_languages(text[]), public.shares_relation(uuid), public.related_people() from public;
grant execute on function public.set_my_avatar(text), public.set_my_teaching_languages(text[]), public.shares_relation(uuid), public.related_people() to authenticated;

-- ---------------------------------------------------------------------
-- 4. Private storage bucket for profile photos. Path: <user_id>/<file>.webp
--    Max 2 MB, only JPG / PNG / WebP. Only the owner writes; the owner and
--    the people they have lessons with can read.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "avatars upload own" on storage.objects;
create policy "avatars upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "avatars update own" on storage.objects;
create policy "avatars update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "avatars delete own" on storage.objects;
create policy "avatars delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "avatars read related" on storage.objects;
create policy "avatars read related" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.shares_relation(public.try_uuid((storage.foldername(name))[1])));
