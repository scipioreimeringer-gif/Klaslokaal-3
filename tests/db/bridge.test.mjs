// Integration test: the REAL classroom bridge (lib/classroomBridge.ts) and
// data loader (lib/data.ts), compiled by tsc, running against the REAL
// migrations + RLS in PGlite. Simulates: teacher opens student A's classroom,
// saves board/canvas/notes, reopens, switches to student B, student views, etc.
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {root, sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';
import {fakeSupabase} from './fake-supabase.mjs';
import {isDeepStrictEqual as same} from 'node:util';

// 1. Compile the TypeScript modules under test to CommonJS.
const out = path.join(root, 'tests', '.build');
execFileSync(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
  'lib/classroomMapping.ts', 'lib/classroomBridge.ts', 'lib/data.ts',
  '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--esModuleInterop', '--strict'], {cwd: root, stdio: 'inherit'});
const require = createRequire(import.meta.url);
const {createTeacherBridge, createStudentBridge} = require(path.join(out, 'classroomBridge.js'));
const {loadStudentBundle} = require(path.join(out, 'data.js'));

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };

// 2. Database with all migrations; dates returned as strings like PostgREST does.
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1114: v => v, 1184: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
await pg.exec(sql('v26.sql'));
await pg.exec(sql('v27.sql'));
// The bridge reads window.location.origin (browser code); set it only after PGlite has started.
globalThis.window = {location: {origin: 'https://teachyrooms.test'}};

const T = '00000000-0000-0000-0000-0000000000a1', ANA = '00000000-0000-0000-0000-0000000000a2', S1 = '00000000-0000-0000-0000-0000000000a3', S2 = '00000000-0000-0000-0000-0000000000a4';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${T}','t@x.nl',now()),('${ANA}','ana@x.br',now()),('${S1}','s1@x.nl',now()),('${S2}','s2@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T}','t@x.nl','teacher'),('${ANA}','ana@x.br','teacher'),('${S1}','s1@x.nl','student'),('${S2}','s2@x.nl','student') on conflict (id) do update set role=excluded.role;`);
const ins = await as(pg, T, () => pg.query(`insert into public.students(teacher_id,email,name,subject,level) values ($1,'s1@x.nl','Student A','Nederlands','B1'),($1,'s2@x.nl','Student B','Nederlands','A2') returning id,name`, [T]));
const [A, B] = ins.rows.sort((x, y) => x.name.localeCompare(y.name)).map(r => r.id);
await as(pg, S1, () => pg.query(`select public.accept_student_link($1)`, [A]));
await as(pg, S2, () => pg.query(`select public.accept_student_link($1)`, [B]));

const tdb = fakeSupabase(pg, T);
const today = '2026-11-14';
const bridgeFor = (db, sid, name, onSwitch = () => {}) => createTeacherBridge(db, {teacherId: db.uid, userId: db.uid, studentId: sid, studentName: name, onSwitch});

console.log('\n=== Teacher opens classroom of student A ===');
let br = bridgeFor(tdb, A, 'Student A');
let notes = await br.get('notes');
ok(notes.students.length === 2 && notes.sel === A, 'classroom loads both own students, student A selected');
ok((await br.get('board:' + A)) === null && (await br.get('canvas:' + A)) === null, 'empty board/canvas for a new student');
notes.lessons[A].push({date: today, notes: 'Perfectum geoefend', words: [{nl: 'fiets', uit: 'bike'}], hw: 'Schrijf 5 zinnen'});
notes.students[0].goal = 'B2 in juni';
await br.put('notes', notes);
const boardA = {list: ['wb:1', 'wb:2'], cur: 'wb:2', objs: {'wb:1': [{id: 'p1', c: '#0f2a2e', p: [100, 100, 2000, 2000]}], 'wb:2': [{id: 't1', ty: 'tx', c: '#d0523a', x: 500, y: 500, txt: 'Hallo A', w: 3000}]}};
const canvasA = {pages: [{id: 'c1', title: 'Pagina 1', html: '<div class="b" data-t="h">Les A</div>'}, {id: 'c2', title: 'Woorden', html: '<div class="b">fiets</div>'}], cur: 1};
await br.put('board:' + A, boardA);
await br.put('canvas:' + A, canvasA);
const rowA = await as(pg, T, () => pg.query(`select board, canvas from public.classroom_states where student_id=$1`, [A]));
ok(rowA.rows.length === 1 && rowA.rows[0].board.list.length === 2 && rowA.rows[0].canvas.pages.length === 2, 'board (2 pages) and canvas (2 pages) stored for A');
const goal = await as(pg, T, () => pg.query(`select goals from public.students where id=$1`, [A]));
ok(goal.rows[0].goals === 'B2 in juni', 'profile edit in classroom saved to students table');

console.log('\n=== Teacher re-opens the classroom (reload) ===');
br = bridgeFor(tdb, A, 'Student A');
notes = await br.get('notes');
const lA = notes.lessons[A].find(l => l.date === today);
ok(lA && lA.notes === 'Perfectum geoefend' && lA.words[0].nl === 'fiets' && lA.hw === 'Schrijf 5 zinnen', 'lesson notes, words and homework reload correctly');
ok(same(await br.get('board:' + A), boardA), 'whiteboard reloads identically');
ok(same(await br.get('canvas:' + A), canvasA), 'canvas pages reload identically');
// unchanged save must not write anything
const stamp = q => as(pg, T, () => pg.query(`select updated_at from public.lesson_entries where student_id=$1`, [A])).then(r => r.rows[0].updated_at);
const before = await stamp();
await new Promise(r => setTimeout(r, 20));
await br.put('notes', notes);
ok((await stamp()) === before, 'saving unchanged notes writes nothing');

console.log('\n=== Teacher switches to student B ===');
let switched = null;
br.switchStudent(B);
const br0 = bridgeFor(tdb, A, 'Student A', id => { switched = id; }); await br0.get('notes'); br0.switchStudent(B);
ok(switched === B, 'switchStudent asks the page to open B\'s own classroom');
const brB = bridgeFor(tdb, B, 'Student B');
const notesB = await brB.get('notes');
ok(notesB.sel === B && notesB.lessons[B].length === 0, 'B starts with no lessons');
ok((await brB.get('board:' + B)) === null, 'B has NOT inherited A\'s whiteboard');
await brB.put('board:' + B, {list: ['wb:1'], cur: 'wb:1', objs: {'wb:1': [{id: 'pb', c: '#2f6fd6', p: [1, 2, 3, 4]}]}});
notesB.lessons[B].push({date: today, notes: 'Les B', words: [], hw: ''});
await brB.put('notes', notesB);
const again = bridgeFor(tdb, A, 'Student A');
ok(same(await again.get('board:' + A), boardA), 'A\'s board unchanged after working with B');
const nA = await again.get('notes');
ok(nA.lessons[A].length === 1 && nA.lessons[A][0].notes === 'Perfectum geoefend' && nA.lessons[B][0].notes === 'Les B', 'lessons stay with the right student');

console.log('\n=== Other teacher (Ana) tries to access Scip\'s students ===');
const anaBr = bridgeFor(fakeSupabase(pg, ANA), A, 'x');
const anaNotes = await anaBr.get('notes');
ok(anaNotes.students.length === 0, 'Ana sees none of Scip\'s students');
ok((await anaBr.get('board:' + A)) === null, 'Ana cannot read A\'s board');
await anaBr.put('board:' + A, {list: ['wb:1'], cur: 'wb:1', objs: {}});
ok(same(await again.get('board:' + A), boardA), 'Ana cannot overwrite A\'s board');
anaNotes.students.push({id: A, name: 'hack', level: 'A1', goal: '', about: '', lessonLanguage: 'nl'});
anaNotes.lessons[A] = [{date: today, notes: 'HACK', words: [], hw: ''}];
await anaBr.put('notes', anaNotes);
const chk = await as(pg, T, () => pg.query(`select notes from public.lesson_entries where student_id=$1`, [A]));
ok(chk.rows.length === 1 && chk.rows[0].notes === 'Perfectum geoefend', 'Ana cannot inject lessons for A');

console.log('\n=== Students view their own portal ===');
const s1 = await loadStudentBundle(fakeSupabase(pg, S1), A);
ok(!s1.error && s1.lessons.length === 1 && s1.lessons[0].notes === 'Perfectum geoefend', 'student A sees own lesson history');
ok(s1.state && s1.state.board.list.length === 2, 'student A can view own stored whiteboard');
ok(s1.progress.lessons === 1 && s1.progress.words === 1, 'progress for A: 1 lesson, 1 word');
const s2onA = await loadStudentBundle(fakeSupabase(pg, S2), A);
ok(s2onA.lessons.length === 0 && s2onA.state === null && s2onA.recordings.length === 0, 'student B sees NOTHING of student A');
const sBr = createStudentBridge(fakeSupabase(pg, S1), {studentId: A, studentName: 'Student A'});
let refused = false; try { await sBr.put('board:' + A, {}); } catch { refused = true; }
ok(refused && (await sBr.get('board:' + A)) === null, 'student-side classroom never writes storage');

console.log('\n=== Recording upload ===');
const meta = {durationSeconds: 61.4, teacherConsentAt: new Date().toISOString(), studentConsentAt: new Date().toISOString()};
const up = await again.uploadRecording(new Blob(['fake-opus-audio'], {type: 'audio/webm;codecs=opus'}), meta);
ok(up.ok, 'teacher uploads recording for A' + (up.error ? ' (' + up.error + ')' : ''));
const recA = await loadStudentBundle(fakeSupabase(pg, S1), A);
ok(recA.recordings.length === 1 && recA.recordings[0].duration_seconds === 61 && recA.recordings[0].mime_type === 'audio/webm', 'student A sees the recording with metadata');
ok(recA.recordings[0].storage_path.startsWith(A + '/'), 'recording stored in A\'s private folder');
const recByAna = await anaBr.uploadRecording(new Blob(['x']), meta);
ok(!recByAna.ok, 'other teacher cannot upload a recording for A');
const objs = await pg.query(`select count(*)::int n from storage.objects`);
ok(objs.rows[0].n === 1, 'failed upload leaves no orphaned file');

console.log('\n=== Import of an old v15/v16 backup ===');
const backup = {notes: {students: [{id: 'old1', name: 'student a'}, {id: 'old2', name: 'Student B'}, {id: 'old3', name: 'Onbekend'}],
  lessons: {old1: [{date: '2026-01-10', notes: 'Oude les A', words: [{nl: 'huis', uit: 'house'}], hw: ''}, {date: today, notes: 'MAG NIET OVERSCHRIJVEN', words: [], hw: ''}], old2: [{date: '2026-02-01', notes: 'Oude les B', words: [], hw: ''}]}},
  boards: {old1: {list: ['wb:1'], cur: 'wb:1', objs: {}}}, canvas: {old2: {pages: [{id: 'o', title: 'Oud', html: 'oud'}], cur: 0}}};
const preview = await again.previewImport(backup);
ok(preview[0].newName === 'Student A' && preview[1].newName === 'Student B' && preview[2].newName === null, 'backup students matched by name, unknown one skipped');
const msg = await again.importBackup(backup);
console.log('    → ' + msg);
const after = await again.get('notes');
ok(after.lessons[A].length === 2 && after.lessons[A].find(l => l.date === today).notes === 'Perfectum geoefend', 'old lessons added, existing day NOT overwritten');
ok(after.lessons[B].some(l => l.notes === 'Oude les B'), 'old lessons of B imported into B');
ok(same(await again.get('board:' + A), boardA), 'existing board of A not overwritten by backup');
ok((await brB.get('canvas:' + B)).pages[0].title === 'Oud', 'canvas from backup imported for B (had none)');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
