-- =====================================================================
-- TeachyRooms v47 — one central word list per student, linked to every lesson a word appears in.
--
-- Run ONCE in the Supabase SQL Editor AFTER v46.sql.
-- NON-DESTRUCTIVE: adds one table, one trigger and one function; existing words are linked to their current
-- lesson date (copy only). No word is ever deleted or overwritten by a new lesson. Idempotent: safe to run twice.
--
-- * vocab_items stays THE word list (one row per word per student: unique lower(term)).
-- * vocab_lessons records in which lessons a word appeared (canvas, AI report, corrected mistakes, teacher, student).
-- * vocab_merge() is the single entry point for automatic words: new words are added, existing words only get empty
--   fields filled in (translation, example, word class) and a link to the lesson — never a duplicate.
-- =====================================================================

create table if not exists public.vocab_lessons (
  vocab_id uuid not null references public.vocab_items(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_date date not null,
  lesson_id uuid references public.lessons(id) on delete set null,
  source text not null default 'lesson' check (source in ('canvas','ai','error','teacher','student','lesson')),
  created_at timestamptz not null default now(),
  primary key (vocab_id, lesson_date)
);
create index if not exists vocab_lessons_student_idx on public.vocab_lessons(student_id, lesson_date desc);
alter table public.vocab_lessons enable row level security;
drop policy if exists "vocab lessons read" on public.vocab_lessons;
create policy "vocab lessons read" on public.vocab_lessons for select to authenticated using (public.can_access_student(student_id));
revoke insert, update, delete on public.vocab_lessons from anon, authenticated;
grant select on public.vocab_lessons to authenticated;

-- every word with a lesson date is linked to that lesson (also words added by hand or by older code)
create or replace function public.vocab_items_link_lesson() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.lesson_date is not null then
    insert into public.vocab_lessons(vocab_id, student_id, lesson_date, lesson_id, source)
    values (new.id, new.student_id, new.lesson_date, new.lesson_id,
            case when new.source in ('canvas','ai','teacher','student','lesson') then new.source else 'lesson' end)
    on conflict do nothing;
  end if;
  return new;
end; $$;
drop trigger if exists vocab_items_link_lesson on public.vocab_items;
create trigger vocab_items_link_lesson after insert or update of lesson_date on public.vocab_items for each row execute function public.vocab_items_link_lesson();

insert into public.vocab_lessons(vocab_id, student_id, lesson_date, lesson_id, source)
select v.id, v.student_id, v.lesson_date, v.lesson_id, case when v.source in ('canvas','ai','teacher','student','lesson') then v.source else 'lesson' end
from public.vocab_items v where v.lesson_date is not null
on conflict do nothing;

-- p_items: [{term, translation, example, pos, kind, lang, difficult}]
create or replace function public.vocab_merge(p_student uuid, p_items jsonb, p_source text, p_lesson_date date, p_lesson_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare it jsonb; t text; vid uuid; added int := 0; linked int := 0; src text; d date := coalesce(p_lesson_date, current_date); lid uuid;
begin
  if not public.is_student_teacher(p_student) then raise exception 'Not authorized'; end if;
  src := case when p_source in ('canvas','ai','error','teacher','student','lesson') then p_source else 'lesson' end;
  select l.id into lid from public.lessons l where l.id = p_lesson_id and l.student_id = p_student;   -- only a lesson of this relation
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    t := btrim(regexp_replace(left(coalesce(it->>'term', ''), 200), '\s+', ' ', 'g'));
    if t = '' then continue; end if;
    select v.id into vid from public.vocab_items v where v.student_id = p_student and lower(v.term) = lower(t);
    if vid is null then
      insert into public.vocab_items(student_id, term, translation, example, kind, source, lesson_date, lesson_id, pos, lang, difficult)
      values (p_student, t, left(coalesce(it->>'translation', ''), 300), left(coalesce(it->>'example', ''), 500),
              case when it->>'kind' in ('word','expression') then it->>'kind' when t ~ '\s' then 'expression' else 'word' end,
              case when src in ('canvas','teacher','student','lesson') then src else 'ai' end, d, lid,
              nullif(left(coalesce(it->>'pos', ''), 40), ''),
              case when coalesce(it->>'lang', '') ~ '^[a-z]{2}(-[A-Z]{2})?$' then it->>'lang' end,
              coalesce((it->>'difficult')::boolean, false))
      on conflict do nothing returning id into vid;
      if vid is null then select v.id into vid from public.vocab_items v where v.student_id = p_student and lower(v.term) = lower(t); else added := added + 1; end if;
    else
      update public.vocab_items v set
        translation = case when v.translation = '' then left(coalesce(it->>'translation', ''), 300) else v.translation end,
        example = case when v.example = '' then left(coalesce(it->>'example', ''), 500) else v.example end,
        pos = coalesce(v.pos, nullif(left(coalesce(it->>'pos', ''), 40), '')),
        difficult = v.difficult or coalesce((it->>'difficult')::boolean, false),
        due_at = case when coalesce((it->>'difficult')::boolean, false) then least(v.due_at, now()) else v.due_at end,
        updated_at = now()
      where v.id = vid;
      linked := linked + 1;
    end if;
    if vid is not null then
      insert into public.vocab_lessons(vocab_id, student_id, lesson_date, lesson_id, source) values (vid, p_student, d, lid, src) on conflict do nothing;
    end if;
    vid := null;
  end loop;
  return jsonb_build_object('added', added, 'linked', linked);
end; $$;
revoke all on function public.vocab_merge(uuid, jsonb, text, date, uuid) from public, anon;
grant execute on function public.vocab_merge(uuid, jsonb, text, date, uuid) to authenticated;
