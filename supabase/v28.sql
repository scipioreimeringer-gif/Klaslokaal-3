-- =====================================================================
-- TeachyRooms v28 — archiving, personal vocabulary, learning paths,
-- AI lesson analyses (teacher approval), practice results, translation cache.
--
-- Run ONCE in the Supabase SQL Editor AFTER v27.sql.
-- NON-DESTRUCTIVE: only adds tables/columns/functions/policies and inserts
-- seed data. No DROP TABLE / DROP COLUMN / DELETE / UPDATE of existing rows
-- (except copying existing lesson words into the new vocabulary table).
-- Idempotent: safe to run twice.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Teacher–student relation: archive + curriculum subject
--    (a students row IS one teacher–student relation; archiving it never
--    touches the student's relations with other teachers)
-- ---------------------------------------------------------------------
alter table public.students add column if not exists archived_at timestamptz;
alter table public.students add column if not exists curriculum_subject text;

-- Teacher ends the link with the student's account (row and data stay with the teacher).
create or replace function public.teacher_unlink_student(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_student_teacher(target) then raise exception 'Not authorized'; end if;
  update public.students set user_id = null, updated_at = now() where id = target;
end; $$;
-- Student leaves a teacher (only their own link).
create or replace function public.student_leave_teacher(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.students set user_id = null, updated_at = now() where id = target and user_id = (select auth.uid());
  if not found then raise exception 'Not linked'; end if;
end; $$;
revoke all on function public.teacher_unlink_student(uuid), public.student_leave_teacher(uuid) from public;
grant execute on function public.teacher_unlink_student(uuid), public.student_leave_teacher(uuid) to authenticated;

-- Preferred language for translations (profiles has no client UPDATE policy on purpose: role must stay protected).
alter table public.profiles add column if not exists preferred_language text not null default 'nl';
create or replace function public.set_my_language(lang text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if lang is null or lang !~ '^[a-z]{2}(-[A-Z]{2})?$' then raise exception 'Invalid language'; end if;
  update public.profiles set preferred_language = lang where id = (select auth.uid());
end; $$;
revoke all on function public.set_my_language(text) from public;
grant execute on function public.set_my_language(text) to authenticated;
-- Allow every user to read their own profile already exists ("own profile").

-- ---------------------------------------------------------------------
-- 2. Personal vocabulary per teacher–student relation
-- ---------------------------------------------------------------------
create table if not exists public.vocab_items (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  term text not null check (char_length(term) between 1 and 200),
  translation text not null default '',
  example text not null default '',
  kind text not null default 'word' check (kind in ('word','expression')),
  status text not null default 'new' check (status in ('new','practicing','mastered')),
  source text not null default 'teacher' check (source in ('teacher','lesson','ai','student')),
  lesson_date date,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  streak integer not null default 0,
  due_at timestamptz not null default now(),
  last_practiced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists vocab_items_unique_term on public.vocab_items(student_id, lower(term));
create index if not exists vocab_items_due_idx on public.vocab_items(student_id, due_at);
alter table public.vocab_items enable row level security;
drop policy if exists "vocab read" on public.vocab_items;
create policy "vocab read" on public.vocab_items for select to authenticated using (public.can_access_student(student_id));
drop policy if exists "vocab teacher write" on public.vocab_items;
create policy "vocab teacher write" on public.vocab_items for all to authenticated
  using (public.is_student_teacher(student_id)) with check (public.is_student_teacher(student_id));
drop policy if exists "vocab student insert" on public.vocab_items;
create policy "vocab student insert" on public.vocab_items for insert to authenticated
  with check (public.is_linked_student(student_id) and source = 'student' and status = 'new' and correct_count = 0 and wrong_count = 0);
drop policy if exists "vocab student edit own" on public.vocab_items;
create policy "vocab student edit own" on public.vocab_items for update to authenticated
  using (public.is_linked_student(student_id) and source = 'student')
  with check (public.is_linked_student(student_id) and source = 'student');
drop policy if exists "vocab student delete own" on public.vocab_items;
create policy "vocab student delete own" on public.vocab_items for delete to authenticated
  using (public.is_linked_student(student_id) and source = 'student');

-- Practice result for one item with simple spaced repetition (measured, not AI).
create or replace function public.record_vocab_practice(item uuid, correct boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v record; next_streak int; interval_days numeric;
begin
  select * into v from public.vocab_items where id = item for update;
  if not found or not public.can_access_student(v.student_id) then raise exception 'Not authorized'; end if;
  next_streak := case when correct then v.streak + 1 else 0 end;
  interval_days := case when not correct then 0.007 else least(60, power(2.2, next_streak - 1)) end; -- ~10 min, 1, 2.2, 4.8, 10.6 … days
  update public.vocab_items set
    correct_count = correct_count + (case when correct then 1 else 0 end),
    wrong_count = wrong_count + (case when correct then 0 else 1 end),
    streak = next_streak,
    status = case when next_streak >= 5 then 'mastered' else 'practicing' end,  -- mastery = 5 correct in a row, measured
    due_at = now() + make_interval(secs => interval_days * 86400),
    last_practiced_at = now(), updated_at = now()
  where id = item;
end; $$;
revoke all on function public.record_vocab_practice(uuid, boolean) from public;
grant execute on function public.record_vocab_practice(uuid, boolean) to authenticated;

-- Words the teacher adds in the live classroom flow into the vocabulary automatically.
create or replace function public.sync_lesson_words() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.vocab_items(student_id, term, translation, source, lesson_date)
  select new.student_id, trim(w->>'nl'), coalesce(trim(w->>'uit'), ''), 'lesson', new.lesson_date
    from jsonb_array_elements(coalesce(new.words, '[]'::jsonb)) w
   where coalesce(trim(w->>'nl'), '') <> '' and char_length(trim(w->>'nl')) <= 200
  on conflict (student_id, lower(term)) do update
    set translation = case when public.vocab_items.translation = '' then excluded.translation else public.vocab_items.translation end;
  return new;
end; $$;
drop trigger if exists lesson_words_to_vocab on public.lesson_entries;
create trigger lesson_words_to_vocab after insert or update of words on public.lesson_entries
  for each row execute function public.sync_lesson_words();
-- Backfill once from existing lessons (insert only, never overwrites).
insert into public.vocab_items(student_id, term, translation, source, lesson_date)
select le.student_id, trim(w->>'nl'), coalesce(trim(w->>'uit'), ''), 'lesson', le.lesson_date
  from public.lesson_entries le, jsonb_array_elements(coalesce(le.words, '[]'::jsonb)) w
 where coalesce(trim(w->>'nl'), '') <> '' and char_length(trim(w->>'nl')) <= 200
on conflict (student_id, lower(term)) do nothing;

-- ---------------------------------------------------------------------
-- 3. Learning paths (CEFR standard + teacher's own goals) and progress
-- ---------------------------------------------------------------------
create table if not exists public.curriculum_goals (
  id uuid primary key default gen_random_uuid(),
  code text unique,                      -- stable key for standard goals (seed); null for own goals
  subject text not null,                 -- 'nl', 'pt', later other languages / school subjects
  level text not null check (level in ('A0','A1','A2','B1','B2','C1','C2','-')),
  skill text not null check (skill in ('woordenschat','grammatica','spreken','luisteren','lezen','schrijven','overig')),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  sort integer not null default 0,
  owner_teacher uuid references public.profiles(id) on delete cascade,   -- null = standard goal
  created_at timestamptz not null default now()
);
create index if not exists curriculum_goals_subject_idx on public.curriculum_goals(subject, level, skill, sort);
alter table public.curriculum_goals enable row level security;
drop policy if exists "goals read" on public.curriculum_goals;
create policy "goals read" on public.curriculum_goals for select to authenticated
  using (owner_teacher is null or owner_teacher = (select auth.uid())
         or exists (select 1 from public.students s where s.teacher_id = owner_teacher and s.user_id = (select auth.uid())));
drop policy if exists "own goals write" on public.curriculum_goals;
create policy "own goals write" on public.curriculum_goals for all to authenticated
  using (owner_teacher = (select auth.uid()) and public.is_teacher())
  with check (owner_teacher = (select auth.uid()) and public.is_teacher() and code is null);

create table if not exists public.student_goal_progress (
  student_id uuid not null references public.students(id) on delete cascade,
  goal_id uuid not null references public.curriculum_goals(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started','in_progress','covered','mastered')),
  basis text not null default 'teacher' check (basis in ('teacher','ai_confirmed','practice')),
  note text not null default '',
  lesson_date date,
  updated_at timestamptz not null default now(),
  primary key (student_id, goal_id)
);
alter table public.student_goal_progress enable row level security;
drop policy if exists "goal progress read" on public.student_goal_progress;
create policy "goal progress read" on public.student_goal_progress for select to authenticated using (public.can_access_student(student_id));
drop policy if exists "goal progress teacher" on public.student_goal_progress;
create policy "goal progress teacher" on public.student_goal_progress for all to authenticated
  using (public.is_student_teacher(student_id)) with check (public.is_student_teacher(student_id));

-- ---------------------------------------------------------------------
-- 4. AI consent on recordings + lesson analyses (teacher approves)
-- ---------------------------------------------------------------------
alter table public.lesson_recordings add column if not exists ai_consent_teacher_at timestamptz;
alter table public.lesson_recordings add column if not exists ai_consent_student_at timestamptz;
alter table public.lesson_recordings add column if not exists expires_at timestamptz not null default (now() + interval '12 months');
alter table public.lesson_recordings add column if not exists lesson_date date;

create table if not exists public.lesson_analyses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  recording_id uuid unique references public.lesson_recordings(id) on delete set null,  -- one analysis per recording
  lesson_date date not null default current_date,
  status text not null default 'queued' check (status in ('queued','processing','ready','approved','failed')),
  transcript text,
  source_quality text not null default '',
  draft jsonb,
  final jsonb,
  error text,
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  expires_at timestamptz not null default (now() + interval '12 months'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lesson_analyses_student_idx on public.lesson_analyses(student_id, created_at desc);
alter table public.lesson_analyses enable row level security;
-- Only the teacher reads/writes the full row (transcript, draft). Students get the approved
-- summary through student_lesson_summaries() below — never drafts or unapproved content.
drop policy if exists "analyses teacher" on public.lesson_analyses;
drop policy if exists "analyses teacher read" on public.lesson_analyses;
create policy "analyses teacher read" on public.lesson_analyses for select to authenticated using (public.is_student_teacher(student_id));
drop policy if exists "analyses teacher insert" on public.lesson_analyses;
create policy "analyses teacher insert" on public.lesson_analyses for insert to authenticated
  with check (public.is_student_teacher(student_id) and created_by = (select auth.uid()));
drop policy if exists "analyses teacher update" on public.lesson_analyses;
create policy "analyses teacher update" on public.lesson_analyses for update to authenticated
  using (public.is_student_teacher(student_id)) with check (public.is_student_teacher(student_id));
drop policy if exists "analyses teacher delete" on public.lesson_analyses;
create policy "analyses teacher delete" on public.lesson_analyses for delete to authenticated using (public.is_student_teacher(student_id));
-- An analysis of a recording is only allowed when BOTH participants consented to AI processing.
create or replace function public.check_analysis_consent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.recording_id is not null and not exists (
    select 1 from public.lesson_recordings r where r.id = new.recording_id and r.student_id = new.student_id
      and r.ai_consent_teacher_at is not null and r.ai_consent_student_at is not null) then
    raise exception 'AI-analyse vereist toestemming van docent en leerling';
  end if;
  if new.status = 'approved' and new.final is null then raise exception 'Approved analysis needs a final version'; end if;
  return new;
end; $$;
drop trigger if exists analyses_consent on public.lesson_analyses;
create trigger analyses_consent before insert or update on public.lesson_analyses for each row execute function public.check_analysis_consent();

create or replace function public.student_lesson_summaries(sid uuid)
returns table(id uuid, lesson_date date, final jsonb, approved_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.lesson_date, a.final, a.approved_at from public.lesson_analyses a
   where a.student_id = sid and a.status = 'approved' and public.can_access_student(sid)
   order by a.lesson_date desc, a.approved_at desc;
$$;
revoke all on function public.student_lesson_summaries(uuid) from public;
grant execute on function public.student_lesson_summaries(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Practice sessions (games, self-made exercises, AI homework results)
-- ---------------------------------------------------------------------
alter table public.assignments add column if not exists exercises jsonb;
alter table public.assignments add column if not exists origin text not null default 'teacher';

create table if not exists public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  assignment_id uuid references public.assignments(id) on delete set null,  -- null = self-made practice
  score integer not null default 0 check (score >= 0),
  total integer not null default 0 check (total >= 0 and score <= total),
  duration_seconds integer not null default 0,
  details jsonb,
  created_at timestamptz not null default now()
);
alter table public.practice_sessions drop constraint if exists practice_sessions_kind_check;
alter table public.practice_sessions add constraint practice_sessions_kind_check check (kind in ('flashcards','quiz','typing','match','sentence','conjugate','errors','exercise','homework'));
create index if not exists practice_sessions_student_idx on public.practice_sessions(student_id, created_at desc);
alter table public.practice_sessions enable row level security;
drop policy if exists "practice read" on public.practice_sessions;
create policy "practice read" on public.practice_sessions for select to authenticated using (public.can_access_student(student_id));
drop policy if exists "practice student insert" on public.practice_sessions;
create policy "practice student insert" on public.practice_sessions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_linked_student(student_id));

-- ---------------------------------------------------------------------
-- 6. Translation cache (term + target language only; no lesson context stored)
-- ---------------------------------------------------------------------
create table if not exists public.translation_cache (
  key text primary key check (char_length(key) = 64),
  term text not null check (char_length(term) <= 200),
  target_lang text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.translation_cache enable row level security;
drop policy if exists "translation cache read" on public.translation_cache;
create policy "translation cache read" on public.translation_cache for select to authenticated using (true);
drop policy if exists "translation cache insert" on public.translation_cache;
create policy "translation cache insert" on public.translation_cache for insert to authenticated with check (true);

-- ---------------------------------------------------------------------
-- 7. Standard learning path seed: Dutch (nl) and Portuguese (pt), CEFR A0–C2.
--    A0 is an optional preparatory phase, not an official CEFR level.
--    Topics are typical anchors, not exclusive to one level.
-- ---------------------------------------------------------------------
insert into public.curriculum_goals(code, subject, level, skill, title, description, sort) values
 ('nl-A0-ws-1','nl','A0','woordenschat','Begroetingen en beleefdheid','hallo, dag, dank je, alsjeblieft, sorry',1),
 ('nl-A0-ws-2','nl','A0','woordenschat','Getallen, dagen en kleuren','0–100, dagen van de week, basiskleuren',2),
 ('nl-A0-sp-1','nl','A0','spreken','Jezelf voorstellen','naam, land, woonplaats, taal',1),
 ('nl-A0-lu-1','nl','A0','luisteren','Korte vragen verstaan','Hoe heet je? Waar woon je?',1),
 ('nl-A1-gr-1','nl','A1','grammatica','Tegenwoordige tijd','regelmatige werkwoorden; zijn, hebben, gaan, komen',1),
 ('nl-A1-gr-2','nl','A1','grammatica','Lidwoorden de/het/een','basisregels en veelvoorkomende het-woorden',2),
 ('nl-A1-gr-3','nl','A1','grammatica','Meervoud -en/-s','vorming en spelling',3),
 ('nl-A1-gr-4','nl','A1','grammatica','Vraagzinnen en inversie','vraagwoorden; werkwoord op plaats 1 of 2',4),
 ('nl-A1-ws-1','nl','A1','woordenschat','Dagelijks leven','wonen, eten, boodschappen, familie',1),
 ('nl-A1-sp-1','nl','A1','spreken','Eenvoudige gesprekken','iets vragen in een winkel, afspraak maken',1),
 ('nl-A1-le-1','nl','A1','lezen','Korte teksten','berichten, borden, eenvoudige formulieren',1),
 ('nl-A1-sc-1','nl','A1','schrijven','Kort bericht schrijven','een eenvoudige mail of app-bericht',1),
 ('nl-A2-gr-1','nl','A2','grammatica','Verleden tijd (imperfectum)','zwakke en sterke werkwoorden',1),
 ('nl-A2-gr-2','nl','A2','grammatica','Voltooide tijd (perfectum)','hebben/zijn + voltooid deelwoord',2),
 ('nl-A2-gr-3','nl','A2','grammatica','Scheidbare werkwoorden','opbellen, meenemen; plaats van het prefix',3),
 ('nl-A2-gr-4','nl','A2','grammatica','Bijvoeglijk naamwoord met -e','de grote auto, een groot huis',4),
 ('nl-A2-ws-1','nl','A2','woordenschat','Werk, gezondheid en reizen','afspraken bij de dokter, openbaar vervoer',1),
 ('nl-A2-sp-1','nl','A2','spreken','Vertellen over vroeger','ervaringen en gebeurtenissen beschrijven',1),
 ('nl-A2-lu-1','nl','A2','luisteren','Mededelingen begrijpen','omroepberichten, korte instructies',1),
 ('nl-A2-sc-1','nl','A2','schrijven','Korte tekst over ervaringen','weekend, vakantie, werk',1),
 ('nl-B1-gr-1','nl','B1','grammatica','Bijzinnen en woordvolgorde','omdat, dat, als, toen; werkwoord achteraan',1),
 ('nl-B1-gr-2','nl','B1','grammatica','Er en pronominale bijwoorden','erover, daarmee, waarvoor',2),
 ('nl-B1-gr-3','nl','B1','grammatica','Passief','worden/zijn + voltooid deelwoord',3),
 ('nl-B1-sp-1','nl','B1','spreken','Mening geven en argumenteren','ik vind dat…, daarom…, aan de andere kant…',1),
 ('nl-B1-sp-2','nl','B1','spreken','Langere gesprekken voeren','doorvragen, beurt nemen, herformuleren',2),
 ('nl-B1-le-1','nl','B1','lezen','Krantenartikelen hoofdlijnen','hoofdgedachte en argumenten herkennen',1),
 ('nl-B1-sc-1','nl','B1','schrijven','Formele brief of klacht','opbouw en beleefdheidsvormen',1),
 ('nl-B2-ws-1','nl','B2','woordenschat','Uitdrukkingen en collocaties','vaste combinaties, idioom',1),
 ('nl-B2-gr-1','nl','B2','grammatica','Complexe zinsbouw','tangconstructies, nominalisaties',1),
 ('nl-B2-sp-1','nl','B2','spreken','Vloeiend discussiëren','nuanceren, toegeven, weerleggen',1),
 ('nl-B2-sp-2','nl','B2','spreken','Formeel taalgebruik','presenteren, vergaderen, u-vorm',2),
 ('nl-B2-lu-1','nl','B2','luisteren','Radio en tv-programma''s','standaardtaal in normaal tempo',1),
 ('nl-C1-ws-1','nl','C1','woordenschat','Stijlregisters','informeel, neutraal, formeel, ambtelijk',1),
 ('nl-C1-le-1','nl','C1','lezen','Complexe en literaire teksten','impliciete betekenis en toon',1),
 ('nl-C1-sc-1','nl','C1','schrijven','Betogende teksten','helder gestructureerd, overtuigend',1),
 ('nl-C2-sp-1','nl','C2','spreken','Moeiteloos en precies formuleren','fijne betekenisnuances, humor, ironie',1),
 ('nl-C2-sc-1','nl','C2','schrijven','Professionele en academische teksten','stijl afstemmen op publiek en doel',1),
 ('pt-A0-ws-1','pt','A0','woordenschat','Saudações e cortesia','olá, bom dia, obrigado/a, por favor, desculpa',1),
 ('pt-A0-ws-2','pt','A0','woordenschat','Números, dias e cores','0–100, dias da semana, cores',2),
 ('pt-A0-sp-1','pt','A0','spreken','Apresentar-se','nome, país, cidade, idiomas',1),
 ('pt-A1-gr-1','pt','A1','grammatica','Presente do indicativo','verbos regulares -ar/-er/-ir; ser, estar, ter, ir',1),
 ('pt-A1-gr-2','pt','A1','grammatica','Ser vs. estar','permanente vs. tijdelijk, plaats, toestand',2),
 ('pt-A1-gr-3','pt','A1','grammatica','Artikelen en geslacht','o/a/os/as, um/uma; meervoud',3),
 ('pt-A1-gr-4','pt','A1','grammatica','Vraagzinnen','o que, quem, onde, quando, como, por que',4),
 ('pt-A1-ws-1','pt','A1','woordenschat','Dagelijks leven','casa, comida, família, compras',1),
 ('pt-A1-sp-1','pt','A1','spreken','Eenvoudige gesprekken','pedir no café, marcar um encontro',1),
 ('pt-A2-gr-1','pt','A2','grammatica','Pretérito perfeito','fui, tive, fiz, estive, quis, pude',1),
 ('pt-A2-gr-2','pt','A2','grammatica','Pretérito imperfeito','gewoontes en beschrijvingen in het verleden',2),
 ('pt-A2-gr-3','pt','A2','grammatica','Futuro com ir + infinitivo','vou viajar, vamos comer',3),
 ('pt-A2-gr-4','pt','A2','grammatica','Voornaamwoorden en contracties','do, na, pelo; me, te, lhe',4),
 ('pt-A2-ws-1','pt','A2','woordenschat','Expressões frequentes','ainda, já, valer a pena, dar certo, ficar',1),
 ('pt-A2-sp-1','pt','A2','spreken','Vertellen over vroeger','fim de semana, viagens, infância',1),
 ('pt-B1-gr-1','pt','B1','grammatica','Presente do subjuntivo','espero que, é importante que, talvez',1),
 ('pt-B1-gr-2','pt','B1','grammatica','Futuro do pretérito (condicional)','eu faria, gostaria de',2),
 ('pt-B1-gr-3','pt','B1','grammatica','Imperfeito do subjuntivo + se','se eu tivesse…, eu faria…',3),
 ('pt-B1-sp-1','pt','B1','spreken','Mening geven','acho que, na minha opinião, por outro lado',1),
 ('pt-B1-lu-1','pt','B1','luisteren','Gesprekken in normaal tempo','Braziliaans Portugees in alledaagse situaties',1),
 ('pt-B1-sc-1','pt','B1','schrijven','Mail en korte tekst','formeel en informeel register',1),
 ('pt-B2-gr-1','pt','B2','grammatica','Infinitivo pessoal','para nós irmos, é melhor eles saberem',1),
 ('pt-B2-ws-1','pt','B2','woordenschat','Idioom en collocaties','expressões idiomáticas, linguagem coloquial',1),
 ('pt-B2-sp-1','pt','B2','spreken','Vloeiend discussiëren','argumentar, concordar e discordar com nuance',1),
 ('pt-B2-le-1','pt','B2','lezen','Krantenartikelen en opinies','hoofd- en bijzaken, standpunt van de auteur',1),
 ('pt-C1-ws-1','pt','C1','woordenschat','Stijlregisters','formeel, informeel, regionaal (BR/PT)',1),
 ('pt-C1-sc-1','pt','C1','schrijven','Betogende teksten','coerência e coesão',1),
 ('pt-C2-sp-1','pt','C2','spreken','Precies en genuanceerd formuleren','humor, ironie, impliciete betekenis',1)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 8. Separate audio tracks per speaker (reliable attribution of errors)
--    The teacher's browser records the teacher mic and the student's incoming
--    audio as two extra files next to the mixed recording used for playback.
-- ---------------------------------------------------------------------
alter table public.lesson_recordings add column if not exists teacher_track_path text;
alter table public.lesson_recordings add column if not exists student_track_path text;

-- ---------------------------------------------------------------------
-- 9. AI usage log (cost tracking + fair-use limits). Users see their own usage; admins see all.
-- ---------------------------------------------------------------------
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  kind text not null check (kind in ('translate','tidy','analysis','transcription','exercises','prepare','assistant')),
  model text not null default '',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  audio_seconds integer not null default 0,
  cost_usd numeric(10,5) not null default 0,
  cached boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_day_idx on public.ai_usage(user_id, kind, created_at desc);
alter table public.ai_usage enable row level security;
drop policy if exists "ai usage own read" on public.ai_usage;
create policy "ai usage own read" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
drop policy if exists "ai usage own insert" on public.ai_usage;
create policy "ai usage own insert" on public.ai_usage for insert to authenticated with check (user_id = (select auth.uid()));
