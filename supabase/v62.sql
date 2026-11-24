-- =====================================================================
-- TeachyRooms v62 — central word bank: grammar per word + source page.
--
-- Run ONCE in the Supabase SQL Editor AFTER v61.sql. NON-DESTRUCTIVE: two nullable columns and one replaced
-- function (same signature). No word, practice result or canvas page is changed. Idempotent.
--
--   vocab_items.grammar      jsonb with the word's grammar (article/plural/gender, verb forms with H/Z or the
--                            Portuguese tenses, comparative/superlative, …) — filled once, reused, never overwritten
--   vocab_lessons.source_page   the canvas page a word came from (several sources per word are kept)
-- vocab_merge: same deduplication as before (one word per student relation = per teacher+language, by its base
-- form); existing words only get EMPTY fields filled — the teacher's corrections and all practice results stay.
-- =====================================================================
alter table public.vocab_items add column if not exists grammar jsonb;
alter table public.vocab_lessons add column if not exists source_page text;

create or replace function public.vocab_merge(p_student uuid, p_items jsonb, p_source text, p_lesson_date date, p_lesson_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare it jsonb; t text; vid uuid; added int := 0; linked int := 0; src text; d date := coalesce(p_lesson_date, current_date); lid uuid; g jsonb;
begin
  if not public.is_student_teacher(p_student) then raise exception 'Not authorized'; end if;
  src := case when p_source in ('canvas','ai','error','teacher','student','lesson') then p_source else 'lesson' end;
  select l.id into lid from public.lessons l where l.id = p_lesson_id and l.student_id = p_student;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    t := btrim(regexp_replace(left(coalesce(it->>'term', ''), 200), '\s+', ' ', 'g'));
    if t = '' then continue; end if;
    g := case when jsonb_typeof(it->'grammar') = 'object' and length((it->'grammar')::text) <= 6000 then it->'grammar' end;
    select v.id into vid from public.vocab_items v where v.student_id = p_student and lower(v.term) = lower(t);
    if vid is null then
      insert into public.vocab_items(student_id, term, translation, example, kind, source, lesson_date, lesson_id, pos, lang, difficult, grammar)
      values (p_student, t, left(coalesce(it->>'translation', ''), 300), left(coalesce(it->>'example', ''), 500),
              case when it->>'kind' in ('word','expression') then it->>'kind' when t ~ '\s' then 'expression' else 'word' end,
              case when src in ('canvas','teacher','student','lesson') then src else 'ai' end, d, lid,
              nullif(left(coalesce(it->>'pos', ''), 40), ''),
              case when coalesce(it->>'lang', '') ~ '^[a-z]{2}(-[A-Z]{2})?$' then it->>'lang' end,
              coalesce((it->>'difficult')::boolean, false), g)
      on conflict do nothing returning id into vid;
      if vid is null then select v.id into vid from public.vocab_items v where v.student_id = p_student and lower(v.term) = lower(t); else added := added + 1; end if;
    else
      update public.vocab_items v set
        translation = case when v.translation = '' then left(coalesce(it->>'translation', ''), 300) else v.translation end,
        example = case when v.example = '' then left(coalesce(it->>'example', ''), 500) else v.example end,
        pos = coalesce(v.pos, nullif(left(coalesce(it->>'pos', ''), 40), '')),
        grammar = coalesce(v.grammar, g),                                                  -- never overwrites
        difficult = v.difficult or coalesce((it->>'difficult')::boolean, false),
        due_at = case when coalesce((it->>'difficult')::boolean, false) then least(v.due_at, now()) else v.due_at end,
        updated_at = now()
      where v.id = vid;
      linked := linked + 1;
    end if;
    if vid is not null then
      insert into public.vocab_lessons(vocab_id, student_id, lesson_date, lesson_id, source, source_page)
      values (vid, p_student, d, lid, src, nullif(left(coalesce(it->>'page', ''), 120), ''))
      on conflict (vocab_id, lesson_date) do update set source_page = coalesce(public.vocab_lessons.source_page, excluded.source_page);
    end if;
    vid := null;
  end loop;
  return jsonb_build_object('added', added, 'linked', linked);
end; $$;
