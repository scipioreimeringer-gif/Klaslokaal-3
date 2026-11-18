// v40: bilingual lesson summaries (pure, unit-tested). Only explanations are translated: summary, covered,
// went well, focus points, category names and category explanations. The student's original sentences and their
// corrections (examples) are NEVER translated. A translation belongs to one content version (hash of the texts),
// so a teacher's correction of the explanation automatically asks for a new translation.
import type {AnalysisV2} from './pipeline';

type Path = ['summary'] | ['covered', number] | ['went_well', number] | ['focus', number] | ['cat_label', number] | ['cat_expl', number];
export type Extract = {paths: Path[]; texts: string[]};

/** The translatable texts of a v2 analysis, in a fixed order. Empty strings are skipped. */
export function extractTexts(doc: AnalysisV2): Extract {
  const paths: Path[] = [], texts: string[] = [];
  const add = (p: Path, s: unknown) => { if (typeof s === 'string' && s.trim()) { paths.push(p); texts.push(s.slice(0, 2000)); } };
  const r = doc.report;
  if (r) {
    add(['summary'], r.summary);
    (r.covered || []).forEach((s, i) => add(['covered', i], s));
    (r.went_well || []).forEach((s, i) => add(['went_well', i], s));
    (r.focus || []).forEach((s, i) => add(['focus', i], s));
  }
  (doc.categories || []).forEach((c, i) => { add(['cat_label', i], c.label); add(['cat_expl', i], c.explanation); });
  return {paths, texts: texts.slice(0, 120)};
}

/** A copy of the analysis with translated explanations. Examples (original/corrected) stay exactly as they were. */
export function applyTexts(doc: AnalysisV2, ex: Extract, translated: string[]): AnalysisV2 {
  if (translated.length !== ex.texts.length) return doc;
  const out: AnalysisV2 = {...doc, report: doc.report ? {...doc.report, covered: [...(doc.report.covered || [])], went_well: [...(doc.report.went_well || [])], focus: [...(doc.report.focus || [])]} : null,
    categories: (doc.categories || []).map(c => ({...c}))};
  ex.paths.forEach((p, i) => {
    const v = translated[i]; if (typeof v !== 'string' || !v.trim()) return;
    if (p[0] === 'summary' && out.report) out.report.summary = v;
    else if ((p[0] === 'covered' || p[0] === 'went_well' || p[0] === 'focus') && out.report) out.report[p[0]][p[1]] = v;
    else if (p[0] === 'cat_label') out.categories[p[1]].label = v;
    else if (p[0] === 'cat_expl') out.categories[p[1]].explanation = v;
  });
  return out;
}

/** Stable content key (the server hashes this with sha256). */
export const contentKey = (texts: string[]) => JSON.stringify(texts);

/** The two languages of the switch: the lesson language first, then the student's own language (if different). */
export function switchLanguages(lessonLang: string, ownLang: string): string[] {
  const a = (lessonLang || '').slice(0, 2), b = (ownLang || '').slice(0, 2);
  return a && b && a !== b ? [a, b] : a ? [a] : b ? [b] : [];
}
