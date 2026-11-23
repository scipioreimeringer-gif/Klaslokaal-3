// v54: practice games per learning language and CEFR level; no empty questions; one persistent active language.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {conjugationSet, sentenceSet, correctionSet, wordDeck, quizOptions, idiomQuestions, progressOf, validItem, validCard, levelNum, asLvl, LVLS, DECK, MATCH, OPTIONS} from '../../lib/practice.ts';
import {grammarBank, describe} from '../../lib/grammar.ts';
import {loadBank} from '../../lib/wordbank/index.ts';
import {checkText} from '../../lib/answers.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const BAD = /\bundefined\b|\bnull\b|NaN|\[object/;
const banks = {pt: await loadBank('pt'), nl: await loadBank('nl')};
const own = [{id: 'w1', term: 'a praia', translation: 'het strand', example: 'Nós fomos à praia ontem.', level: 'A1'}, {id: 'w2', term: 'saudade', translation: 'gemis', example: '', level: 'B2'},
  {id: 'w3', term: 'o mercado', translation: 'de markt', example: 'Eu vou ao mercado hoje.', level: null}];

test('root cause fixed: conjugation questions are never " · " / " — " again', () => {
  const c = read('components/Learning.tsx');
  assert.ok(!/prompt:` · `|hint:` — `/.test(c), 'the broken template is gone');
  assert.match(c, /conjugate:conjugationSet\(lang,level,10,seed\)/);
});
test('every question of every game is complete — 2 languages × 5 levels × many seeds', () => {
  for (const lang of ['pt', 'nl']) for (const lv of LVLS) for (let seed = 1; seed < 40; seed += 7) {
    const sets = [conjugationSet(lang, lv, 10, seed), sentenceSet(own, lang, lv, 10, seed), correctionSet([], lang, lv, 8, seed)];
    for (const s of sets) for (const it of s) {
      assert.ok(validItem(it), `${lang} ${lv} ${it.key}`);
      assert.ok(!BAD.test(it.prompt + it.hint + it.answers.join()), `${lang} ${lv} ${it.key} has no undefined/null`);
    }
    assert.ok(sets[0].length >= 5, `${lang} ${lv}: enough conjugation questions (${sets[0].length})`);
    const w = wordDeck([], banks[lang], lv, DECK[lv], seed);
    assert.equal(w.cards.length, DECK[lv]); assert.ok(w.cards.every(validCard));
  }
});
test('conjugation: infinitive, tense and person always known; A1 = present tense only; B2 = subjunctive / pluperfect', () => {
  for (const lang of ['pt', 'nl']) {
    for (const it of conjugationSet(lang, 'A1', 10, 3)) { const [verb, tense, person] = it.hint.split(' · '); assert.ok(verb && tense && person, it.key); assert.match(tense, /presente|tegenwoordige tijd/); }
    for (const lv of LVLS) for (const it of conjugationSet(lang, lv, 10, 5)) assert.equal(it.hint.split(' · ').length, 3, it.key);
  }
  const ptB2 = conjugationSet('pt', 'B2', 10, 9).map(x => x.hint).join(' | '); assert.match(ptB2, /subjuntivo/);
  const nlB2 = conjugationSet('nl', 'B2', 10, 9).map(x => x.hint).join(' | '); assert.match(nlB2, /voltooid verleden tijd|voorwaardelijke wijs|passief/);
  const ptA2 = conjugationSet('pt', 'A2', 10, 9).map(x => x.hint).join(' | '); assert.match(ptA2, /pretérito perfeito|pretérito imperfeito/);
  // the examples from the request
  const fazer = grammarBank('pt').find(g => g.key === 'gr:pt:fi:fazer:pf:0');
  assert.equal(fazer.prompt, 'Ontem eu _____ o jantar.'); assert.deepEqual(fazer.answers, ['fiz']); assert.deepEqual(describe(fazer), {verb: 'fazer', tense: 'pretérito perfeito', person: 'eu'});
  assert.deepEqual(describe(grammarBank('nl').find(g => g.key === 'gr:nl:fi:gaan:imp:0')), {verb: 'gaan', tense: 'verleden tijd', person: 'ik'});
});
test('accents: a missing accent is "almost right", the right form with accent is correct', () => {
  assert.equal(checkText('fazíamos', ['fazíamos']), 'correct'); assert.equal(checkText('faziamos', ['fazíamos']), 'accent'); assert.equal(checkText('fazemos', ['fazíamos']), 'wrong');
});
test('the level really changes the content (not only the label)', () => {
  for (const lang of ['pt', 'nl']) {
    const a1 = new Set(conjugationSet(lang, 'A1', 10, 4).map(x => x.key)), b2 = new Set(conjugationSet(lang, 'B2', 10, 4).map(x => x.key));
    assert.ok([...b2].filter(k => a1.has(k)).length <= 1, lang + ': A1 and B2 differ');
    assert.ok(correctionSet([], lang, 'A1', 8, 1).length === 0 || correctionSet([], lang, 'A1', 8, 1).every(x => x.prompt.length < 60), 'A1 short');
    assert.ok(correctionSet([], lang, 'C1', 8, 1).some(x => /:ad:/.test(x.key)), lang + ' C1 subtle corrections');
    assert.ok(idiomQuestions(lang, 'C1', 1).length >= 5, lang + ' C1 idioms and register'); assert.equal(idiomQuestions(lang, 'A2', 1).length, 0);
  }
  assert.deepEqual([DECK.A1, DECK.C1, MATCH.A1, MATCH.C1, OPTIONS.A1, OPTIONS.C1], [8, 12, 4, 8, 3, 5]);
  // own words above the level are left out
  assert.ok(!wordDeck(own, banks.pt, 'A1', 8, 1).cards.some(c => c.term === 'saudade'));
  assert.ok(wordDeck(own, banks.pt, 'B2', 8, 1).cards.some(c => c.term === 'saudade'));
  const C1 = wordDeck([], banks.nl, 'C1', 12, 3).cards; assert.ok(C1.length === 12);
  // Portuguese is not a translation of Dutch: different exercises
  const ptK = grammarBank('pt').filter(g => g.level >= 4).map(g => g.prompt), nlK = grammarBank('nl').filter(g => g.level >= 4).map(g => g.prompt);
  assert.ok(ptK.length >= 15 && nlK.length >= 15 && !ptK.some(p => nlK.includes(p)));
});
test('own material first; bank material marked; variety between rounds', () => {
  const d = wordDeck(own, banks.pt, 'A2', 10, 5);
  assert.equal(d.cards[0].source === 'own' || d.cards[1].source === 'own', true); assert.ok(d.fromBank > 0 && d.cards.filter(c => c.source === 'bank').length === d.fromBank);
  assert.ok(sentenceSet(own, 'pt', 'A2', 10, 1).some(x => x.source === 'own' && x.prompt.includes('_____') && !/praia/.test(x.prompt)));
  const a = conjugationSet('nl', 'A2', 10, 11).map(x => x.key).join(), b = conjugationSet('nl', 'A2', 10, 12345).map(x => x.key).join(); assert.notEqual(a, b);
  const q = quizOptions(d.cards[0], [...d.cards, ...wordDeck([], banks.pt, 'A2', 20, 9).cards], 'B2', 3); assert.equal(q.length, 5); assert.ok(q.includes(d.cards[0].meaning));
});
test('progress per game and per language — Portuguese and Dutch never mixed', () => {
  const rows = [{kind: 'conjugate', score: 8, total: 10, created_at: '2026-11-20T10:00:00Z', details: {lang: 'pt', level: 'A2', wrong: ['fiz', 'fiz']}},
    {kind: 'conjugate', score: 2, total: 10, created_at: '2026-11-21T10:00:00Z', details: {lang: 'nl', level: 'C1', wrong: []}},
    {kind: 'quiz', score: 5, total: 10, created_at: '2026-11-19T10:00:00Z', details: {lang: 'pt'}}];
  const p = progressOf(rows, 'pt');
  assert.deepEqual([p.conjugate.sessions, p.conjugate.answered, p.conjugate.correct, p.conjugate.pct, p.quiz.pct], [1, 10, 8, 80, 50]);
  assert.equal(progressOf(rows, 'nl').conjugate.pct, 20);
  const c = read('components/Learning.tsx');
  assert.match(c, /details:\{\.\.\.details,lang:ctx\.lang,level:ctx\.level\}/, 'language and level stored with every result');
  assert.match(c, /p_kind:x\.itemKey\.startsWith\('err:'\)\?'error':'grammar'/, 'grammar answers use the existing spaced repetition');
  assert.equal(levelNum('C2'), 5); assert.equal(asLvl(null), 'A1');
});
test('one active learning language: sidebar, practice page and language page share it; stored with the account', () => {
  const p = read('components/LearnerPrefs.tsx');
  assert.match(p, /supabase\(\)\?\.auth\.updateUser\(\{data:\{active_language:next\.active,levels:next\.levels\}\}\)/, 'saved with the own account (survives logging in again, other devices)');
  assert.match(p, /const lsKey=\(uid:string\)=>'teachy-learner-'\+uid;/, 'per account on this device: never another student\'s choice');
  const side = read('components/Languages.tsx'); assert.match(side, /onClick=\{\(\)=>\{prefs\.setActive\(c\.code\);onNavigate\(\)\}\}/);
  assert.match(side, /const current=onLang\?\(taal\|\|cards\.find\(c=>c\.relations\.some\(r=>r\.id===sid\)\)\?\.code\|\|active\):active;/);
  const page = read('app/oefenen/page.tsx');
  assert.match(page, /const switchTo=\(c:string\)=>\{prefs\.setActive\(c\);/, 'top choice = the same active language');
  assert.match(page, /sessionStorage\.setItem\(tmpKey,p\)/, 'temporary level only on this page');
  assert.match(page, /asLvl\(prefs\.levels\[code\]\|\|card\?\.level\|\|full\?\.level\|\|'A1'\)/, 'own level per language');
  assert.match(read('app/account/page.tsx'), /function MyLevels\(\)/);
});
