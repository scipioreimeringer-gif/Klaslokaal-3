// v77: homework multiple choice (four separate fields, one correct, validated before publishing) and teacher reactions.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {itemIssues, setIssues, fourOptions} from '../../lib/homeworkCheck.ts';
import {PREF_KEYS} from '../../lib/classroomPrefs.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const mc = (options, answer, prompt = 'Os dois quartos têm ___ tamanho.') => ({type: 'multiple_choice', prompt, options, answer});

test('homework: multiple choice needs four separate, different options and exactly one correct answer (NL and PT)', () => {
  assert.deepEqual(itemIssues(mc(['a mesma', 'o mesmo', 'as mesmas', 'os mesmos'], 'o mesmo')), []);
  assert.deepEqual(itemIssues(mc(['de', 'het', 'een', 'die'], 'het', 'Ik zie ___ huis.')), []);
  assert.ok(itemIssues(mc(['a mesma', 'o mesmo', '', 'os mesmos'], 'o mesmo')).includes('Vul alle vier de antwoordmogelijkheden in.'));
  assert.ok(itemIssues(mc(['de', 'het', 'de', 'een'], 'het')).includes('De vier antwoordmogelijkheden moeten verschillend zijn.'));
  assert.ok(itemIssues(mc(['de', 'het', 'een', 'die'], '')).includes('Kies precies één juist antwoord.'));
  assert.ok(itemIssues(mc(['de', 'het', 'een', 'die'], 'dat')).includes('Kies precies één juist antwoord.'));
  assert.ok(itemIssues({type: 'fill_in', prompt: 'Ik ___ thuis.', answer: ''}).includes('Vul het juiste antwoord in.'));
  assert.deepEqual(itemIssues({type: 'write', prompt: 'Schrijf over je weekend.', answer: ''}), [], 'open tasks need no answer');
  assert.deepEqual(setIssues([mc(['de', 'het', 'een', 'die'], 'het'), {type: 'fill_in', prompt: '', answer: 'x'}]).map(x => x.index), [1]);
  assert.deepEqual(fourOptions(['de / het / een / die']), ['de', 'het', 'een', 'die'], 'an old one-field list is split once');
  assert.deepEqual(fourOptions(['de', 'het']), ['de', 'het', '', '']);
});

test('homework editors: four fields + radio, publish only after a valid, successful save, input kept on errors', () => {
  const ed = read('components/McEditor.tsx');
  assert.match(ed, /type="radio" name=\{'mc-'\+gid\}/); assert.match(ed, /answer:i===right\?v:answer/, 'the correct answer follows its option');
  const hw = read('app/huiswerk-client.tsx');
  assert.ok(!/Keuzes, gescheiden door/.test(hw), 'no more options in one text field');
  assert.match(hw, /if\(bad\.length\)\{onSaved\(/); assert.match(hw, /if\(dirty&&!\(await save\(\)\)\)return;onPublish\(\)/);
  assert.match(read('components/HomeworkDraft.tsx'), /<McEditor options=\{it\.options\}/);
  assert.match(read('lib/homework/templates.ts'), /if \(o\.length !== 4 \|\| o\.some\(x => !x\)\) return 'niet precies vier opties';/);
});

test('reactions: teacher only, tiny events over the existing channel, accepted only by the student, no sound, reduced motion', () => {
  const h = read('public/legacy/index.html'); const b = h.slice(h.indexOf('v77: TEACHER REACTIONS'));
  assert.match(h, /case "react": if\(!isT && window\.__reactRemote\) window\.__reactRemote\(m\); break;/);
  assert.match(b, /if\(!isT\) return;   \/\* students: no button, nothing to send \*\//);
  assert.match(b, /m = \{t:"react", e:e, txt:String\(txt \|\| ""\)\.slice\(0, 60\), a:p\.anim !== false, id:/);
  assert.match(b, /if\(now - lastSend < 700\) return;/, 'anti-spam'); assert.match(b, /if\(id && lastShown\[id\]\) return;/, 'no double animation');
  assert.match(b, /pointer-events:none/); assert.match(b, /prefers-reduced-motion:reduce/); assert.ok(!/new Audio|AudioContext|\.play\(/.test(b.slice(0, b.indexOf('</script>'))), 'no sound');
  for (const e of ['🎉', '🎆', '✅', '⚠️', '‼️', '✋', '👏', '💡', '🔄', '👍']) assert.ok(b.includes('"' + e + '"'), e);
  assert.match(b, /p\.fav\.slice\(0, 6\)/, 'max six favourites in the menu');
  assert.ok(PREF_KEYS.includes('klas-react-t'), 'favourites stored per teacher account');
});
