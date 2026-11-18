// Vocabulary core (no AI, no database; unit-tested): canvas text → word candidates,
// duplicate handling, word selection for games, taboo-card validation.

export type Block = {type: 'h' | 'p' | 'li'; text: string};
const decode = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

/** Canvas page HTML (blocks with data-t="h|p|li") → plain text blocks. Lines inside a block (<br>) become separate blocks. */
export function canvasBlocks(html: string): Block[] {
  const out: Block[] = [];
  const re = /<(div|p|li|h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null; let any = false;
  while ((m = re.exec(String(html || '')))) {
    any = true;
    // v40: Kop 2 / Kop 3 (data-t="h2" / "h3") are headings too
    const t = (/data-t="(h[23]?|li|p)"/.exec(m[2])?.[1]?.replace(/^h[23]$/, 'h') as Block['type'] | undefined) || (/^h/i.test(m[1]) ? 'h' : m[1].toLowerCase() === 'li' ? 'li' : 'p');
    for (const line of decode(m[3].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).split('\n')) { const s = line.replace(/\s+/g, ' ').trim(); if (s) out.push({type: t as Block['type'], text: s}); }
  }
  if (!any) for (const line of decode(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '\n')).split('\n')) { const s = line.replace(/\s+/g, ' ').trim(); if (s) out.push({type: 'p', text: s}); }
  return out;
}

export const words = (s: string) => (String(s).match(/[\p{L}\p{N}'’-]+/gu) || []);
/** Normalised form for duplicate detection (case, accents kept: "été" ≠ "ete"; articles kept: "de bank" ≠ "bank"). */
export const normTerm = (s: string) => String(s || '').toLowerCase().replace(/[“”"‘’`]/g, "'").replace(/[.,;:!?()[\]]+/g, ' ').replace(/\s+/g, ' ').trim();

const ARTICLE = /^(de|het|een|the|a|an|o|os|as|um|uma|el|la|los|las|un|una|le|les|l'|der|die|das|ein|eine|to)$/i;
export type Candidate = {term: string; translation: string; example: string; page: string; kind: 'word' | 'expression'; reason: 'pair' | 'list' | 'short'};
const PAIR = /^\s*(.{1,80}?)\s+(?:=|–|—|->|→|:|-)\s+(.{1,160})$/u;
const PAREN = /^\s*([^()]{1,60}?)\s*\(([^()]{1,100})\)\s*$/u;
/** Sentence-like text (grammar explanations, example sentences): never a word card on its own. */
export function isSentence(s: string) {
  const w = words(s).length;
  return w > 6 || (w >= 4 && /[.!?]$/.test(s.trim()));
}
/** Extract candidate words/expressions from canvas blocks. Deterministic, conservative:
 *  "term = translation" pairs, short list items and short lines; headings and sentences are skipped
 *  (a sentence directly after a term is kept as its example). */
export function candidatesFrom(blocks: Block[], page: string): Candidate[] {
  const out: Candidate[] = [];
  blocks.forEach((b, i) => {
    if (b.type === 'h') return;
    const text = b.text.replace(/^[•·*\-–]\s+|^\d+[.)]\s+/, '').trim();
    if (!text || /^https?:\/\//.test(text)) return;
    const pm = PAIR.exec(text) || PAREN.exec(text);
    let term = '', translation = '', reason: Candidate['reason'] = 'short';
    if (pm && words(pm[1]).length <= 5 && !isSentence(pm[1])) { term = pm[1].trim(); translation = pm[2].trim(); reason = 'pair'; }
    else if (!isSentence(text) && words(text).length <= 5 && !/[.!?]$/.test(text) || (b.type === 'li' && words(text).length <= 5)) { term = text.replace(/[.,;:]$/, '').trim(); reason = b.type === 'li' ? 'list' : 'short'; }
    if (!term || !words(term).length || words(term).every(w => /^\d+$/.test(w))) return;
    const next = blocks[i + 1];
    const example = next && next.type !== 'h' && isSentence(next.text) && normTerm(next.text).includes(normTerm(term).replace(/^(de|het|een|the|a|an|o|a|os|as|el|la|los|las|le|la|les|der|die|das)\s+/, '')) ? next.text.slice(0, 300) : '';
    const wc = words(term).length, article = ARTICLE.test(words(term)[0] || '');
    out.push({term: term.slice(0, 120), translation: translation.slice(0, 300), example, page, kind: wc > 2 || (wc === 2 && !article) ? 'expression' : 'word', reason});
  });
  return out;
}

/** Merge duplicates (same normalised term): first spelling kept, different meanings joined ("bank; bench"). */
export function mergeCandidates(list: Candidate[]): Candidate[] {
  const map = new Map<string, Candidate>();
  for (const c of list) {
    const k = normTerm(c.term); const prev = map.get(k);
    if (!prev) { map.set(k, {...c}); continue; }
    const tr = [prev.translation, c.translation].filter(Boolean);
    prev.translation = [...new Set(tr.flatMap(x => x.split(/\s*;\s*/)))].join('; ').slice(0, 300);
    if (!prev.example && c.example) prev.example = c.example;
  }
  return [...map.values()];
}
/** Remove candidates already in the word list or already suggested (also rejected ones). */
export function newOnly(list: Candidate[], existing: string[]) {
  const have = new Set(existing.map(normTerm));
  return list.filter(c => !have.has(normTerm(c.term)));
}
/** Simple stable hash (FNV-1a) of a page's text: unchanged page → no new scan / no AI cost. */
export function pageHash(text: string) {
  let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return 'p' + (h >>> 0).toString(16).padStart(8, '0') + text.length.toString(16);
}

/* ---------------- selection for flashcards and games ---------------- */
export type Word = {id: string; term: string; translation: string; example: string; status: 'new' | 'practicing' | 'mastered'; lesson_date: string | null; created_at: string; correct_count: number; wrong_count: number; difficult?: boolean; due_at?: string};
export type Selection = {mode: 'last_lesson' | 'last5' | 'all' | 'difficult' | 'manual'; ids?: string[]};
const dateOf = (w: Word) => w.lesson_date || w.created_at.slice(0, 10);
export const isDifficult = (w: Word) => !!w.difficult || (w.status !== 'mastered' && w.wrong_count > 0 && w.wrong_count >= w.correct_count / 2);
export function selectWords(all: Word[], sel: Selection): Word[] {
  const dates = [...new Set(all.map(dateOf))].sort().reverse();
  switch (sel.mode) {
    case 'last_lesson': return all.filter(w => dateOf(w) === dates[0]);
    case 'last5': { const d = new Set(dates.slice(0, 5)); return all.filter(w => d.has(dateOf(w))); }
    case 'difficult': return all.filter(isDifficult);
    case 'manual': { const ids = new Set(sel.ids || []); return all.filter(w => ids.has(w.id)); }
    default: return all;
  }
}
/** Priority: difficult / not yet mastered and recent first; words used earlier in this session last (no repeats until needed). */
export function pickRound(pool: Word[], n: number, used: Set<string>, seed: number) {
  let s = seed >>> 0; const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 >>> 0) / 4294967296);
  const score = (w: Word) => (used.has(w.id) ? 100 : 0) + (w.status === 'mastered' ? 20 : 0) - (isDifficult(w) ? 10 : 0) - (w.status === 'new' ? 4 : 0) + rnd() * 6
    - Math.max(0, 10 - (Date.now() - new Date(dateOf(w)).getTime()) / 864e5) / 2;
  return pool.map(w => ({w, k: score(w)})).sort((a, b) => a.k - b.k).slice(0, n).map(x => x.w);
}

/* ---------------- taboo cards ---------------- */
const stem = (s: string) => normTerm(s).replace(/^(de|het|een|the|a|an|o|a|os|as|um|uma|el|la|los|las|un|una|le|la|les|l'|der|die|das|ein|eine)\s+/, '');
/** Keep forbidden words that are useful: not the target word, not containing it (or vice versa), short, no duplicates. */
export function cleanTaboo(target: string, raw: string[], max = 3): string[] {
  const t = stem(target); const out: string[] = [];
  for (const r of raw || []) {
    const w = String(r || '').replace(/[.,;:!?"“”]/g, '').trim(); const s = stem(w);
    if (!s || words(w).length > 2 || w.length > 30) continue;
    if (s === t || s.includes(t) || t.includes(s) || (s.length > 4 && t.length > 4 && s.slice(0, 5) === t.slice(0, 5))) continue;
    if (out.some(o => stem(o) === s)) continue;
    out.push(w); if (out.length >= max) break;
  }
  return out;
}
