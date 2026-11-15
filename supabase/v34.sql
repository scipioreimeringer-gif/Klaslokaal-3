-- =====================================================================
-- TeachyRooms v34 — AI lesson analysis 2.0 + personal learning path.
--
-- Run ONCE in the Supabase SQL Editor AFTER v33.sql.
-- NON-DESTRUCTIVE: only adds columns (with defaults), tables, functions, triggers,
-- policies and standard curriculum topics. Existing analyses, progress, homework
-- and own topics stay exactly as they are. One CHECK constraint is widened
-- (more topic categories allowed); existing rows already satisfy it.
-- Idempotent: safe to run twice.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Analysis pipeline state (steps, retries, publication)
-- ---------------------------------------------------------------------
alter table public.lesson_analyses add column if not exists pipeline_version integer not null default 1;
alter table public.lesson_analyses add column if not exists stage text;
alter table public.lesson_analyses add column if not exists stage_detail jsonb not null default '{}'::jsonb;
alter table public.lesson_analyses add column if not exists lease_until timestamptz;
alter table public.lesson_analyses add column if not exists published_at timestamptz;

-- Intermediate results per transcript part: a failed part is retried alone, done parts are never redone.
create table if not exists public.lesson_analysis_parts (
  analysis_id uuid not null references public.lesson_analyses(id) on delete cascade,
  idx integer not null check (idx >= 0),
  status text not null check (status in ('done','failed')),
  result jsonb,
  error text,
  attempts integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (analysis_id, idx)
);
alter table public.lesson_analysis_parts enable row level security;
drop policy if exists "analysis parts teacher" on public.lesson_analysis_parts;
create policy "analysis parts teacher" on public.lesson_analysis_parts for all to authenticated
  using (exists (select 1 from public.lesson_analyses a where a.id = analysis_id and public.is_student_teacher(a.student_id)))
  with check (exists (select 1 from public.lesson_analyses a where a.id = analysis_id and public.is_student_teacher(a.student_id)));
grant select, insert, update, delete on public.lesson_analysis_parts to authenticated;

-- Only one runner at a time per analysis (prevents double analyses and double counting).
create or replace function public.claim_analysis(p_id uuid, p_seconds integer default 290) returns boolean
language plpgsql set search_path = '' as $$
declare ok boolean;
begin
  update public.lesson_analyses set lease_until = now() + make_interval(secs => greatest(30, least(p_seconds, 900)))
   where id = p_id and (lease_until is null or lease_until < now()) returning true into ok;
  return coalesce(ok, false);
end; $$;
create or replace function public.release_analysis(p_id uuid) returns void
language sql set search_path = '' as $$ update public.lesson_analyses set lease_until = null where id = p_id; $$;
grant execute on function public.claim_analysis(uuid, integer), public.release_analysis(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Homework drafts from an analysis: one per analysis, never for TEST analyses,
--    never visible to the student before the teacher publishes (existing RLS on published_at).
-- ---------------------------------------------------------------------
alter table public.assignments add column if not exists analysis_id uuid references public.lesson_analyses(id) on delete set null;
create unique index if not exists assignments_analysis_unique on public.assignments(analysis_id) where analysis_id is not null;
create or replace function public.check_assignment_analysis() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.analysis_id is not null and exists (select 1 from public.lesson_analyses a where a.id = new.analysis_id and (a.is_test or a.student_id <> new.student_id)) then
    raise exception 'Homework cannot come from a test analysis or another student';
  end if;
  return new;
end; $$;
drop trigger if exists assignments_analysis_guard on public.assignments;
create trigger assignments_analysis_guard before insert or update of analysis_id on public.assignments for each row execute function public.check_assignment_analysis();

-- ---------------------------------------------------------------------
-- 3. Personal learning path
-- ---------------------------------------------------------------------
-- more topic categories (grammar, vocabulary, sentence structure, communication, pronunciation, own)
alter table public.curriculum_goals drop constraint if exists curriculum_goals_skill_check;
alter table public.curriculum_goals add constraint curriculum_goals_skill_check
  check (skill in ('woordenschat','grammatica','spreken','luisteren','lezen','schrijven','overig','zinsbouw','communicatie','uitspraak'));

-- per student: hide, rename or move a topic; lesson references. Statuses stay the four existing ones:
--   not_started = Niet behandeld · covered = Behandeld · in_progress = Nog oefenen · mastered = Beheerst
alter table public.student_goal_progress add column if not exists hidden boolean not null default false;
alter table public.student_goal_progress add column if not exists title_override text check (title_override is null or char_length(title_override) between 1 and 200);
alter table public.student_goal_progress add column if not exists level_override text check (level_override is null or level_override in ('A0','A1','A2','B1','B2','C1','C2'));
alter table public.student_goal_progress add column if not exists lesson_refs jsonb not null default '[]'::jsonb;
alter table public.student_goal_progress drop constraint if exists student_goal_progress_basis_check;
alter table public.student_goal_progress add constraint student_goal_progress_basis_check check (basis in ('teacher','ai_confirmed','practice','intake'));

alter table public.students add column if not exists target_level text check (target_level is null or target_level in ('A0','A1','A2','B1','B2','C1','C2'));

-- "Vandaag werken we aan…": planned goals per lesson and what was actually covered
create table if not exists public.lesson_goals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_date date not null,
  lesson_id uuid references public.lessons(id) on delete set null,
  goal_id uuid references public.curriculum_goals(id) on delete set null,
  custom_title text check (custom_title is null or char_length(custom_title) between 1 and 200),
  outcome text not null default 'planned' check (outcome in ('planned','covered','not_covered')),
  created_at timestamptz not null default now(),
  constraint lesson_goal_has_content check (goal_id is not null or custom_title is not null)
);
create index if not exists lesson_goals_student_idx on public.lesson_goals(student_id, lesson_date desc);
alter table public.lesson_goals enable row level security;
drop policy if exists "lesson goals read" on public.lesson_goals;
create policy "lesson goals read" on public.lesson_goals for select to authenticated using (public.can_access_student(student_id));
drop policy if exists "lesson goals teacher" on public.lesson_goals;
create policy "lesson goals teacher" on public.lesson_goals for all to authenticated
  using (public.is_student_teacher(student_id)) with check (public.is_student_teacher(student_id));
grant select, insert, update, delete on public.lesson_goals to authenticated;

-- What a student may read of analyses: only published (status approved) and never TEST (unchanged from v33).

-- ---------------------------------------------------------------------
-- 4. Standard curriculum per language (CEFR-oriented; A0 = practical beginners' phase, not an official level).
--    Stable codes; 'on conflict do nothing' never overwrites existing topics or personal changes.
-- ---------------------------------------------------------------------
insert into public.curriculum_goals(code, subject, level, skill, title, description, sort) values
 -- Dutch (additions to the v28 list)
 ('nl-A0-uit-1','nl','A0','uitspraak','Klanken en spelling: ui, eu, ij/ei, g, ch','huis, neus, mijn/klein, goed, lachen',3),
 ('nl-A0-gr-1','nl','A0','grammatica','Persoonlijke voornaamwoorden','ik, jij/je, u, hij, zij/ze, wij/we, jullie, zij/ze',4),
 ('nl-A1-gr-5','nl','A1','grammatica','Ontkenning met niet en geen','Ik werk niet. Ik heb geen auto.',5),
 ('nl-A1-gr-6','nl','A1','grammatica','Bezittelijke voornaamwoorden','mijn, jouw/je, zijn, haar, ons/onze, hun',6),
 ('nl-A1-gr-7','nl','A1','grammatica','Modale werkwoorden','kunnen, willen, moeten, mogen + infinitief aan het eind',7),
 ('nl-A1-zb-1','nl','A1','zinsbouw','Hoofdzin: werkwoord op plaats 2','Ik woon in Utrecht. Morgen werk ik.',1),
 ('nl-A1-gr-8','nl','A1','grammatica','Gebiedende wijs','Kom binnen! Neem een stoel.',8),
 ('nl-A2-gr-5','nl','A2','grammatica','Trappen van vergelijking','groot – groter – grootst; meer/meest',5),
 ('nl-A2-gr-6','nl','A2','grammatica','Toekomst met gaan en zullen','Ik ga morgen werken. Ik zal je bellen.',6),
 ('nl-A2-gr-7','nl','A2','grammatica','Hebben of zijn in de voltooide tijd','Ik heb gewerkt. Ik ben gegaan.',7),
 ('nl-A2-gr-8','nl','A2','grammatica','Wederkerende werkwoorden','zich voelen, zich vergissen: ik voel me',8),
 ('nl-A2-zb-1','nl','A2','zinsbouw','Inversie na tijdsbepaling en vraagwoord','Gisteren ging ik… Waarom kom je…?',1),
 ('nl-A2-zb-2','nl','A2','zinsbouw','Nevenschikking: en, maar, want, of, dus','geen inversie na en/maar/want/of',2),
 ('nl-A2-uit-1','nl','A2','uitspraak','Klemtoon en zinsmelodie','klemtoon in samengestelde woorden; vraagintonatie',1),
 ('nl-B1-gr-4','nl','B1','grammatica','Betrekkelijke bijzinnen: die, dat, waar-','de man die…, het huis dat…, de stad waar…',4),
 ('nl-B1-gr-5','nl','B1','grammatica','Conditionalis: zou + infinitief','Ik zou graag… Als ik tijd had, zou ik…',5),
 ('nl-B1-gr-6','nl','B1','grammatica','Te + infinitief en om te','Ik probeer te komen. Ik leer Nederlands om te werken.',6),
 ('nl-B1-gr-7','nl','B1','grammatica','Voltooid verleden tijd','Ik had al gegeten toen hij kwam.',7),
 ('nl-B1-zb-1','nl','B1','zinsbouw','Werkwoordclusters in bijzinnen','…omdat ik niet heb kunnen komen',1),
 ('nl-B1-gr-8','nl','B1','grammatica','Indirecte rede','Hij zei dat hij moe was.',8),
 ('nl-B2-gr-2','nl','B2','grammatica','Lijdende vorm in alle tijden','Het huis is/werd/was gebouwd',2),
 ('nl-B2-zb-1','nl','B2','zinsbouw','Verbindingswoorden en samenhang','echter, bovendien, daardoor, ondanks',1),
 ('nl-B2-ws-2','nl','B2','woordenschat','Vaste voorzetsels bij werkwoorden','wachten op, denken aan, zich ergeren aan',2),
 ('nl-C1-gr-1','nl','C1','grammatica','Nominalisatie en formele constructies','het nemen van een besluit; hetgeen, alwaar',1),
 ('nl-C1-zb-1','nl','C1','zinsbouw','Nuance en modaliteit','wellicht, enigszins, nauwelijks; modale partikels (even, maar, toch)',1),
 -- Portuguese (Brazil) additions
 ('pt-A0-uit-1','pt','A0','uitspraak','Klanken: nasale klinkers, lh/nh, r','pão, mãe, filho, banho, carro/caro',2),
 ('pt-A1-gr-5','pt','A1','grammatica','Persoonlijke voornaamwoorden en você/a gente','eu, você, ele/ela, nós/a gente, vocês, eles',5),
 ('pt-A1-gr-6','pt','A1','grammatica','Bezittelijke voornaamwoorden','meu/minha, seu/sua, dele/dela, nosso/nossa',6),
 ('pt-A1-gr-7','pt','A1','grammatica','Ontkenning en vragen met não','Não falo. Você não vem?',7),
 ('pt-A1-zb-1','pt','A1','zinsbouw','Basiswoordvolgorde S-V-O','Eu como pão. A gente mora aqui.',1),
 ('pt-A2-gr-5','pt','A2','grammatica','Perfeito vs. imperfeito','fui (afgerond) vs. ia (gewoonte/achtergrond)',5),
 ('pt-A2-gr-6','pt','A2','grammatica','Estar + gerúndio','Estou trabalhando. Estava chovendo.',6),
 ('pt-A2-gr-7','pt','A2','grammatica','Vergelijkingen','mais… do que, menos… do que, tão… quanto, melhor/pior',7),
 ('pt-A2-zb-1','pt','A2','zinsbouw','Plaats van voornaamwoorden (Braziliaans)','Me liga. Eu te vi. (proclise in spreektaal)',1),
 ('pt-B1-gr-4','pt','B1','grammatica','Betrekkelijke voornaamwoorden','que, quem, onde, o qual, cujo',4),
 ('pt-B1-gr-5','pt','B1','grammatica','Futuro do subjuntivo','quando eu tiver tempo, se você puder',5),
 ('pt-B1-zb-1','pt','B1','zinsbouw','Verbindingswoorden','porque, mas, então, embora, mesmo que',1),
 ('pt-B2-gr-2','pt','B2','grammatica','Lijdende vorm en se-passief','Foi construído… Vendem-se casas.',2),
 ('pt-B2-gr-3','pt','B2','grammatica','Samengestelde tijden','tinha feito, terei feito, teria feito',3),
 ('pt-C1-gr-1','pt','C1','grammatica','Mesóclise en formeel register','far-se-á, dir-lhe-ia (geschreven, formeel)',1),
 -- English
 ('en-A0-ws-1','en','A0','woordenschat','Begroetingen, getallen, dagen','hello, please, thank you; numbers, days, colours',1),
 ('en-A0-uit-1','en','A0','uitspraak','Basisklanken en th','think, this; long and short vowels',2),
 ('en-A0-sp-1','en','A0','communicatie','Jezelf voorstellen','My name is… I am from… I live in…',3),
 ('en-A1-gr-1','en','A1','grammatica','to be en have got','I am, you are, she is; I have got',1),
 ('en-A1-gr-2','en','A1','grammatica','Present simple','I work, she works; do/does in questions and negatives',2),
 ('en-A1-gr-3','en','A1','grammatica','Lidwoorden a/an/the','a book, an apple, the station',3),
 ('en-A1-gr-4','en','A1','grammatica','Meervoud en countable/uncountable','books, children; some water, many/much',4),
 ('en-A1-gr-5','en','A1','grammatica','Present continuous','I am working now',5),
 ('en-A1-zb-1','en','A1','zinsbouw','Woordvolgorde S-V-O en bijwoorden van frequentie','I always drink tea.',1),
 ('en-A1-gr-6','en','A1','grammatica','Voorzetsels van tijd en plaats','in, on, at',6),
 ('en-A2-gr-1','en','A2','grammatica','Past simple (regelmatig en onregelmatig)','worked, went, saw; did in questions',1),
 ('en-A2-gr-2','en','A2','grammatica','Toekomst: going to en will','I am going to travel. I will help you.',2),
 ('en-A2-gr-3','en','A2','grammatica','Vergelijkingen','bigger, the biggest, more interesting',3),
 ('en-A2-gr-4','en','A2','grammatica','Modals: can, must, have to, should','You should rest.',4),
 ('en-A2-gr-5','en','A2','grammatica','Past continuous','I was reading when she called.',5),
 ('en-A2-sp-1','en','A2','communicatie','Vertellen over ervaringen','weekend, travel, work',1),
 ('en-B1-gr-1','en','B1','grammatica','Present perfect vs. past simple','I have lived here since 2020 / I lived there in 2019',1),
 ('en-B1-gr-2','en','B1','grammatica','First en second conditional','If it rains, I will… If I had…, I would…',2),
 ('en-B1-gr-3','en','B1','grammatica','Relative clauses','who, which, that, where',3),
 ('en-B1-gr-4','en','B1','grammatica','Passive voice','It was built in 1900.',4),
 ('en-B1-gr-5','en','B1','grammatica','Gerund en infinitive','enjoy doing, want to do',5),
 ('en-B1-zb-1','en','B1','zinsbouw','Verbindingswoorden','however, although, because of, so that',1),
 ('en-B1-sp-1','en','B1','communicatie','Mening geven en argumenteren','In my opinion… On the other hand…',1),
 ('en-B2-gr-1','en','B2','grammatica','Third en mixed conditionals','If I had known, I would have…',1),
 ('en-B2-gr-2','en','B2','grammatica','Reported speech','She said she was tired.',2),
 ('en-B2-gr-3','en','B2','grammatica','Present/past perfect continuous','I have been waiting for an hour.',3),
 ('en-B2-ws-1','en','B2','woordenschat','Phrasal verbs en collocaties','look forward to, make a decision',1),
 ('en-C1-gr-1','en','C1','grammatica','Inversie voor nadruk','Never have I seen… Not only… but also',1),
 ('en-C1-ws-1','en','C1','woordenschat','Register en idioom','formal vs. informal, idiomatic expressions',1),
 ('en-C2-sp-1','en','C2','communicatie','Precies en genuanceerd formuleren','hedging, irony, implication',1),
 -- Spanish
 ('es-A0-ws-1','es','A0','woordenschat','Saludos, números, días','hola, gracias, por favor; números, días de la semana',1),
 ('es-A0-uit-1','es','A0','uitspraak','Klanken: r/rr, j, ñ, ll','pero/perro, jamón, año, llamar',2),
 ('es-A1-gr-1','es','A1','grammatica','Presente: regelmatige werkwoorden','-ar, -er, -ir: hablo, como, vivo',1),
 ('es-A1-gr-2','es','A1','grammatica','Ser, estar en hay','Soy de… Estoy cansado. Hay un banco.',2),
 ('es-A1-gr-3','es','A1','grammatica','Lidwoorden en geslacht','el/la/los/las, un/una; el agua',3),
 ('es-A1-gr-4','es','A1','grammatica','Onregelmatige presente','tener, ir, hacer; e>ie, o>ue',4),
 ('es-A1-gr-5','es','A1','grammatica','Gustar en vergelijkbare werkwoorden','Me gusta… Me gustan…',5),
 ('es-A1-zb-1','es','A1','zinsbouw','Vragen en ontkenning','¿Dónde vives? No hablo inglés.',1),
 ('es-A2-gr-1','es','A2','grammatica','Pretérito perfecto','He comido. Hoy he trabajado.',1),
 ('es-A2-gr-2','es','A2','grammatica','Pretérito indefinido','Ayer fui al cine. Comí paella.',2),
 ('es-A2-gr-3','es','A2','grammatica','Pretérito imperfecto','De niño vivía en… Hacía sol.',3),
 ('es-A2-gr-4','es','A2','grammatica','Ir a + infinitivo','Voy a estudiar.',4),
 ('es-A2-gr-5','es','A2','grammatica','Lijdend en meewerkend voorwerp','lo, la, le, se lo',5),
 ('es-A2-gr-6','es','A2','grammatica','Por vs. para','por la mañana, para ti',6),
 ('es-B1-gr-1','es','B1','grammatica','Indefinido vs. imperfecto','acción vs. descripción en el pasado',1),
 ('es-B1-gr-2','es','B1','grammatica','Presente de subjuntivo','Espero que vengas. Quiero que…',2),
 ('es-B1-gr-3','es','B1','grammatica','Futuro y condicional','Iré… Me gustaría…',3),
 ('es-B1-gr-4','es','B1','grammatica','Imperativo','habla, no hables, hágalo',4),
 ('es-B1-zb-1','es','B1','zinsbouw','Relativos y conectores','que, donde, aunque, sin embargo',1),
 ('es-B1-sp-1','es','B1','communicatie','Opinar y argumentar','creo que, no creo que + subjuntivo',1),
 ('es-B2-gr-1','es','B2','grammatica','Imperfecto de subjuntivo y si-zinnen','Si tuviera tiempo, viajaría.',1),
 ('es-B2-gr-2','es','B2','grammatica','Estilo indirecto','Dijo que vendría.',2),
 ('es-B2-gr-3','es','B2','grammatica','Pasiva y se impersonal','Se venden pisos.',3),
 ('es-C1-gr-1','es','C1','grammatica','Subjuntivo en todas sus formas','hubiera hecho, aunque + subjuntivo',1),
 ('es-C1-ws-1','es','C1','woordenschat','Expresiones idiomáticas y registro','formal, coloquial, regional',1),
 ('es-C2-sp-1','es','C2','communicatie','Precisión y matices','ironía, implícitos',1),
 -- French
 ('fr-A0-ws-1','fr','A0','woordenschat','Salutations, nombres, jours','bonjour, merci, s’il vous plaît; nombres, jours',1),
 ('fr-A0-uit-1','fr','A0','uitspraak','Klanken: nasalen, u/ou, r, liaison','vin, bon; tu/tout; les amis',2),
 ('fr-A1-gr-1','fr','A1','grammatica','Présent: être, avoir, -er-werkwoorden','je suis, j’ai, je parle',1),
 ('fr-A1-gr-2','fr','A1','grammatica','Lidwoorden en geslacht','le/la/les, un/une/des, du/de la',2),
 ('fr-A1-gr-3','fr','A1','grammatica','Ontkenning ne… pas','Je ne parle pas.',3),
 ('fr-A1-gr-4','fr','A1','grammatica','Onregelmatige présent','aller, faire, venir, prendre',4),
 ('fr-A1-gr-5','fr','A1','grammatica','Bijvoeglijk naamwoord: plaats en overeenkomst','une petite maison, des livres intéressants',5),
 ('fr-A1-zb-1','fr','A1','zinsbouw','Vragen stellen','Est-ce que… ? Où habites-tu ?',1),
 ('fr-A2-gr-1','fr','A2','grammatica','Passé composé met avoir en être','j’ai mangé, je suis allé(e)',1),
 ('fr-A2-gr-2','fr','A2','grammatica','Imparfait','Quand j’étais petit…',2),
 ('fr-A2-gr-3','fr','A2','grammatica','Futur proche en futur simple','Je vais partir. Je partirai.',3),
 ('fr-A2-gr-4','fr','A2','grammatica','Pronoms COD/COI','le, la, lui, leur',4),
 ('fr-A2-gr-5','fr','A2','grammatica','Pronominale werkwoorden','se lever, s’appeler',5),
 ('fr-A2-gr-6','fr','A2','grammatica','Vergelijkingen','plus… que, moins… que, meilleur',6),
 ('fr-B1-gr-1','fr','B1','grammatica','Passé composé vs. imparfait','action vs. description',1),
 ('fr-B1-gr-2','fr','B1','grammatica','Subjonctif présent','il faut que tu viennes',2),
 ('fr-B1-gr-3','fr','B1','grammatica','Conditionnel en si-zinnen','Si j’avais le temps, je voyagerais.',3),
 ('fr-B1-gr-4','fr','B1','grammatica','Pronoms relatifs','qui, que, où, dont',4),
 ('fr-B1-gr-5','fr','B1','grammatica','Pronoms y en en','J’y vais. J’en veux.',5),
 ('fr-B1-zb-1','fr','B1','zinsbouw','Connecteurs','parce que, pourtant, donc, bien que',1),
 ('fr-B2-gr-1','fr','B2','grammatica','Plus-que-parfait en conditionnel passé','Si j’avais su, je serais venu.',1),
 ('fr-B2-gr-2','fr','B2','grammatica','Discours indirect','Il a dit qu’il viendrait.',2),
 ('fr-B2-gr-3','fr','B2','grammatica','Voix passive','La maison a été construite…',3),
 ('fr-C1-gr-1','fr','C1','grammatica','Subjonctif passé en nuances','bien qu’il soit venu, à moins que',1),
 ('fr-C1-ws-1','fr','C1','woordenschat','Registres et expressions','soutenu, courant, familier',1),
 ('fr-C2-sp-1','fr','C2','communicatie','Précision et nuance','ironie, implicite',1),
 -- German
 ('de-A0-ws-1','de','A0','woordenschat','Begrüßung, Zahlen, Tage','hallo, danke, bitte; Zahlen, Wochentage',1),
 ('de-A0-uit-1','de','A0','uitspraak','Klanken: ü, ö, ä, ch, z, sch','über, schön, ich/ach, Zeit',2),
 ('de-A1-gr-1','de','A1','grammatica','Präsens: regelmatige werkwoorden en sein/haben','ich wohne, du wohnst; ich bin, ich habe',1),
 ('de-A1-gr-2','de','A1','grammatica','Lidwoorden en geslacht (Nominativ)','der, die, das; ein, eine',2),
 ('de-A1-gr-3','de','A1','grammatica','Akkusativ','den Mann, einen Kaffee',3),
 ('de-A1-gr-4','de','A1','grammatica','Modalverben','können, müssen, wollen + Infinitiv am Ende',4),
 ('de-A1-gr-5','de','A1','grammatica','Trennbare Verben','Ich stehe um 7 Uhr auf.',5),
 ('de-A1-zb-1','de','A1','zinsbouw','Verbzweitstellung en inversie','Morgen fahre ich nach Berlin.',1),
 ('de-A1-gr-6','de','A1','grammatica','Ontkenning nicht/kein','Ich habe kein Auto.',6),
 ('de-A2-gr-1','de','A2','grammatica','Perfekt met haben en sein','ich habe gearbeitet, ich bin gefahren',1),
 ('de-A2-gr-2','de','A2','grammatica','Dativ','mit dem Bus, ich helfe dir',2),
 ('de-A2-gr-3','de','A2','grammatica','Wechselpräpositionen','in die Stadt / in der Stadt',3),
 ('de-A2-gr-4','de','A2','grammatica','Präteritum van sein, haben, Modalverben','war, hatte, konnte',4),
 ('de-A2-gr-5','de','A2','grammatica','Vergelijkingen','größer als, am größten',5),
 ('de-A2-zb-1','de','A2','zinsbouw','Bijzinnen met weil, dass, wenn','…, weil ich müde bin.',1),
 ('de-B1-gr-1','de','B1','grammatica','Adjektivdeklination','der große Mann, ein großer Mann',1),
 ('de-B1-gr-2','de','B1','grammatica','Präteritum van sterke werkwoorden','ging, kam, sah',2),
 ('de-B1-gr-3','de','B1','grammatica','Konjunktiv II','Ich würde… Wenn ich Zeit hätte…',3),
 ('de-B1-gr-4','de','B1','grammatica','Relativsätze','der Mann, der…; die Frau, die…',4),
 ('de-B1-gr-5','de','B1','grammatica','Passiv (Präsens/Präteritum)','Das Haus wird/wurde gebaut.',5),
 ('de-B1-zb-1','de','B1','zinsbouw','Konnektoren','deshalb, trotzdem, obwohl',1),
 ('de-B2-gr-1','de','B2','grammatica','Genitiv en genitief-voorzetsels','wegen des Wetters, trotz',1),
 ('de-B2-gr-2','de','B2','grammatica','Indirekte Rede (Konjunktiv I)','Er sagt, er sei müde.',2),
 ('de-B2-gr-3','de','B2','grammatica','Nominalisierung en Partizipialattribute','die gestern gekaufte Zeitung',3),
 ('de-C1-ws-1','de','C1','woordenschat','Nomen-Verb-Verbindungen en register','eine Entscheidung treffen',1),
 ('de-C2-sp-1','de','C2','communicatie','Präzise und nuanciert formulieren','Ironie, Implikationen',1)
on conflict (code) do nothing;
