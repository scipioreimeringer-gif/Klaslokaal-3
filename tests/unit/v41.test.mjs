// v41: games always have words (random bank words by default), no AI for normal rounds, video back to full when
// the last work panel closes, and a tidy phone-off leave button.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {BANKS, BANK_CATS, CAT_LABEL, bankPool, termKey} from '../../lib/wordbank/index.ts';
import {loadBank} from '../../lib/wordbank/index.ts';
await loadBank('nl'); // v42: banks are loaded per language

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const games = read('components/Games.tsx'), route = read('app/api/games/round/route.ts'), html = read('public/legacy/index.html');

test('cause of "0 woorden": the default source was the personal list — now random bank words by default', () => {
  assert.match(games, /const src:Source=source\|\|\(bankOk\?'bank':'list'\);/);
  assert.ok(!/const src:Source=kind==='flash'/.test(games), 'Flashcards are no longer forced to the personal list');
  assert.match(games, /\{value:'bank' as Source,label:tt\('Willekeurig'\)/);
  assert.match(games, /\{value:'list' as Source,label:tt\('Mijn woordenlijst'\)/);
  assert.match(games, /\{value:'lesson' as Source,label:tt\('Woorden uit de les'\)/);
  assert.match(games, /src==='lesson'\?\{mode:'last_lesson'\}/);
});
test('one word bank (extended, not duplicated): animals, nature and feelings at A1–B2, every item with 3 forbidden words', () => {
  for (const c of ['animals', 'nature', 'feelings']) {
    assert.ok(BANK_CATS.includes(c), c);
    assert.ok(bankPool('nl', {level: 'mix', cat: c}).length >= 20, c);
    for (const l of ['A1', 'A2', 'B1', 'B2']) assert.ok(bankPool('nl', {level: l, cat: c}).length >= 4, c + ' ' + l);
  }
  assert.deepEqual([CAT_LABEL.animals, CAT_LABEL.nature, CAT_LABEL.feelings], ['Dieren', 'Natuur', 'Gevoelens']);
  assert.ok(BANKS.nl.length >= 580, String(BANKS.nl.length));
  assert.equal(bankPool('nl', {level: 'mix', cat: 'all', minTaboo: 3}).length, BANKS.nl.length);
  assert.equal((read('lib/wordbank/index.ts').match(/export const BANKS/g) || []).length, 1, 'still one bank');
});
test('too few personal words: offered and done by topping up with bank words (never silently, no AI)', () => {
  assert.match(games, /\{tt\('Aanvullen met ingebouwde woorden'\)\}/);
  assert.match(games, /fillBank:canFill/);
  assert.match(route, /const lang = subjectCode\(student\), canFill = b\.fillBank === true && hasBank\(lang\);/);
  assert.match(route, /if \(pool\.length < count && !canFill\) return Response\.json\(\{tooFew: true/);
  assert.match(route, /notice = 'Aangevuld met woorden uit de ingebouwde woordenbank\.'/);
  assert.match(route, /bankIds = extra\.map\(w => w\.id\)/, 'bank words are remembered against repeats');
});
test('Taboo: no AI per round by default; personal words that are in the bank get the checked forbidden words', () => {
  assert.match(route, /const ai = b\.aiTaboo === true;/);
  assert.match(games, /const \[aiTaboo,setAiTaboo\]=useState\(false\)/);
  assert.match(route, /const byTerm = new Map\(\(BANKS\[lang\] \|\| \[\]\)\.map\(x => \[termKey\(x\.term\), x\.taboo\]\)\);/);
  assert.equal(termKey('De Fiets'), 'fiets'); assert.equal(termKey('fiets'), 'fiets'); assert.equal(termKey('het  brood'), 'brood');
});
test('Flashcards: personal cards, or the bank (topped up when needed); bank cards are not recorded as personal practice', () => {
  assert.match(games, /const fromBank=\(src==='bank'\|\|canFill\)&&bank\?bank\.pickBank\(bankPool\.filter\(w=>w\.en\)/);
  assert.match(games, /\{id:w\.id,term:w\.term,back:w\.en,example:bank\.bankGrammar\(w\)\}/, 'v42: back = English + grammar');
  assert.match(games, /if\(c&&UUID\.test\(c\.id\)\)void supabase\(\)!\.rpc\('record_vocab_practice'/);
});
test('30 Seconds: 5 words, 30/60/90 s, teacher or student explains, cards only for the explainer (unchanged RLS path)', () => {
  assert.match(games, /useState\(5\)/); assert.match(games, /\(\[30,60,90\] as const\)/);
  assert.match(games, /\{value:'teacher',label:tt\('Docent'\)\},\{value:'student',label:tt\('Leerling'\)\}/);
  assert.match(games, /from\('game_rounds'\)\.select\('cards'\)\.eq\('id',rid\)/);
  assert.match(route, /\.\.\.\(explainer === 'teacher' \? \{cards\} : \{\}\)/);
});
test('look: three game cards with own accent, compact dropdowns, timer ring, big words, no native selects', () => {
  assert.match(games, /className=\{'gx-kind gx-k-'\+k\}/);
  assert.match(games, /function Ring\(/);
  assert.ok(!/<select /.test(games));
  const css = read('app/style.css');
  assert.match(css, /\.gx\.gx-flash\{--gx-acc:#4a7fd4/); assert.match(css, /\.gx\.gx-taboo\{--gx-acc:#d9603f/);
  assert.match(css, /\.gx-word\{font-size:clamp\(20px,3vw,26px\)/);
  assert.match(read('app/klaslokaal/live/page.tsx'), /fs\.setAttribute\('data-app-fonts',''\)/, 'Plus Jakarta Sans also inside the classroom frame');
});
test('video: back to full only when the LAST work panel closes; lock respected; the call is never touched', () => {
  assert.match(html, /if\(vis\.length === 0 && lastVis > 0 && window\.__camAutoFull\) window\.__camAutoFull\(\);/);
  assert.match(html, /window\.__camAutoFull = function\(\)\{ if\(mode !== "full" && mode !== "hidden"\) setMode\("full", "auto"\); \};/);
  assert.match(html, /if\(MODES\.indexOf\(m\) < 0 \|\| \(why === "auto" && P\.lock\)\) return;/, 'a locked layout stays as it is');
  assert.match(html, /if\(on && document\.body\.classList\.contains\("cam-full"\)\) ORDER\.forEach\(function\(x\)\{ if\(x !== k\) OPEN\[x\] = false; \}\);/, 'v42: from full video only the clicked panel opens');
  const mod = html.slice(html.indexOf('v40: FOUR TOGGLES'), html.indexOf('v40: NEW CANVAS TOOLBAR'));
  assert.ok(!/new Peer\(|getUserMedia|iceServers|leave\(\)/.test(mod), 'closing panels never touches the call');
});
test('leave button: compact red, white Lucide phone-off icon, tooltip, confirmation, spaced from the dot and ⋯', () => {
  assert.match(html, /id="leaveBtn" type="button" title="Les verlaten" aria-label="Les verlaten"/);
  assert.match(html, /<path d="m2 2 20 20"\/><\/svg><\/button>/, 'phone-off (crossed out)');
  assert.match(html, /#leaveBtn\.leave40\{display:inline-flex[^}]*background:#d64534;color:#fff/);
  assert.match(html, /\$\("leaveBtn"\)\.addEventListener\("click", function\(\)\{ if\(peer && confirm\("Les verlaten\?"\)\) leave\(\); \}\);/);
  assert.match(html, /body \.top \.conn\.conn-dot,body\.v28 \.top \.conn\.conn-dot\{[^}]*font-size:0!important/, 'status text never overlaps');
});
