// v38: the short version of a lesson analysis (pure, unit-tested). At most 3 points, each with one wrong
// sentence (❌), its correction (✅) and one short tip. "Later" material is never shown as a weakness, uncertain
// examples only when there is nothing certain, and nothing is invented: a point without a verbatim example is skipped.
import type {AnalysisDoc} from '../analysisTypes';
import type {AnalysisV2} from './pipeline';
import type {Category, Relevance} from './core';

export type CompactPoint = {label: string; wrong: string; right: string; tip: string; recurring: boolean; count: number};
export type Compact = {summary: string; wentWell: string[]; points: CompactPoint[]; morePoints: number};

const REL_ORDER: Record<Relevance, number> = {current: 0, new_today: 1, known: 2, relevant: 3, later: 9};
/** The first sentence, at most `max` characters (cut at a word). */
export function firstSentence(s: string, max = 160): string {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^.+?[.!?](?=\s|$)/);
  let out = m ? m[0] : t;
  if (out.length > max) out = out.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return out;
}
/** At most two sentences for the summary line. */
function shortSummary(s: string): string {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.+?[.!?])(\s+.+?[.!?])?(?=\s|$)/);
  const out = m ? (m[1] + (m[2] || '')) : t;
  return out.length > 320 ? firstSentence(out, 300) : out;
}

function v2Points(cats: Category[]): CompactPoint[] {
  return cats
    .filter(c => c.relevance !== 'later' && c.count > 0)
    .map(c => ({c, ex: c.examples.find(e => e.certainty === 'certain' && e.original && e.corrected) || c.examples.find(e => e.original && e.corrected)}))
    .filter(x => !!x.ex)
    .sort((a, b) => (REL_ORDER[a.c.relevance] - REL_ORDER[b.c.relevance]) || (+b.c.recurring - +a.c.recurring) || (b.c.count - a.c.count))
    .map(({c, ex}) => ({label: c.label, wrong: ex!.original, right: ex!.corrected, tip: firstSentence(c.explanation), recurring: c.recurring, count: c.count}));
}
function v1Points(doc: AnalysisDoc, label: (cat: string) => string): CompactPoint[] {
  const by = new Map<string, AnalysisDoc['corrections']>();
  for (const c of doc.corrections || []) {
    if (!c.original || !c.corrected) continue;
    const k = c.category || 'other'; by.set(k, [...(by.get(k) || []), c]);
  }
  return [...by.entries()]
    .map(([k, list]) => ({k, list, ex: list.find(c => c.certainty !== 'uncertain') || list[0]}))
    .sort((a, b) => b.list.length - a.list.length)
    .map(({k, list, ex}) => ({label: label(k), wrong: ex.original, right: ex.corrected, tip: firstSentence(ex.explanation), recurring: false, count: list.length}));
}

/** Works for both analysis versions (v2 = categories, v1 = loose corrections). */
export function compactAnalysis(doc: AnalysisV2 | AnalysisDoc, opts: {max?: number; label?: (cat: string) => string} = {}): Compact {
  const max = opts.max ?? 3;
  const v2 = (doc as {version?: number}).version === 2;
  const all = v2 ? v2Points((doc as AnalysisV2).categories || []) : v1Points(doc as AnalysisDoc, opts.label || (k => k));
  const summary = v2 ? (doc as AnalysisV2).report?.summary || '' : (doc as AnalysisDoc).summary || '';
  const well = v2 ? (doc as AnalysisV2).report?.went_well || [] : []; // v1 has no "went well" (practiced ≠ went well)
  return {summary: shortSummary(summary), wentWell: well.slice(0, 2).map(w => firstSentence(w, 120)), points: all.slice(0, max), morePoints: Math.max(0, all.length - max)};
}
