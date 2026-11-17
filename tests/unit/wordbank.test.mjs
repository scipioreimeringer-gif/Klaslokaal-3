// v38 phase 3: built-in Dutch word bank for 30 Seconds / Taboo (no AI, no database content).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {BANKS, BANK_CATS, BANK_LEVELS, CAT_LABEL, bankPool, pickBank, widen, hasBank, bankLangFor, isCat, isLevel} from '../../lib/wordbank/index.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const nl = BANKS.nl;

test('at least 400 Dutch items, every id unique (one entry per word)', () => {
  assert.ok(nl.length >= 400, String(nl.length));
  assert.equal(new Set(nl.map(w => w.id)).size, nl.length);
  assert.equal(new Set(nl.map(w => w.term.toLowerCase())).size, nl.length);
});
test('the thematic categories of the assignment, each with words', () => {
  assert.deepEqual(['all', ...BANK_CATS].map(c => CAT_LABEL[c]), ['Alles', 'Dagelijks leven', 'Eten en drinken', 'Werk en studie', 'Reizen', "Sport en hobby's", 'Familie en relaties', 'Werkwoorden', 'Bijvoeglijke naamwoorden', 'Abstracte begrippen', 'Uitdrukkingen', 'Gezegdes', 'Spreekwoorden']);
  for (const c of BANK_CATS) assert.ok(bankPool('nl', {level: 'mix', cat: c}).length >= 15, c);
});
test('every level A1–B2 has enough words for many rounds; Gemengd = all', () => {
  for (const l of BANK_LEVELS) assert.ok(bankPool('nl', {level: l, cat: 'all'}).length >= 60, l);
  assert.equal(bankPool('nl', {level: 'mix', cat: 'all'}).length, nl.length);
});
test('Taboo without AI: every item has 3 usable forbidden words, never (part of) the word itself', () => {
  for (const w of nl) {
    assert.equal(w.taboo.length, 3, w.term);
    const t = w.term.toLowerCase().replace(/^(de|het|een) /, '');
    for (const f of w.taboo) assert.ok(!t.includes(f.toLowerCase()) && !f.toLowerCase().includes(t), `${w.term}: ${f}`);
  }
  assert.equal(bankPool('nl', {level: 'mix', cat: 'all', minTaboo: 3}).length, nl.length);
});
test('sayings and proverbs carry a short meaning (shown to the explainer)', () => {
  for (const w of nl.filter(x => x.cat === 'saying' || x.cat === 'proverb')) assert.ok(w.meaning.length > 5, w.term);
});
test('a round: different words, unused ones first, no repeats until the pool runs out', () => {
  const pool = bankPool('nl', {level: 'A1', cat: 'food'});
  const used = new Set();
  for (let r = 0; r < Math.floor(pool.length / 5); r++) {
    const round = pickBank(pool, 5, used);
    assert.equal(new Set(round.map(w => w.id)).size, 5);
    for (const w of round) { assert.ok(!used.has(w.id), 'no repeat within the session'); used.add(w.id); }
  }
  assert.equal(pickBank(pool, 5, new Set(pool.map(w => w.id))).length, 5, 'all used → old words again, still a full round');
});
test('too few words → widen step by step (category, then level), never silently', () => {
  assert.deepEqual(widen({level: 'A1', cat: 'proverb'}), {level: 'A1', cat: 'all'});
  assert.deepEqual(widen({level: 'A1', cat: 'all'}), {level: 'mix', cat: 'all'});
  assert.equal(widen({level: 'mix', cat: 'all'}), null);
  assert.equal(bankPool('nl', {level: 'A1', cat: 'proverb'}).length, 0, 'A1 has no proverbs: the route answers tooFew + canWiden');
});
test('language of the student decides the bank; only Dutch has one for now', () => {
  assert.ok(hasBank('nl')); assert.ok(!hasBank('pt')); assert.ok(!hasBank(null));
  assert.equal(bankLangFor({curriculum_subject: 'pt'}), 'pt');
  assert.equal(bankLangFor({subject: 'Nederlands NT2'}), 'nl');
  assert.ok(isCat('travel') && isCat('all') && !isCat('sayings') && !isCat('x'));
  assert.ok(isLevel('B2') && isLevel('mix') && !isLevel('C1'));
});

test('round route: bank source validated, no AI for bank cards, AI optional for the word list', () => {
  const r = readFileSync(path.join(root, 'app/api/games/round/route.ts'), 'utf8');
  assert.match(r, /if \(b\.source === 'bank'\)/);
  assert.match(r, /level: isLevel\(b\.level\) \? b\.level : 'mix', cat: isCat\(b\.category\) \? b\.category : 'all'/, 'unknown values fall back safely');
  assert.match(r, /tooFew: true, available: pool\.length, canWiden: !!widen\(f\)/);
  const bankPart = r.slice(r.indexOf("if (b.source === 'bank')"), r.indexOf('} else {'));
  assert.ok(!/tabooFor|enforceLimit|askFast/.test(bankPart), 'bank rounds never call AI or count against the AI limit');
  assert.match(r, /const ai = b\.aiTaboo !== false;/);
  assert.match(r, /\.\.\.\(explainer === 'teacher' \? \{cards\} : \{\}\)/, 'cards never sent to a guessing teacher');
});
test('games panel: one dropdown style, bank only for 30 Seconds/Taboo, loaded on demand', () => {
  const g = readFileSync(path.join(root, 'components/Games.tsx'), 'utf8');
  assert.match(g, /function Pick</);
  assert.ok(!/<label className="row"><span className="label">/.test(g), 'no inline label+select variants left');
  assert.match(g, /const src:Source=kind==='flash'\|\|!bankOk\?'list':source;/);
  assert.match(g, /await import\('\.\.\/lib\/wordbank'\)/, 'word bank not in the initial bundle');
  assert.match(g, /if\(c\?\.vocab_id&&state\?\.roundId\)/, 'bank cards are not counted as personal word practice');
});
