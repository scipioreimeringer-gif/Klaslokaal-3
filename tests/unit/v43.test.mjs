// v43: lessons from real joint presence, dashboard counts without doubles, lesson cards → their own report,
// grammar groups, word classes, classroom close/fullscreen, unlinking.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mergeLessons, distinctWords, lessonsPerMonth, LEGACY_UNTIL} from '../../lib/stats.ts';
import {lessonCards, errorCount} from '../../lib/lessonCards.ts';
import {grammarGroup, groupCategories} from '../../lib/analysis/groups.ts';
import {groupByPos, posKindOf, grammarLabel} from '../../lib/vocab/grammar.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const html = read('public/legacy/index.html');
const S = (id, day, at, joint, reg = true, extra = {}) => ({id, student_id: 'r1', lesson_date: day, started_at: `${day}T${at}:00Z`, joint_seconds: joint, registered_at: reg ? `${day}T${at}:05Z` : null, ...extra});

test('only registered sessions count; two lessons on one day = two; words of the day counted once', () => {
  const entries = [{student_id: 'r1', lesson_date: '2026-11-25', words: [{nl: 'a'}, {nl: 'b'}]}];
  const m = mergeLessons(entries, [S('s1', '2026-11-25', '10:00', 1800), S('s2', '2026-11-25', '15:00', 1500), S('s3', '2026-11-25', '18:00', 40, false)]);
  assert.equal(m.length, 2, 'the 40 s session (below threshold) is not a lesson');
  assert.equal(m.reduce((n, l) => n + (Array.isArray(l.words) ? l.words.length : 0), 0), 2, 'words of the lesson day once');
  assert.equal(lessonsPerMonth(m, 1, new Date('2026-11-30T12:00:00Z'))[0].value, 2);
});
test('no lesson without joint presence: a lesson day with only notes after v43 does not count; older history does', () => {
  const after = {student_id: 'r1', lesson_date: '2026-12-01', words: []}, before = {student_id: 'r1', lesson_date: '2026-10-01', words: [{nl: 'x'}]};
  const m = mergeLessons([after, before], []);
  assert.deepEqual(m.map(l => l.lesson_date), ['2026-10-01']);
  assert.ok(LEGACY_UNTIL >= '2026-11-19');
  assert.equal(mergeLessons([after, before], null).length, 2, 'migration not run yet → old behaviour (one per lesson day)');
  assert.equal(mergeLessons([before], [S('s1', '2026-10-01', '10:00', 900)]).length, 1, 'an old day with a session is not counted twice');
});
test('word count from the real word list, never twice', () => {
  assert.equal(distinctWords([{student_id: 'r1', term: 'de fiets'}, {student_id: 'r1', term: 'De fiets '}, {student_id: 'r1', term: 'lopen'}, {student_id: 'r2', term: 'lopen'}, {student_id: 'r1', term: ''}]), 3);
});
test('lesson cards: numbered, newest first, minutes from joint presence, own report via the recording, no report twice', () => {
  const sessions = [S('s1', '2026-11-25', '10:00', 1810, true, {recording_id: 'rec1'}), S('s2', '2026-11-25', '15:00', 1500), S('s3', '2026-11-27', '10:00', 3000)];
  const analyses = [{id: 'a1', lesson_date: '2026-11-25', status: 'approved', recording_id: 'rec1', final: {version: 2, categories: [{examples: [{certainty: 'certain'}, {certainty: 'uncertain'}, {certainty: 'certain'}]}]}}];
  const cards = lessonCards([], sessions, analyses);
  assert.deepEqual(cards.map(c => c.number), [3, 2, 1]);
  const first = cards.find(c => c.key === 's1'), second = cards.find(c => c.key === 's2');
  assert.equal(first.minutes, 30); assert.equal(first.analysis.id, 'a1'); assert.equal(first.errors, 2, 'uncertain errors are not counted'); assert.ok(first.recording);
  assert.equal(second.analysis, null, 'the other lesson of that day does not get the same report'); assert.equal(second.status, 'none');
  assert.equal(cards[0].status, 'none', 'a lesson without recording is registered, report not available');
});
test('report by lesson day when there is no recording link (older analyses)', () => {
  const cards = lessonCards([{student_id: 'r1', lesson_date: '2026-10-01', words: []}], [], [{id: 'a9', lesson_date: '2026-10-01', status: 'approved', final: {corrections: [{certainty: 'certain'}]}}]);
  assert.equal(cards[0].analysis.id, 'a9'); assert.equal(cards[0].errors, 1); assert.equal(cards[0].minutes, null);
  assert.equal(errorCount(null), null);
});

test('grammar groups: Dutch and Brazilian Portuguese topics, counts summed, "Overig" last', () => {
  assert.equal(grammarGroup('Perfectum met zijn', 'perfect', 'nl'), 'Werkwoorden en tijden');
  assert.equal(grammarGroup('Inversie na tijdsbepaling', 'inversion', 'nl'), 'Woordvolgorde');
  assert.equal(grammarGroup('de/het', 'article', 'nl'), 'Lidwoorden (de/het)');
  assert.equal(grammarGroup('Ser vs. estar', 'ser_estar', 'pt'), 'Ser en estar');
  assert.equal(grammarGroup('Concordância nominal', 'agreement', 'pt'), 'Overeenstemming (concordância)');
  assert.equal(grammarGroup('Contração (no, na, do)', 'prep', 'pt'), 'Voorzetsels en samentrekkingen');
  assert.equal(grammarGroup('Pretérito perfeito', 'tense', 'pt'), 'Werkwoorden en tijden');
  assert.equal(grammarGroup('Iets heel anders', 'x', 'nl'), 'Overig');
  const g = groupCategories([{label: 'Perfectum', key: 'a', count: 2}, {label: 'Imperfectum', key: 'b', count: 3}, {label: 'Iets', key: 'c', count: 9}, {label: 'Inversie', key: 'd', count: 1}], 'nl');
  assert.deepEqual(g.map(x => [x.group, x.count]), [['Werkwoorden en tijden', 5], ['Woordvolgorde', 1], ['Overig', 9]]);
});
test('report order: errors first … homework last; "Oefen dit onderwerp" only after a click; teacher approval kept', () => {
  const r = read('components/LessonReport.tsx');
  const order = ['"Fouten en verbeteringen"', '"Grammaticale aandachtspunten"', '"Woordenlijst van deze les"', '"Verdieping"', '"Samenvatting en opdrachten"'].map(k => r.indexOf(k)); // v44 order
  assert.ok(order.every(i => i > 0) && order.every((v, i) => !i || v > order[i - 1]), 'sections in the required order');
  assert.match(r, /practise\?<div className="lr-practise"><SelfPractice studentId=\{studentId\} level=\{level\} topic=\{c\.label\}\/><\/div>/);
  assert.ok(!/authedPost|\/api\/ai|useEffect/.test(r), 'opening a report calls no AI');
  assert.match(read('components/Analysis.tsx'), /\{v2\?<LessonReport doc=\{shownDoc as unknown as AnalysisV2\}/, 'students read approved reports only (existing RPC)');
  assert.match(read('components/AnalysisV2.tsx'), /<LessonReport doc=\{doc\} teacher lessonLang=\{lessonLang\}\/>/, 'teacher previews what the student will see');
});
test('lesson card click opens the page of THAT lesson (v44), with its own report', () => {
  const ws = read('components/StudentData.tsx');
  assert.match(ws, /const openLesson=\(k:string\)=>\{setTabState\('lessen'\);setLesson\(k\)/);
  assert.match(ws, /card\?<LessonDetail card=\{card\}/);
  assert.match(read('components/LessonCards.tsx'), /onClick=\{\(\)=>onOpen\(c\)\}/);
});

test('word classes: nouns with article, verbs, adjectives, adverbs, prepositions, conjunctions, expressions — grouped, no duplicates', () => {
  assert.equal(grammarLabel({pos: 'preposition'}, 'nl'), 'vz.'); assert.equal(grammarLabel({pos: 'conjunction'}, 'pt'), 'conj.');
  assert.equal(posKindOf('znw. · het'), 'noun'); assert.equal(posKindOf('vw.'), 'conjunction'); assert.equal(posKindOf('vrije tekst'), 'other');
  const g = groupByPos([{term: 'omdat', pos: 'vw.'}, {term: 'het brood', pos: 'znw. · het'}, {term: 'lopen', pos: 'ww.'}, {term: 'Het brood', pos: 'znw. · het'}, {term: 'naar', pos: 'vz.'}, {term: 'vaak', pos: 'bijw.'}]);
  assert.deepEqual(g.map(x => [x.kind, x.items.length]), [['noun', 1], ['verb', 1], ['adverb', 1], ['preposition', 1], ['conjunction', 1]]);
  const ai = read('pages/api/ai.js');
  assert.match(ai, /precies een van: bijwoord, voorzetsel, voegwoord, uitdrukking, voorbeeldzin, overig/);
  assert.match(ai, /Adverbs go to overig with soort "bijwoord", prepositions with soort "voorzetsel", conjunctions with soort "voegwoord"/, 'other lesson languages (pt-BR) too');
  assert.match(ai, /function normalizeSort\(result\)/);
  assert.match(html, /var SOORT_TITLE = \[\["bijwoord","Bijwoorden"\],\["voorzetsel","Voorzetsels"\],\["voegwoord","Voegwoorden"\],\["uitdrukking","Uitdrukkingen"\]/);
  assert.match(read('components/Learning.tsx'), /POS_GROUP_ORDER\.map\(k=>\[k,rows\.filter\(s=>posKindOf\(s\.pos\)===k\)\] as const\)/, 'teacher suggestions grouped, each row stays editable');
});

test('classroom: joint presence counted on the teacher device only, heartbeat ~30 s, refresh/reconnect keep the session', () => {
  assert.match(html, /function lssOn\(\)\{ var b = bridge\(\); return !!\(SB && isT && b && b\.role === "teacher" && b\.presence\) && !lssOff; \}/);
  assert.match(html, /if\(presence\(\)\.st === "ok"\)\{/, 'only while the student is really connected (green dot)');
  assert.match(html, /now - lssSent < 30e3/, 'no request per second');
  assert.match(html, /if\(s && s\.key && now - \(s\.last \|\| 0\) < LSS_GRACE && \(s\.lesson \|\| ""\) === lesson\) LSS = s;/, 'refresh within the grace period → same session');
  assert.match(html, /if\(r\.expired\)\{ LSS = \{key:lssNewKey\(\)/, 'server says the old one is closed → a new lesson');
  assert.match(html, /if\(r\.error === "migration"\)\{ lssOff = true; return; \}/, 'classroom keeps working without v43.sql');
  const b = read('lib/classroomBridge.ts');
  assert.match(b, /db\.rpc\('lesson_presence', \{sid: opts\.studentId, skey: p\.key, joint: Math\.max\(0, Math\.round\(p\.joint\)\), planned: opts\.lessonId \|\| null, day: localDate\(\)\}\)/);
  const mod = html.slice(html.indexOf('v43: AUTOMATIC LESSON REGISTRATION'), html.indexOf('var queue = [],'));
  assert.ok(!/new Peer\(|getUserMedia|iceServers|TURN_SERVERS/.test(mod), 'WebRTC/TURN untouched');
});
test('classroom: X on Canvas/Bord/Scherm uses the same OPEN state as the dock; board full screen with one-click return', () => {
  assert.match(html, /\[\["cv", pCv\.querySelector\("\.cvtb"\) \|\| cvHead, "Canvas sluiten"\], \["wb", wbGrp, "Bord sluiten"\], \["scr", pSl\.querySelector\("\.slbar"\) \|\| pSl\.querySelector\("\.phead"\), "Scherm sluiten"\]\]/);
  assert.match(html, /var ftBar = pWb\.querySelector\("#ftools"\); if\(ftBar\) ftBar\.appendChild\(wbGrp\);/, 'in the visible board toolbar, outside its scrolling tool list');
  assert.match(html, /body\.wb-max #ws\{z-index:79!important;position:relative\}/, 'above the top bar and the video window');
  assert.match(html, /if\(k === "scr"\) \{ if\(OPEN\.scr\) toggle\("scr"\); \} else setOpen\(k, false, "user"\); \}/, 'closing Scherm never silently stops sharing; v46: closing Canvas is a shared decision');
  assert.match(read('components/Games.tsx'), /className="gx-close"/, 'Spelletjes keeps its own X (→ __klasToggle games false)');
  assert.match(html, /wbMaxBtn\.title = on \? "Terug naar het klaslokaal" : "Bord op volledig scherm";/);
  assert.match(html, /if\(e\.key === "Escape" && document\.body\.classList\.contains\("wb-max"\)\) wbMax\(false\);/);
  assert.match(html, /body\.wb-max #pWb\{position:fixed!important;inset:8px!important/);
});
test('next lessons: "DAARNA" with the next three, clickable to the classroom', () => {
  const a = read('components/Agenda.tsx');
  assert.match(a, /\.sort\(\(a,b\)=>a\.starts_at\.localeCompare\(b\.starts_at\)\)\.slice\(0,3\)/);
  assert.match(a, /<h4>\{t\('DAARNA'\)\}<\/h4>/);
  assert.match(a, /<Link className="iconbtn ar-open" href=\{classroomHref\(l,mode\)\}/, 'v45: classroom via its own button (v57: with the role); name → profile, row → details');
});
test('unlinking: teacher and student, checked on the server, nothing deleted', () => {
  assert.match(read('app/leerlingen/page.tsx'), /t\("Weet je zeker dat je deze leerling wilt ontkoppelen\?"\)/);
  const home = read('app/page.tsx');
  assert.match(home, /rpc\('student_leave_teacher',\{target:id\}\)/);
  assert.match(read('supabase/v28.sql'), /update public\.students set user_id = null, updated_at = now\(\) where id = target and user_id = \(select auth\.uid\(\)\);/);
  const v43 = read('supabase/v43.sql').replace(/--.*$/gm, '');
  assert.ok(!/\bdrop table\b|\bdelete from\b|\btruncate\b/i.test(v43), 'migration is non-destructive');
});
test('dashboard: counts from registered lessons, words from the real word list; compact empty charts', () => {
  const home = read('app/page.tsx');
  // v73: the loader moved to components/DashData.tsx; the student's numbers come from components/Progress.tsx (word bank rows)
  assert.match(read('components/DashData.tsx'), /lessons:mergeLessons\(\(l\.data\|\|\[\]\) as LessonLike\[\],sessions\)/);
  assert.match(read('components/Progress.tsx'), /lessons:mergeLessons\(\(le\.data\|\|\[\]\) as LessonLike\[\]/);
  assert.match(read('lib/data.ts'), /progressOf\(mergeLessons\(L, sessions\)/);
  assert.match(read('components/Charts.tsx'), /\(empty\?' is-empty':''\)/);
});
