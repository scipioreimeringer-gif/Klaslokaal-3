// v71: the student's own learning line (same data), "Graag behandelen", "Oefenen" per topic, teacher keeps control.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');

test('Mijn leerlijn in Voortgang uses the same LearningPath (no copy); statuses read-only for the student', () => {
  const sd = read('components/StudentData.tsx');
  assert.match(sd, /tab==='voortgang'&&viewer==='student'&&<section className="card"><h3><Target size=\{17\}\/> \{t\("Mijn leerlijn"\)\}<\/h3><LearningPath student=\{ws\} viewer="student"\/>/);
  const lp = read('components/LearningPath.tsx');
  assert.match(lp, /\{teacher\?<select className=\{'cell gsel gs-'\+status\}/, 'only the teacher gets a status control');
  assert.ok(!/teacher&&p\?\.note/.test(lp) === false && !/\n\s*\{p\?\.note&&/.test(lp), 'private progress notes only for the teacher');
  assert.match(lp, /open=\{stage\.endsWith\(level\)\|\|stage\.startsWith\(level\)\}/, 'current level open, others collapsed');
});

test('requests: ask / withdraw, teacher accepts to the next lesson or declines; also in the lesson-topic picker', () => {
  const lp = read('components/LearningPath.tsx');
  assert.match(lp, /from\('topic_requests'\)\.insert\(\{student_id:student\.id,goal_id:goalId\}\)/);
  assert.match(lp, /if\(cur\)\{if\(cur\.status!=='open'\)return;const r=await db\.from\('topic_requests'\)\.delete\(\)/);
  assert.match(lp, /const id=await toNextLesson\(rq\.goal_id,titleOf\(rq\.goal_id\)\);if\(!id\)return;await db\.from\('topic_requests'\)\.update\(\{status:'accepted',lesson_goal_id:id/);
  const lt = read('components/LessonTopics.tsx');
  assert.match(lt, /from\('topic_requests'\)\.select\('id,goal_id'\)\.eq\('student_id',studentId\)\.eq\('status','open'\)/);
  assert.match(lt, /if\(rq\)await supabase\(\)!\.from\('topic_requests'\)\.update\(\{status:'accepted'/);
  assert.ok(!/topic_requests[^\n]*outcome:'covered'/.test(lt + lp), 'a request is never marked as covered');
  const sql = read('supabase/v71.sql');
  assert.ok(!/\b(drop table|delete from|truncate|alter table public\.(students|student_goal_progress|curriculum_goals))\b/i.test(sql), 'additive only');
  assert.match(sql, /unique \(student_id, goal_id\)/);
});

test('practice per topic opens the existing self-practice generator with that focus (no new system, no AI to view)', () => {
  assert.match(read('components/LearningPath.tsx'), /href=\{`\/oefenen\?student=\$\{student\.id\}&onderwerp=\$\{encodeURIComponent\(title\)\}#zelf`\}/);
  assert.match(read('app/oefenen/page.tsx'), /<SelfPractice key=\{rel\.id\+'\|'\+\(onderwerp\|\|''\)\} studentId=\{rel\.id\} level=\{level\} topic=\{onderwerp\|\|undefined\}\/>/);
  assert.ok(!/authedPost|askFast/.test(read('components/LearningPath.tsx')), 'viewing and requesting use no AI');
});
