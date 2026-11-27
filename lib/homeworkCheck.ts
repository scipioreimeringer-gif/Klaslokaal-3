// v77: homework quality gate before publishing (pure, unit-tested). Multiple choice = exactly four separate, unique,
// non-empty options with exactly one of them marked correct. Auto-checked types need an answer; open tasks do not.
export type HwItemLike = {type: string; prompt: string; options?: string[]; answer?: string; accept?: string[]};
const OPEN = new Set(['write', 'make_sentence', 'reading']);
const n = (s: string) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Four option slots (pads or trims older sets; an option list typed as "a / b / c" in one field is split once). */
export function fourOptions(options: string[] | undefined): string[] {
  let o = (options || []).map(x => String(x ?? ''));
  if (o.filter(x => x.trim()).length === 1 && /\s[/|]\s/.test(o.find(x => x.trim()) || '')) o = (o.find(x => x.trim()) || '').split(/\s[/|]\s/).map(x => x.trim());
  return [...o, '', '', '', ''].slice(0, 4);
}

/** Problems per question (empty list = ready to publish). Texts are interface keys (translated in the UI). */
export function itemIssues(it: HwItemLike): string[] {
  const out: string[] = [];
  if (!String(it.prompt || '').trim()) out.push('De opdracht is leeg.');
  if (it.type === 'multiple_choice') {
    const o = (it.options || []).map(x => String(x || '').trim());
    if (o.length !== 4 || o.some(x => !x)) out.push('Vul alle vier de antwoordmogelijkheden in.');
    else if (new Set(o.map(n)).size !== 4) out.push('De vier antwoordmogelijkheden moeten verschillend zijn.');
    if (o.filter(x => x && n(x) === n(it.answer || '')).length !== 1) out.push('Kies precies één juist antwoord.');
  } else if (!OPEN.has(it.type) && !String(it.answer || '').trim()) out.push('Vul het juiste antwoord in.');
  return out;
}
export function setIssues(items: HwItemLike[]): {index: number; issues: string[]}[] {
  return items.map((it, index) => ({index, issues: itemIssues(it)})).filter(x => x.issues.length);
}
