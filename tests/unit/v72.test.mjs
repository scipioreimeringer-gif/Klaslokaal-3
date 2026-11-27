// v72: flexible classroom panels, one "Scherm delen" button, and a more complete, more careful AI lesson analysis
// (verbatim transcription, unknown speakers, long lessons in parts, style vs. error, re-analysis, imports).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseImported, importedLabels, toTranscript, unknownLines, unclearMark, formatDialogue} from '../../lib/transcript.ts';
import {parseUtterances, mergeChunks, carryDecisions, chunkUtterances, wordCount} from '../../lib/analysis/core.ts';
import {runPipeline} from '../../lib/analysis/pipeline.ts';
import {wavBytes, directMime} from '../../lib/audioImport.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');

test('imported transcripts: SRT, VTT (with <v>) and TXT keep speakers and times; unknown labels stay unknown', () => {
  const srt = '1\n00:00:01,000 --> 00:00:03,000\nDocent: Hoe gaat het?\n\n2\n00:01:05,500 --> 00:01:08,000\nAna: Ik ben goed gegaan.\n';
  const a = parseImported(srt);
  assert.deepEqual(a.map(l => [l.start, l.label, l.text]), [[1, 'Docent', 'Hoe gaat het?'], [65.5, 'Ana', 'Ik ben goed gegaan.']]);
  const vtt = 'WEBVTT\n\n00:00:02.000 --> 00:00:04.000\n<v Professor>Tudo bem?</v>\n\n01:02:03.000 --> 01:02:05.000\n<v Aluno>Eu vai bem.\n';
  const b = parseImported(vtt);
  assert.deepEqual(importedLabels(b), ['Professor', 'Aluno']);
  assert.equal(b[1].start, 3723);
  const txt = parseImported('[00:10] Teacher: Say it again\n[00:12] Bob: I goed home\nand then slept');
  assert.equal(txt[1].text, 'I goed home and then slept');
  const out = toTranscript(b, {Professor: 'DOCENT'});
  assert.match(out, /^\[00:02\] DOCENT: Tudo bem\?\n\[1:02:03\] ONBEKEND: Eu vai bem\.$/, 'unmapped label → ONBEKEND; hours kept');
  const u = parseUtterances(out);
  assert.deepEqual(u.map(x => [x.speaker, x.start]), [['teacher', 2], ['unknown', 3723]]);
});

test('mixed recording → timestamped unknown-speaker lines (not one block); long blocks split; unclear segments marked', () => {
  const lines = unknownLines([{start: 0, end: 2, text: ' Olá '}, {start: 3, end: 5, text: '...'}, {start: 6, end: 9, text: 'Eu fui ontem'}], 600);
  assert.equal(formatDialogue(lines), '[10:00] ONBEKEND: Olá\n[10:06] ONBEKEND: Eu fui ontem');
  const block = Array.from({length: 120}, (_, i) => `Zin nummer ${i} is hier.`).join(' ');
  const u = parseUtterances(block);
  assert.ok(u.length >= 2 && u.every(x => wordCount(x.text) <= 220), 'a 600-word block is split into bounded utterances');
  assert.ok(chunkUtterances(u, 900, 4).length >= 1);
  assert.equal(unclearMark('ik heb', -1.4, 0.1), '[onduidelijk] ik heb');
  assert.equal(unclearMark('ik heb', -0.3, 0.1), 'ik heb');
  assert.equal(unclearMark('ik heb'), 'ik heb');
  const ai = read('lib/server/ai.ts');
  assert.match(ai, /OPENAI_TRANSCRIBE_MODEL \|\| 'whisper-1'/, 'transcription model unchanged');
  assert.match(ai, /form\.append\('prompt'/, 'verbatim style prompt');
  assert.match(read('lib/transcript.ts'), /including grammar mistakes[^']*Do not correct or improve the learner/);
});

test('merge: style remarks are never errors, suspected transcription errors are dropped, unclear lines uncertain', () => {
  const utts = parseUtterances('DOCENT: Wat deed je gisteren?\nLEERLING: Gisteren ik ben naar huis gegaan.\nLEERLING: [onduidelijk] Ik heb gelopen naar school.\nLEERLING: Ik vind het heel leuk om te doen.');
  const r = mergeChunks([{errors: [
    {utterance_id: 'u2', original: 'Gisteren ik ben', corrected: 'Gisteren ben ik', category: 'Inversie', topic_id: null, kind: 'error', certainty: 'certain'},
    {utterance_id: 'u3', original: 'Ik heb gelopen', corrected: 'Ik ben gelopen', category: 'Hulpwerkwoord', topic_id: null, kind: 'error', certainty: 'certain'},
    {utterance_id: 'u4', original: 'heel leuk om te doen', corrected: 'erg leuk', category: 'Stijl', topic_id: null, kind: 'style', certainty: 'certain', why: 'natuurlijker'},
    {utterance_id: 'u4', original: 'leuk', corrected: 'luik', category: 'Woordkeuze', topic_id: null, kind: 'transcript', certainty: 'uncertain'},
    {utterance_id: 'u1', original: 'Wat deed je', corrected: 'x', category: 'Inversie', topic_id: null, kind: 'error', certainty: 'certain'},
  ], covered: [], positives: [], new_words: []}], utts, {topics: [], studentLevel: 'A2', todayTopicIds: [], history: []});
  assert.equal(r.errors.length, 2, 'teacher line and style/transcript items are not errors');
  assert.equal(r.errors.find(e => e.utterance_id === 'u3').certainty, 'uncertain', 'unclear line → uncertain');
  assert.equal(r.style.length, 1); assert.equal(r.style[0].better, 'erg leuk');
  assert.equal(r.transcriptDoubts, 1);
});

test('re-analysis keeps the teacher decisions (rejected stays rejected, edits stay)', () => {
  const base = {utterance_id: 'u2', why: '', type: 'word_order', category: 'Inversie', category_key: 'inversion', topic_id: null, start: 3, certainty: 'certain', kind: 'error', repeats: 1, later: false, word: null, word_en: null};
  const old = [{...base, id: 'a', original: 'gisteren ik ben', corrected: 'gisteren ben ik', status: 'rejected'},
    {...base, id: 'b', utterance_id: 'u5', original: 'ik heb gelopen', corrected: 'ik ben gelopen (zelf aangepast)', status: 'approved', edited: true, category_key: 'auxiliary'}];
  const fresh = [{...base, id: 'n1', original: 'Gisteren ik ben', corrected: 'Gisteren ben ik', status: 'pending'},
    {...base, id: 'n2', utterance_id: 'u5', original: 'ik heb gelopen', corrected: 'ik ben gelopen', status: 'pending', category_key: 'auxiliary'},
    {...base, id: 'n3', utterance_id: 'u9', original: 'de huis', corrected: 'het huis', status: 'pending', category_key: 'articles'}];
  const r = carryDecisions(fresh, old);
  assert.equal(r[0].status, 'rejected'); assert.equal(r[1].corrected, 'ik ben gelopen (zelf aangepast)'); assert.equal(r[1].status, 'approved'); assert.equal(r[2].status, 'pending');
});

test('a part whose AI answer is too long is analysed again in two halves (no lost part, no "afgebroken" failure)', async () => {
  const lines = []; for (let i = 0; i < 40; i++) lines.push(i % 2 ? `LEERLING: Gisteren ik ben naar huis ${i} gegaan.` : `DOCENT: Vertel eens ${i}.`);
  const utterances = parseUtterances(lines.join('\n'));
  let calls = 0, sizes = [];
  const ask = async (step, schema, system, user) => {
    if (step === 'chunk') {
      calls++; const ids = [...user.matchAll(/^(u\d+) (?:DOCENT|LEERLING|ONBEKEND):/gm)].map(m => m[1]);
      sizes.push(ids.length);
      if (calls === 1) throw new Error('AI-antwoord was te lang en is afgebroken');
      assert.match(system, /ON PURPOSE/); assert.match(system, /"style"/);
      return {errors: ids.filter(id => +id.slice(1) % 2 === 0).map(id => ({utterance_id: id, original: 'Gisteren ik ben', corrected: 'Gisteren ben ik', category: 'Inversie', topic: null, kind: 'error', certainty: 'certain', type: 'word_order', why: 'V2', word: '', word_en: ''})), covered: [], positives: [], new_words: []};
    }
    if (step === 'synthesis') return {report: {summary: 's', covered: [], went_well: [], focus: [], next_lesson: ''}, explanations: [], suggestions: [], later_note: '', source_quality: 'good', quality_note: ''};
    return {title: 'h', items: []};
  };
  const s = {parts: new Map(), draft: null};
  const store = {async parts() { return [...s.parts.values()]; }, async savePart(index, status, result) { s.parts.set(index, {index, status, result, attempts: 1}); }, async stage() {},
    async saveDraft(d) { s.draft = structuredClone(d); }, async loadDraft() { return s.draft; }, async saveHomework() { return null; }, async finish(d) { s.done = d; }, async fail(st, m) { s.failed = m; }};
  const res = await runPipeline({utterances, lessonDate: '2026-11-25', targetLang: 'nl', targetName: 'Dutch', uiName: 'Dutch', level: 'A2', notes: '', board: '', lessonGoals: [], topics: [], history: [], isTest: true, guide: ''}, ask, store);
  assert.equal(res.state, 'done', s.failed);
  assert.equal(calls, 3, 'one too-long answer → two half calls');
  assert.equal(sizes[1] + sizes[2] - 4 <= sizes[0], true);
  assert.equal(res.doc.errors.length >= 1, true); assert.equal(res.doc.method, 'v72');
});

test('re-analysis and imports: old report kept until success, explicit per lesson, no history auto-run', () => {
  const st = read('lib/server/analysisStart.ts');
  assert.match(st, /export async function rerunAnalysis/);
  assert.match(st, /lesson_analysis_parts'\)\.delete\(\)\.eq\('analysis_id', id\)/);
  assert.match(st, /p\.startsWith\(a\.student_id \+ '\/import-'\)/, 'imported audio only from the private folder of this student');
  const run = read('lib/server/analysisRunner.ts');
  assert.match(run, /\.\.\.\(rerun \? \{\} : \{status: 'processing'\}\)/, 'a re-analysis never hides the published report');
  assert.match(run, /het bestaande verslag is behouden/);
  assert.match(run, /previous: rerun \? errorsOf\(a\.final \|\| a\.draft\)/);
  assert.match(read('app/api/ai/analyze/route.ts'), /body\.rerunId/);
  const ui = read('components/Reanalyse.tsx');
  for (const s of ['AI-analyse opnieuw uitvoeren', 'Opnieuw transcriberen', 'Audio of transcript importeren', '.mp3,.m4a,.wav,.txt,.srt,.vtt']) assert.ok(ui.includes(s), s);
  const sql = read('supabase/v72.sql');
  assert.ok(!/\b(drop|delete|truncate)\b/i.test(sql.replace(/--.*$/gm, '')), 'additive only');
  assert.match(sql, /audio\/wav/);
});

test('audio import helpers: WAV header, direct upload types', () => {
  const b = wavBytes(new Float32Array([0, 1, -1]), 16000);
  assert.equal(b.length, 44 + 6); assert.equal(String.fromCharCode(...b.slice(0, 4)), 'RIFF'); assert.equal(new DataView(b.buffer).getUint32(24, true), 16000);
  assert.equal(directMime('les.mp3', ''), 'audio/mpeg'); assert.equal(directMime('les.m4a', 'audio/x-m4a'), 'audio/mp4'); assert.equal(directMime('les.wav', 'audio/wav'), null);
});

test('classroom: one "Scherm delen" button, flexible local panels, nothing about layout is sent', () => {
  const h = read('public/legacy/index.html');
  const i = h.indexOf('v72: FLEXIBLE PANELS'); assert.ok(i > 0);
  const blk = h.slice(i, h.indexOf('v74: COMPACT CAMERA', i)); // only the v72 block itself
  assert.match(blk, /querySelector\('\.dock \[data-open="scr"\]'\); if\(slBtn\) slBtn\.hidden = true;/, 'Slides button removed from the bottom bar');
  assert.match(h, /<span class="lbl">Scherm delen<\/span>/); assert.match(h, /on \? "Stop delen" : "Scherm delen";/);
  assert.match(blk, /Presentatie \(slides\) openen/, 'slides stay reachable outside the bar');
  assert.ok(!/send\(/.test(blk), 'panel positions and sizes are never synchronised');
  assert.ok(!/appendChild\(EL\[|insertBefore\(EL\[/.test(blk), 'panels are never moved in the DOM (no re-initialisation)');
  assert.match(blk, /"klas-lay72-" \+ \(isT \? "t" : "s"\)/);
  for (const s of ['Indeling herstellen', 'v72zone', 'v72maxbtn', 'MINW = 300', 'reconcile(v)', 'auto(v)']) assert.ok(blk.includes(s), s);
  assert.match(read('app/klaslokaal/live/page.tsx'), /\[data-mount\]\{overflow-x:hidden;min-width:0\}/);
});
