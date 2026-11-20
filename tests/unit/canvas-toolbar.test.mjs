// v40 phase 9: new canvas toolbar — formatting survives sync/saving, selection kept, AI teacher-only, safe menus.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const html = read('public/legacy/index.html');
const tb = html.slice(html.indexOf('v40: NEW CANVAS TOOLBAR'));

test('all functions on one compact toolbar: style, size, B/I/U/S, colours, AI, translate, page, new page, undo/redo, ⋯', () => {
  for (const s of ['"Tekststijl"', '"Lettergrootte"', '"Vet (Ctrl+B)"', '"Cursief (Ctrl+I)"', '"Onderstrepen (Ctrl+U)"', '"Doorhalen"', '"Tekstkleur"', '"Markeerkleur"', '"Vertalen"', '"Nieuwe pagina"', '"Ongedaan maken (Ctrl+Z)"', '"Opnieuw uitvoeren (Ctrl+Y)"', '"Meer opties"'])
    assert.ok(tb.includes(s), s);
  assert.match(tb, /var STYLES = \[\["p", "Normale tekst"\], \["h", "Kop 1"\], \["h2", "Kop 2"\], \["h3", "Kop 3"\], \["li", "Opsomming"\]\]/);
  assert.match(tb, /var SIZES = \[12, 14, 16, 18, 20, 24, 28, 32, 40\]/);
  assert.match(tb, /inp\.type = "number"; inp\.min = "10"; inp\.max = "64"/, 'manual size input');
});
test('font size: on a selection, or for the next typed text when nothing is selected', () => {
  assert.match(tb, /if\(s\.getRangeAt\(0\)\.collapsed\)\{ pendingSize = px;/);
  assert.match(tb, /CV\.addEventListener\("beforeinput", function\(e\)\{\s*if\(!pendingSize \|\| e\.inputType !== "insertText"/);
  assert.match(tb, /querySelectorAll\('font\[size="7"\]'\)/, 'size applied as px on the selection');
});
test('selection is never lost by menus: remembered on selectionchange and restored; buttons do not take focus', () => {
  assert.match(tb, /document\.addEventListener\("selectionchange"/);
  assert.match(tb, /function restore\(\)\{/);
  assert.match(tb, /b\.addEventListener\("mousedown", function\(e\)\{ e\.preventDefault\(\); \}\)/);
});
test('formatting survives sync and saving: safe filter keeps underline, strikethrough, size, bold, italic — nothing else', () => {
  assert.match(html, /var OK_TAGS = \{B:1, STRONG:1, I:1, EM:1, U:1, S:1, STRIKE:1, SPAN:1, BR:1, MARK:1, FONT:1\};/);
  assert.match(html, /"text-decoration-line": \/\^\(underline\|line-through\|underline line-through\|line-through underline\|none\)\$\//);
  assert.match(html, /"font-size": \/\^\(1\[0-9\]\|\[2-5\]\[0-9\]\|6\[0-4\]\)px\$\//);
  assert.ok(!/OK_STYLE = \{[^}]*(position|url|expression|behavior)/.test(html), 'no dangerous styles allowed');
  assert.match(html, /b\.setAttribute\("data-t", \/\^\(h\|h2\|h3\|li\|img\)\$\/\.test\(m\.bt\) \? m\.bt : "p"\)/, 'receiver accepts the heading levels (+ v46 image blocks) only');
  const sd = read('components/StudentData.tsx');
  assert.match(sd, /const el=c as HTMLElement;const fs=el\.style\?\.fontSize[\s\S]{0,120}for\(const a of Array\.from\(c\.attributes\)\)c\.removeAttribute/, 'dashboard preview reads styles before stripping attributes');
});
test('word recognition treats Kop 2 / Kop 3 as headings (never vocabulary)', () => {
  assert.match(read('lib/vocab/core.ts'), /data-t="\(h\[23\]\?\|li\|p\)"/);
});
test('AI only for teachers (also checked on the server); translate never replaces the original and reuses results', () => {
  assert.match(tb, /if\(isT\)\{\s*var ai = btn\(/);
  assert.match(tb, /"Onder de tekst zetten"/);
  assert.match(tb, /de oorspronkelijke tekst blijft staan/);
  assert.ok(!/selText[^;]*replace|deleteContents\(\);[^}]*translate/.test(tb), 'translation never overwrites the selection');
  assert.match(read('lib/classroomBridge.ts'), /const k = term\.toLowerCase\(\) \+ '\\u0000' \+ context\.toLowerCase\(\) \+ '\\u0000' \+ tg;/, 'cached per text + language');
  assert.match(read('app/api/ai/translate/route.ts'), /translation_cache/, 'server cache as well');
});
test('⋯ menu: grouped (Tekst, Pagina, Herstellen), fixed position inside the window, closes on Escape/outside, keyboard arrows', () => {
  for (const g of ['"Tekst"', '"Pagina"', '"Herstellen"']) assert.ok(tb.includes('group(pop, ' + g + ')'), g);
  assert.match(tb, /Math\.max\(8, Math\.min\(window\.innerWidth - w - 8, r\.left\)\)/);
  assert.match(tb, /if\(e\.key === "Escape"\)/); assert.match(tb, /e\.key === "ArrowDown" \|\| e\.key === "ArrowUp"/);
  assert.match(html, /\.cvpop\{position:fixed;z-index:9999/);
  assert.match(tb, /\$\("cvPageDel"\)\.click\(\)/, 'existing delete handler (with its confirm) is reused');
});
test('narrow panels: less-used buttons move into ⋯ instead of being cut off', () => {
  assert.match(tb, /function fit\(\)\{ tb\.classList\.remove\("narrow"\); if\(tb\.scrollWidth > tb\.clientWidth \+ 1\) tb\.classList\.add\("narrow"\); \}/);
  assert.match(html, /\.cvtb\.narrow \.ovf\{display:none\}/);
});
test('new toolbar labels are translated in the classroom (other interface languages)', () => {
  const i18n = read('public/legacy/i18n.js');
  for (const k of ['Tekststijl', 'Lettergrootte', 'Onderstrepen (Ctrl+U)', 'Doorhalen', 'Selectie vertalen', 'Canvas leegmaken', 'Scherm delen stoppen', 'Je leerling heeft de les verlaten. Jij blijft in de les.'])
    assert.ok(i18n.includes(JSON.stringify(k) + ':'), k);
});
