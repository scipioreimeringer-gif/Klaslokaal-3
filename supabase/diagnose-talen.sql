-- READ-ONLY diagnosis: which language does each teacher–student relation have, and why?
-- Changes nothing. Run in the Supabase SQL Editor and look at the columns
-- "taal", "taal_komt_van" and "gekoppeld".
select
  t.email                                   as docent,
  s.name                                    as leerling,
  s.email                                   as leerling_email,
  public.relation_language(s.curriculum_subject, s.subject, s.lesson_language) as taal,
  case when coalesce(s.curriculum_subject, '') <> '' then 'expliciet ingesteld (curriculum_subject)'
       when s.subject ~* 'portug|nederl|dutch|nt2'    then 'uit vaktekst: ' || s.subject
       else 'uit Lestaal van het klaslokaal: ' || s.lesson_language end as taal_komt_van,
  case when s.user_id is not null then 'ja'
       when exists (select 1 from auth.users u where lower(u.email) = lower(s.email)) then 'nee — account bestaat, uitnodiging nog niet geaccepteerd'
       else 'nee — nog geen account met dit e-mailadres' end as gekoppeld,
  s.archived_at is not null                 as gearchiveerd
from public.students s
join public.profiles t on t.id = s.teacher_id
order by t.email, lower(s.email), taal;
