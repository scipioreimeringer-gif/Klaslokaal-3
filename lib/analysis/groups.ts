// v43: group the error categories of a lesson report into recognisable grammar topics, per lesson language
// (Dutch and Brazilian Portuguese; other languages: general groups). Deterministic, no AI call.

export type GroupKey = string;
type Rule = [GroupKey, RegExp];

const NL: Rule[] = [
  ['Woordvolgorde', /volgorde|inversie|bijzin|word ?order|\border\b|plaats van het werkwoord/],
  ['Lidwoorden (de/het)', /lidwoord|de\/het|\bhet\b.*\bde\b|article|artikel/],
  ['Meervoud', /meervoud|plural/],
  ['Bijvoeglijk naamwoord', /bijvoeglijk|adjectie|adjective|buiging|verbuiging/],
  ['Voorzetsels', /voorzetsel|preposit/],
  ['Voornaamwoorden', /voornaamwoord|pronom|pronoun|\ber\b/],
  ['Werkwoorden en tijden', /werkwoord|perfectum|imperfectum|verleden|tegenwoordige|toekomend|\btijd|vervoeg|verb|tense|conjug|hulpwerkwoord|scheidbaar|participle|deelwoord|infinitief/],
  ['Woordkeuze', /woordkeuze|word ?choice|vocab|woordenschat|lexic|betekenis/],
  ['Uitspraak', /uitspraak|pronunc/],
  ['Spelling', /spelling|spell|schrijfwijze/],
];
const PT: Rule[] = [
  ['Ser en estar', /\bser\b.*\bestar\b|\bestar\b.*\bser\b|ser\/estar|ser e estar|ser en estar/],
  ['Overeenstemming (concordância)', /concord|agreement|overeenstemming|overeenkomst/],
  ['Geslacht en lidwoorden', /g[êe]nero|gender|geslacht|artigo|article|lidwoord/],
  ['Voorzetsels en samentrekkingen', /preposi|contra[çc][ãa]o|contraction|voorzetsel|samentrekking/],
  ['Voornaamwoorden', /pronome|pronoun|voornaamwoord|ênclise|próclise|clitic/],
  ['Werkwoorden en tijden', /tempo|verbo|verb|pret[ée]rito|imperfeito|subjuntivo|conjuntivo|conjug|tense|werkwoord|futuro|ger[úu]ndio|infinitivo/],
  ['Woordvolgorde', /ordem|word ?order|volgorde/],
  ['Woordkeuze', /escolha|word ?choice|vocab|woordkeuze|woordenschat|lexic|falso cognato|false friend/],
  ['Uitspraak', /pron[úu]ncia|pronunc|uitspraak/],
  ['Spelling en accenten', /ortografia|acento|accent|spelling|spell/],
];
const GENERAL: Rule[] = [
  ['Woordvolgorde', /order|volgorde|ordem|orden|ordre|reihenfolge/],
  ['Werkwoorden en tijden', /verb|tense|werkwoord|tijd|conjug|tempo|temps|zeit/],
  ['Woordkeuze', /word ?choice|vocab|woordkeuze|lexic/],
  ['Uitspraak', /pronunc|uitspraak/],
  ['Spelling', /spell|ortho/],
];
export const OTHER_GROUP = 'Overig';

/** The grammar group of one category label (+ its key), for the lesson language. */
export function grammarGroup(label: string, key: string, lessonLang: string | null | undefined): GroupKey {
  const s = (label + ' ' + key).toLowerCase().replace(/_/g, ' ');
  const rules = lessonLang === 'nl' ? NL : lessonLang === 'pt' ? PT : GENERAL;
  for (const [g, re] of rules) if (re.test(s)) return g;
  return OTHER_GROUP;
}

export type GroupedCategory<C> = {group: GroupKey; count: number; categories: C[]};
/** Categories grouped per grammar topic with summed counts, most frequent first; "Overig" last. */
export function groupCategories<C extends {label: string; key: string; count: number}>(cats: C[], lessonLang: string | null | undefined): GroupedCategory<C>[] {
  const m = new Map<GroupKey, GroupedCategory<C>>();
  for (const c of cats) {
    const g = grammarGroup(c.label, c.key, lessonLang);
    const e = m.get(g) || {group: g, count: 0, categories: []};
    e.count += Math.max(0, c.count || 0); e.categories.push(c); m.set(g, e);
  }
  return Array.from(m.values()).sort((a, b) => (a.group === OTHER_GROUP ? 1 : 0) - (b.group === OTHER_GROUP ? 1 : 0) || b.count - a.count || a.group.localeCompare(b.group));
}
