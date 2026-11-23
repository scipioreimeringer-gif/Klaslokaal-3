// v51: built-in grammar exercises for the daily practice (pure, unit-tested, no AI). Brazilian Portuguese and Dutch.
// Every exercise is unambiguous by construction: a time marker ("Ontem", "Antigamente … sempre", "gisteren", "vroeger")
// decides the tense, and options that happen to be the same word are shown once. Explanations are fixed interface
// texts with the forms filled in (translated in the UI). Items are tracked with the existing spaced repetition
// (practice_items, key "gr:…"), so difficult forms come back more often and new example sentences replace memorised ones.

/** marks a fixed interface text (translated later with t(); also lets the key checker find it) */
const T = (k: string) => k;
export type Note = {k: string; a?: string[]};
export type GItem = {
  key: string; lang: 'pt' | 'nl'; level: number; topic: string; label: string;
  kind: 'choose' | 'fill' | 'conjugate' | 'pick' | 'correct';   // pick = choose the correct sentence; correct = rewrite a wrong sentence (v54)
  sub: string; prompt: string; hint?: string; options?: string[]; answers: string[]; notes: Note[]; verb?: string;
  /** v54: shown with conjugation exercises (infinitive · tense · person) */ tense?: string; person?: string;
};
// level index: A0 0, A1 1, A2 2, B1 3, B2 4
const A1 = 1, A2 = 2, B1 = 3;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const uniq = (a: string[]) => a.filter((x, i) => a.indexOf(x) === i);

/* ------------------------------------------------------------------ Brazilian Portuguese */
type PTense = 'pres' | 'pf' | 'imp';
const PT_TENSE: Record<PTense, string> = {pres: 'presente', pf: 'pretérito perfeito', imp: 'pretérito imperfeito'};
const PT_P = ['eu', 'você', 'nós', 'eles'] as const;
// [presente, perfeito, imperfeito] × [eu, você, nós, eles]
const PT_VERBS: {inf: string; f: Record<PTense, [string, string, string, string]>; c: string; m?: Partial<Record<PTense, string>>}[] = [
  {inf: 'ir', c: 'ao supermercado', f: {pres: ['vou', 'vai', 'vamos', 'vão'], pf: ['fui', 'foi', 'fomos', 'foram'], imp: ['ia', 'ia', 'íamos', 'iam']}},
  {inf: 'estar', c: 'em casa à noite', f: {pres: ['estou', 'está', 'estamos', 'estão'], pf: ['estive', 'esteve', 'estivemos', 'estiveram'], imp: ['estava', 'estava', 'estávamos', 'estavam']}},
  {inf: 'ter', c: 'aula de manhã', f: {pres: ['tenho', 'tem', 'temos', 'têm'], pf: ['tive', 'teve', 'tivemos', 'tiveram'], imp: ['tinha', 'tinha', 'tínhamos', 'tinham']}},
  {inf: 'fazer', c: 'o jantar', f: {pres: ['faço', 'faz', 'fazemos', 'fazem'], pf: ['fiz', 'fez', 'fizemos', 'fizeram'], imp: ['fazia', 'fazia', 'fazíamos', 'faziam']}},
  {inf: 'poder', c: 'sair mais cedo', f: {pres: ['posso', 'pode', 'podemos', 'podem'], pf: ['pude', 'pôde', 'pudemos', 'puderam'], imp: ['podia', 'podia', 'podíamos', 'podiam']}},
  {inf: 'querer', c: 'comer pizza', f: {pres: ['quero', 'quer', 'queremos', 'querem'], pf: ['quis', 'quis', 'quisemos', 'quiseram'], imp: ['queria', 'queria', 'queríamos', 'queriam']}},
  {inf: 'falar', c: 'com a minha mãe', f: {pres: ['falo', 'fala', 'falamos', 'falam'], pf: ['falei', 'falou', 'falamos', 'falaram'], imp: ['falava', 'falava', 'falávamos', 'falavam']}},
  {inf: 'comer', c: 'arroz e feijão', f: {pres: ['como', 'come', 'comemos', 'comem'], pf: ['comi', 'comeu', 'comemos', 'comeram'], imp: ['comia', 'comia', 'comíamos', 'comiam']}},
  {inf: 'trabalhar', c: 'até tarde', f: {pres: ['trabalho', 'trabalha', 'trabalhamos', 'trabalham'], pf: ['trabalhei', 'trabalhou', 'trabalhamos', 'trabalharam'], imp: ['trabalhava', 'trabalhava', 'trabalhávamos', 'trabalhavam']}},
  {inf: 'ver', c: 'os meus amigos', f: {pres: ['vejo', 'vê', 'vemos', 'veem'], pf: ['vi', 'viu', 'vimos', 'viram'], imp: ['via', 'via', 'víamos', 'viam']}},
  {inf: 'vir', c: 'para a aula de bicicleta', f: {pres: ['venho', 'vem', 'vimos', 'vêm'], pf: ['vim', 'veio', 'viemos', 'vieram'], imp: ['vinha', 'vinha', 'vínhamos', 'vinham']}},
  {inf: 'dormir', c: 'cedo', f: {pres: ['durmo', 'dorme', 'dormimos', 'dormem'], pf: ['dormi', 'dormiu', 'dormimos', 'dormiram'], imp: ['dormia', 'dormia', 'dormíamos', 'dormiam']}},
  {inf: 'morar', c: 'em Lisboa', m: {pf: 'Em 2019,', imp: 'Antigamente,'}, f: {pres: ['moro', 'mora', 'moramos', 'moram'], pf: ['morei', 'morou', 'moramos', 'moraram'], imp: ['morava', 'morava', 'morávamos', 'moravam']}},
  {inf: 'dizer', c: 'a verdade', f: {pres: ['digo', 'diz', 'dizemos', 'dizem'], pf: ['disse', 'disse', 'dissemos', 'disseram'], imp: ['dizia', 'dizia', 'dizíamos', 'diziam']}},
];
const PT_MARK: Record<PTense, string> = {pres: 'Hoje em dia,', pf: 'Ontem', imp: 'Antigamente,'};
const ptSentence = (v: typeof PT_VERBS[number], t: PTense, p: number, gap: string) => {
  const m = v.m?.[t] || PT_MARK[t];
  const always = t === 'imp' && !v.m?.imp ? ' sempre' : '';
  return `${m} ${PT_P[p]}${always} ${gap} ${v.c}.`;
};
const PT_WHY: Record<PTense, string> = {
  pres: T('{0} → {1}: wat je nu of gewoonlijk doet.'),
  pf: T('{0} → {1}: een afgeronde handeling op een bepaald moment in het verleden.'),
  imp: T('{0} → {1}: een gewoonte of beschrijving in het verleden.'),
};
function ptVerbItems(): GItem[] {
  const out: GItem[] = [];
  for (const v of PT_VERBS) for (const t of ['pres', 'pf', 'imp'] as PTense[]) PT_P.forEach((_, p) => {
    const form = v.f[t][p], marker = (v.m?.[t] || PT_MARK[t]).replace(/,$/, '');
    const others = (['pres', 'pf', 'imp'] as PTense[]).filter(x => x !== t);
    const lvl = t === 'pres' ? A1 : A2, topic = t === 'pres' ? 'present_tense' : 'past_tense', label = t === 'pres' ? 'Presente' : t === 'pf' ? 'Pretérito perfeito' : 'Pretérito imperfeito';
    const why: Note = {k: PT_WHY[t], a: [marker, PT_TENSE[t]]};
    const optionNotes: Note[] = others.filter(o => v.f[o][p] !== form).map(o => ({k: T('{0} is {1} — dat past hier niet.'), a: [v.f[o][p], PT_TENSE[o]]}));
    const base = {lang: 'pt' as const, level: lvl, topic, label, verb: v.inf};
    // A. choose the right form (only from A2: the contrast between the tenses is the point)
    if (t !== 'pres' || p === 0) out.push({...base, level: A2, key: `gr:pt:ch:${v.inf}:${t}:${p}`, kind: 'choose', sub: T('Kies de juiste vorm'), prompt: ptSentence(v, t, p, '___'),
      options: uniq([form, ...others.map(o => v.f[o][p]), v.inf]), answers: [form], notes: [why, ...optionNotes, {k: T('{0} is de infinitief (het hele werkwoord) — hier hoort een vervoegde vorm.'), a: [v.inf]}]});
    // B. fill in yourself
    out.push({...base, key: `gr:pt:fi:${v.inf}:${t}:${p}`, kind: 'fill', sub: T('Vul de juiste vorm in'), prompt: ptSentence(v, t, p, '_____'), hint: `(${v.inf})`, answers: [form], notes: [why]});
    // D. conjugate (person + tense given)
    out.push({...base, key: `gr:pt:cj:${v.inf}:${t}:${p}`, kind: 'conjugate', sub: T('Vervoeg het werkwoord'), prompt: `${v.inf} · ${PT_P[p]} · ${PT_TENSE[t]}`, answers: p === 1 ? [form, `você ${form}`, `ele ${form}`] : [form, `${PT_P[p]} ${form}`],
      notes: [{k: T('{0} is de vorm voor {1} in de {2}.'), a: [form, PT_P[p], PT_TENSE[t]]}]});
  });
  return out;
}
// ser / estar: fixed, checked sentences
const PT_SER_ESTAR: [string, 'ser' | 'estar', string, string, Note][] = [
  ['Eu ___ holandês.', 'ser', 'sou', 'estou', {k: T('Ser: herkomst en nationaliteit.')}],
  ['Hoje eu ___ muito cansado.', 'estar', 'estou', 'sou', {k: T('Estar: een tijdelijke toestand of gevoel.')}],
  ['A minha irmã ___ médica.', 'ser', 'é', 'está', {k: T('Ser: beroep.')}],
  ['O café ___ frio agora.', 'estar', 'está', 'é', {k: T('Estar: een tijdelijke toestand of gevoel.')}],
  ['Nós ___ no restaurante.', 'estar', 'estamos', 'somos', {k: T('Estar: waar iemand of iets zich bevindt.')}],
  ['Eles ___ muito simpáticos.', 'ser', 'são', 'estão', {k: T('Ser: een blijvende eigenschap.')}],
  ['A festa ___ no sábado.', 'ser', 'é', 'está', {k: T('Ser: wanneer of waar iets plaatsvindt (een gebeurtenis).')}],
  ['Você ___ doente hoje?', 'estar', 'está', 'é', {k: T('Estar: een tijdelijke toestand of gevoel.')}],
  ['A casa ___ grande e bonita.', 'ser', 'é', 'está', {k: T('Ser: een blijvende eigenschap.')}],
  ['Eu ___ com fome.', 'estar', 'estou', 'sou', {k: T('Estar: een tijdelijke toestand of gevoel.')}],
  ['Ontem ___ um dia lindo.', 'ser', 'foi', 'esteve', {k: T('Ser: een beschrijving van de dag als geheel.')}],
];
// prepositions + contractions
const PT_PREP: [string, string, string[], string][] = [
  ['Eu moro ___ Rio de Janeiro.', 'no', ['em', 'na', 'do'], 'em + o = no'],
  ['Ela gosta ___ música brasileira.', 'da', ['de', 'do', 'na'], 'de + a = da'],
  ['Hoje eu vou ___ cinema.', 'ao', ['no', 'à', 'o'], 'a + o = ao'],
  ['O livro está ___ mesa.', 'na', ['no', 'em', 'da'], 'em + a = na'],
  ['Eles são ___ Brasil.', 'do', ['de', 'da', 'no'], 'de + o = do'],
  ['Amanhã nós vamos ___ praia.', 'à', ['a', 'na', 'da'], 'a + a = à'],
  ['O avião chegou ___ aeroporto.', 'ao', ['no', 'do', 'à'], 'a + o = ao'],
  ['Eu venho ___ escola agora.', 'da', ['de', 'na', 'do'], 'de + a = da'],
  ['Eu moro ___ Holanda.', 'na', ['no', 'em', 'da'], 'em + a = na'],
  ['Ele trabalha ___ São Paulo.', 'em', ['no', 'na', 'de'], 'em + São Paulo = em São Paulo'],
  ['Eu gosto muito ___ você.', 'de', ['do', 'da', 'em'], 'gostar de + você = de você'],
  ['A chave está ___ bolso.', 'no', ['na', 'do', 'em'], 'em + o = no'],
];
// articles, gender, plural
const PT_ART: [string, string, string[], Note][] = [
  ['___ problema é difícil.', 'O', ['A', 'Os', 'Um'], {k: T('{0} is mannelijk.'), a: ['problema']}],
  ['___ cidade é muito bonita.', 'A', ['O', 'As', 'Um'], {k: T('{0} is vrouwelijk.'), a: ['cidade']}],
  ['Eu tenho dois ___. (irmão)', 'irmãos', ['irmão', 'irmões', 'irmães'], {k: T('Meervoud: {0} → {1}.'), a: ['irmão', 'irmãos']}],
  ['Eu comprei três ___. (pão)', 'pães', ['pãos', 'pões', 'pão'], {k: T('Meervoud: {0} → {1}.'), a: ['pão', 'pães']}],
  ['___ mãos estão frias.', 'As', ['Os', 'A', 'Uma'], {k: T('{0} is vrouwelijk.'), a: ['mão']}],
  ['Ela tem ___ carro novo.', 'um', ['uma', 'uns', 'o'], {k: T('{0} is mannelijk.'), a: ['carro']}],
  ['Nós temos ___ reunião às dez.', 'uma', ['um', 'umas', 'o'], {k: T('{0} is vrouwelijk.'), a: ['reunião']}],
  ['Os ___ estão abertos. (hotel)', 'hotéis', ['hotels', 'hoteis', 'hotel'], {k: T('Meervoud: {0} → {1}.'), a: ['hotel', 'hotéis']}],
  ['___ dia está lindo.', 'O', ['A', 'Os', 'As'], {k: T('{0} is mannelijk.'), a: ['dia']}],
  ['As casas são ___. (bonito)', 'bonitas', ['bonitos', 'bonita', 'bonito'], {k: T('Het bijvoeglijk naamwoord volgt geslacht en getal: {0}.'), a: ['as casas bonitas']}],
];
// word order / natural sentences (choose the correct sentence)
const PT_ORDER: [string, string, Note][] = [
  ['Eu não gosto de café.', 'Eu gosto não de café.', {k: T('Não staat vóór het werkwoord.')}],
  ['Você já almoçou?', 'Você almoçou já?', {k: T('Já staat meestal vóór het werkwoord.')}],
  ['Eu sempre tomo café de manhã.', 'Eu tomo sempre de manhã café.', {k: T('Een natuurlijke volgorde: onderwerp – (bijwoord) – werkwoord – rest.')}],
  ['Eu te ligo amanhã.', 'Eu ligo te amanhã.', {k: T('In het Braziliaans Portugees staat het voornaamwoord meestal vóór het werkwoord.')}],
];

/* ------------------------------------------------------------------ Dutch */
const NL_P = ['ik', 'jij', 'hij', 'wij', 'mijn ouders'] as const;
type NTense = 'pres' | 'imp' | 'perf';
const NL_TENSE: Record<NTense, string> = {pres: 'tegenwoordige tijd', imp: 'verleden tijd', perf: 'voltooide tijd'};
const AUX: Record<'hebben' | 'zijn', string[]> = {hebben: ['heb', 'hebt', 'heeft', 'hebben', 'hebben'], zijn: ['ben', 'bent', 'is', 'zijn', 'zijn']};
// present [ik, jij, hij, wij, ouders], past [sg, pl], participle, auxiliary, complement, marker overrides
const NL_VERBS: {inf: string; pres: string[]; imp: [string, string]; part: string; aux: 'hebben' | 'zijn'; c: string; m?: Partial<Record<NTense, string>>}[] = [
  {inf: 'werken', pres: ['werk', 'werkt', 'werkt', 'werken', 'werken'], imp: ['werkte', 'werkten'], part: 'gewerkt', aux: 'hebben', c: 'thuis'},
  {inf: 'maken', pres: ['maak', 'maakt', 'maakt', 'maken', 'maken'], imp: ['maakte', 'maakten'], part: 'gemaakt', aux: 'hebben', c: 'het huiswerk'},
  {inf: 'eten', pres: ['eet', 'eet', 'eet', 'eten', 'eten'], imp: ['at', 'aten'], part: 'gegeten', aux: 'hebben', c: 'een broodje'},
  {inf: 'kopen', pres: ['koop', 'koopt', 'koopt', 'kopen', 'kopen'], imp: ['kocht', 'kochten'], part: 'gekocht', aux: 'hebben', c: 'brood'},
  {inf: 'zien', pres: ['zie', 'ziet', 'ziet', 'zien', 'zien'], imp: ['zag', 'zagen'], part: 'gezien', aux: 'hebben', c: 'mijn vrienden'},
  {inf: 'doen', pres: ['doe', 'doet', 'doet', 'doen', 'doen'], imp: ['deed', 'deden'], part: 'gedaan', aux: 'hebben', c: 'boodschappen'},
  {inf: 'drinken', pres: ['drink', 'drinkt', 'drinkt', 'drinken', 'drinken'], imp: ['dronk', 'dronken'], part: 'gedronken', aux: 'hebben', c: 'koffie'},
  {inf: 'slapen', pres: ['slaap', 'slaapt', 'slaapt', 'slapen', 'slapen'], imp: ['sliep', 'sliepen'], part: 'geslapen', aux: 'hebben', c: 'lang'},
  {inf: 'lezen', pres: ['lees', 'leest', 'leest', 'lezen', 'lezen'], imp: ['las', 'lazen'], part: 'gelezen', aux: 'hebben', c: 'de krant'},
  {inf: 'wonen', pres: ['woon', 'woont', 'woont', 'wonen', 'wonen'], imp: ['woonde', 'woonden'], part: 'gewoond', aux: 'hebben', c: 'in Utrecht', m: {pres: 'nu', imp: 'vroeger', perf: 'vroeger'}},
  {inf: 'gaan', pres: ['ga', 'gaat', 'gaat', 'gaan', 'gaan'], imp: ['ging', 'gingen'], part: 'gegaan', aux: 'zijn', c: 'naar de markt'},
  {inf: 'komen', pres: ['kom', 'komt', 'komt', 'komen', 'komen'], imp: ['kwam', 'kwamen'], part: 'gekomen', aux: 'zijn', c: 'te laat'},
  {inf: 'blijven', pres: ['blijf', 'blijft', 'blijft', 'blijven', 'blijven'], imp: ['bleef', 'bleven'], part: 'gebleven', aux: 'zijn', c: 'thuis'},
  {inf: 'beginnen', pres: ['begin', 'begint', 'begint', 'beginnen', 'beginnen'], imp: ['begon', 'begonnen'], part: 'begonnen', aux: 'zijn', c: 'om negen uur'},
];
const NL_MARK: Record<NTense, string> = {pres: 'elke dag', imp: 'gisteren', perf: 'gisteren'};
function nlItems(): GItem[] {
  const out: GItem[] = [];
  for (const v of NL_VERBS) NL_P.forEach((subj, p) => {
    const S = cap(subj), mk = (t: NTense) => v.m?.[t] || NL_MARK[t];
    const pres = v.pres[p], imp = v.imp[p >= 3 ? 1 : 0], aux = AUX[v.aux][p], other = AUX[v.aux === 'hebben' ? 'zijn' : 'hebben'][p];
    const base = {lang: 'nl' as const, verb: v.inf};
    // present (A1)
    out.push({...base, level: A1, topic: 'present_tense', label: 'Tegenwoordige tijd', key: `gr:nl:fi:${v.inf}:pres:${p}`, kind: 'fill', sub: T('Vul de juiste vorm in'),
      prompt: `${S} _____ ${mk('pres')} ${v.c}.`, hint: `(${v.inf})`, answers: [pres], notes: [{k: T('{0} is de vorm voor {1} in de {2}.'), a: [pres, subj, NL_TENSE.pres]}]});
    out.push({...base, level: A1, topic: 'conjugation', label: 'Werkwoordsvervoeging', key: `gr:nl:cj:${v.inf}:pres:${p}`, kind: 'conjugate', sub: T('Vervoeg het werkwoord'),
      prompt: `${v.inf} · ${subj} · ${NL_TENSE.pres}`, answers: [pres, `${subj} ${pres}`], notes: [{k: T('{0} is de vorm voor {1} in de {2}.'), a: [pres, subj, NL_TENSE.pres]}]});
    // past tense (A2): choose + fill
    out.push({...base, level: A2, topic: 'past_tense', label: 'Verleden tijd', key: `gr:nl:ch:${v.inf}:imp:${p}`, kind: 'choose', sub: T('Kies de juiste vorm'),
      prompt: `${S} ___ ${mk('imp')} ${v.c}.`, options: uniq([imp, v.imp[p >= 3 ? 0 : 1], pres, v.part]), answers: [imp],
      notes: [{k: mk('imp') === 'vroeger' ? PT_WHY.imp : PT_WHY.pf, a: [mk('imp'), NL_TENSE.imp]}, {k: T('{0} is enkelvoud, {1} is meervoud.'), a: [v.imp[0], v.imp[1]]}]});
    out.push({...base, level: A2, topic: 'past_tense', label: 'Verleden tijd', key: `gr:nl:fi:${v.inf}:imp:${p}`, kind: 'fill', sub: T('Vul de juiste vorm in'),
      prompt: `${S} _____ ${mk('imp')} ${v.c}.`, hint: `(${v.inf})`, answers: [imp], notes: [{k: T('{0} is de vorm voor {1} in de {2}.'), a: [imp, subj, NL_TENSE.imp]}]});
    // perfect: hebben or zijn (A2)
    out.push({...base, level: A2, topic: 'auxiliary', label: 'Hebben of zijn', key: `gr:nl:ch:${v.inf}:perf:${p}`, kind: 'choose', sub: T('Kies de juiste vorm'),
      prompt: `${S} ___ ${mk('perf')} ${v.c} ${v.part}.`, options: [aux, other], answers: [aux],
      notes: [{k: T('Bij {0} gebruik je in de voltooide tijd het hulpwerkwoord {1}.'), a: [v.inf, v.aux]}, ...(v.aux === 'zijn' ? [{k: T('Zijn gebruik je bij werkwoorden van beweging naar een plek of van verandering (gaan, komen, blijven, beginnen).')}] : [])]});
    out.push({...base, level: A2, topic: 'participle', label: 'Voltooid deelwoord', key: `gr:nl:fi:${v.inf}:perf:${p}`, kind: 'fill', sub: T('Vul de juiste vorm in'),
      prompt: `${S} ${aux} ${mk('perf')} ${v.c} _____.`, hint: `(${v.inf})`, answers: [v.part], notes: [{k: T('Voltooid deelwoord van {0}: {1}.'), a: [v.inf, v.part]}]});
  });
  return out;
}
const NL_INV: [string, string, Note][] = [
  ['Morgen ga ik naar Utrecht.', 'Morgen ik ga naar Utrecht.', {k: T('Begint de zin met iets anders dan het onderwerp, dan staat de persoonsvorm op de tweede plaats (inversie).')}],
  ['Gisteren heb ik hard gewerkt.', 'Gisteren ik heb hard gewerkt.', {k: T('Begint de zin met iets anders dan het onderwerp, dan staat de persoonsvorm op de tweede plaats (inversie).')}],
  ['In het weekend speel ik voetbal.', 'In het weekend ik speel voetbal.', {k: T('Begint de zin met iets anders dan het onderwerp, dan staat de persoonsvorm op de tweede plaats (inversie).')}],
  ['Werk jij morgen thuis?', 'Werkt jij morgen thuis?', {k: T('Staat jij ná het werkwoord, dan valt de -t weg: werk jij?')}],
  ['Vanavond eten we pizza.', 'Vanavond we eten pizza.', {k: T('Begint de zin met iets anders dan het onderwerp, dan staat de persoonsvorm op de tweede plaats (inversie).')}],
  ['Daarna gingen we naar huis.', 'Daarna we gingen naar huis.', {k: T('Begint de zin met iets anders dan het onderwerp, dan staat de persoonsvorm op de tweede plaats (inversie).')}],
];
const NL_SUB: [string, string, Note][] = [
  ['Ik blijf thuis omdat ik ziek ben.', 'Ik blijf thuis omdat ik ben ziek.', {k: T('In een bijzin (na omdat, dat, als, toen …) staat de persoonsvorm aan het eind.')}],
  ['Ik weet dat hij morgen komt.', 'Ik weet dat hij komt morgen.', {k: T('In een bijzin (na omdat, dat, als, toen …) staat de persoonsvorm aan het eind.')}],
  ['Als het regent, neem ik de bus.', 'Als het regent, ik neem de bus.', {k: T('Na een bijzin aan het begin komt eerst de persoonsvorm van de hoofdzin.')}],
  ['Toen ik klein was, woonde ik in Gent.', 'Toen ik was klein, woonde ik in Gent.', {k: T('In een bijzin (na omdat, dat, als, toen …) staat de persoonsvorm aan het eind.')}],
  ['Ze zegt dat ze geen tijd heeft.', 'Ze zegt dat ze heeft geen tijd.', {k: T('In een bijzin (na omdat, dat, als, toen …) staat de persoonsvorm aan het eind.')}],
  ['Ik denk dat we te laat zijn.', 'Ik denk dat we zijn te laat.', {k: T('In een bijzin (na omdat, dat, als, toen …) staat de persoonsvorm aan het eind.')}],
];

/* ------------------------------------------------------------------ conversation questions (F) */
export const CONVERSATION: Record<'pt' | 'nl', [number, string, string][]> = {
  pt: [
    [A1, 'De onde você é?', 'present_tense'], [A1, 'O que você gosta de comer?', 'present_tense'], [A1, 'Onde você mora?', 'present_tense'],
    [A2, 'O que você fez ontem à noite?', 'past_tense'], [A2, 'Aonde você foi nas últimas férias?', 'past_tense'], [A2, 'Como era a sua casa quando você era criança?', 'past_tense'],
    [A2, 'O que você fazia nos fins de semana quando era criança?', 'past_tense'], [A2, 'Como você está hoje? Por quê?', 'ser_estar'],
    [B1, 'O que você faria se tivesse um mês de férias?', 'conjugation'], [B1, 'Qual foi a melhor viagem da sua vida? Conte um pouco.', 'past_tense'],
  ],
  nl: [
    [A1, 'Waar woon je?', 'present_tense'], [A1, 'Wat eet je graag?', 'present_tense'], [A1, 'Wat doe je in het weekend?', 'present_tense'],
    [A2, 'Wat heb je gisteren gedaan?', 'auxiliary'], [A2, 'Waar ben je in je laatste vakantie naartoe gegaan?', 'auxiliary'], [A2, 'Wat deed je vroeger in het weekend?', 'past_tense'],
    [A2, 'Wat ga je morgen doen? Begin je zin met "Morgen".', 'inversion'],
    [B1, 'Waarom leer je Nederlands? Gebruik "omdat".', 'subordinate_clause'], [B1, 'Wat zou je doen als je een dag vrij had?', 'subordinate_clause'],
  ],
};

/* ------------------------------------------------------------------ v54: B1, B2 and C1 (written per language, never translated) */
// [level, kind, prompt, answers, hint, explanation (in the target language), verb, tense, person, options?]
type Adv = [number, 'fill' | 'correct' | 'choose' | 'pick', string, string[], string, string, string?, string?, string?, string[]?];
const B2 = 4, C1 = 5;
const PT_ADV: Adv[] = [
  [B1, 'fill', 'Enquanto eu _____ o jantar, o telefone tocou.', ['fazia'], '(fazer)', 'Ação em andamento no passado, interrompida por outra: pretérito imperfeito.', 'fazer', 'pretérito imperfeito', 'eu'],
  [B1, 'fill', 'Eu já _____ esse filme duas vezes.', ['vi'], '(ver)', 'Ação concluída: pretérito perfeito.', 'ver', 'pretérito perfeito', 'eu'],
  [B1, 'fill', 'Nós _____ em São Paulo de 2015 a 2019.', ['moramos', 'morávamos'], '(morar)', 'Período fechado no passado: perfeito (o imperfeito também se usa para descrever).', 'morar', 'pretérito perfeito', 'nós'],
  [B1, 'correct', 'Quando eu era criança, eu fui à praia todo verão.', ['Quando eu era criança, eu ia à praia todo verão.'], '', 'Hábito no passado ("todo verão"): pretérito imperfeito.'],
  [B1, 'correct', 'Ontem eu ia ao cinema e via um filme ótimo.', ['Ontem eu fui ao cinema e vi um filme ótimo.'], '', 'Ações concluídas num momento definido ("ontem"): pretérito perfeito.'],
  [B1, 'correct', 'Eu estou cansado porque eu trabalhei muito ontem e eu dormi pouco e eu estou com sono.', ['Estou cansado porque trabalhei muito ontem e dormi pouco.'], '', 'Em português o sujeito "eu" costuma ficar implícito quando a forma do verbo já mostra a pessoa; evite repetir.'],
  [B2, 'fill', 'Espero que você _____ bem amanhã.', ['esteja'], '(estar)', 'Depois de "espero que": presente do subjuntivo.', 'estar', 'presente do subjuntivo', 'você'],
  [B2, 'fill', 'É importante que nós _____ cedo.', ['cheguemos'], '(chegar)', 'Expressão impessoal + "que": presente do subjuntivo.', 'chegar', 'presente do subjuntivo', 'nós'],
  [B2, 'fill', 'Talvez eles _____ razão.', ['tenham'], '(ter)', 'Dúvida com "talvez" antes do verbo: subjuntivo.', 'ter', 'presente do subjuntivo', 'eles'],
  [B2, 'fill', 'Se eu _____ mais tempo, viajaria mais.', ['tivesse'], '(ter)', 'Hipótese com "se" + futuro do pretérito: imperfeito do subjuntivo.', 'ter', 'imperfeito do subjuntivo', 'eu'],
  [B2, 'fill', 'Quando você _____ ao Brasil, me avise.', ['vier'], '(vir)', 'Futuro com "quando": futuro do subjuntivo.', 'vir', 'futuro do subjuntivo', 'você'],
  [B2, 'fill', 'Eu queria que ela me _____ a verdade.', ['dissesse'], '(dizer)', 'Desejo no passado ("queria que"): imperfeito do subjuntivo.', 'dizer', 'imperfeito do subjuntivo', 'ela'],
  [B2, 'fill', 'Embora _____ cansada, ela foi à festa.', ['estivesse'], '(estar)', '"Embora" pede subjuntivo; no passado: imperfeito do subjuntivo.', 'estar', 'imperfeito do subjuntivo', 'ela'],
  [B2, 'correct', 'Espero que você está bem.', ['Espero que você esteja bem.'], '', 'Depois de "espero que" usa-se o subjuntivo.'],
  [B2, 'correct', 'Se eu tinha dinheiro, eu viajaria pelo mundo.', ['Se eu tivesse dinheiro, eu viajaria pelo mundo.', 'Se eu tivesse dinheiro, viajaria pelo mundo.'], '', 'Hipótese irreal: "se" + imperfeito do subjuntivo.'],
  [B2, 'correct', 'O livro que eu te falei é muito bom.', ['O livro de que eu te falei é muito bom.', 'O livro sobre o qual eu te falei é muito bom.'], '', 'Na norma culta: "falar de" → "de que".'],
  [C1, 'choose', 'O que significa "pisar na bola"?', ['cometer um erro'], '', '"Pisar na bola" = errar, falhar com alguém.', undefined, undefined, undefined, ['cometer um erro', 'jogar futebol bem', 'ter muita sorte']],
  [C1, 'choose', 'O que significa "dar um jeito"?', ['encontrar uma solução'], '', '"Dar um jeito" = resolver, encontrar uma solução (muitas vezes improvisada).', undefined, undefined, undefined, ['encontrar uma solução', 'ser educado', 'desistir de algo']],
  [C1, 'choose', 'O que significa "chover no molhado"?', ['repetir o óbvio'], '', '"Chover no molhado" = dizer algo que todos já sabem.', undefined, undefined, undefined, ['repetir o óbvio', 'ter azar', 'chorar muito']],
  [C1, 'choose', 'O que significa "fazer vista grossa"?', ['fingir que não viu'], '', '"Fazer vista grossa" = ignorar algo de propósito.', undefined, undefined, undefined, ['fingir que não viu', 'precisar de óculos', 'olhar com atenção']],
  [C1, 'choose', 'O que significa "custar os olhos da cara"?', ['ser muito caro'], '', 'Expressão informal para algo muito caro.', undefined, undefined, undefined, ['ser muito caro', 'ser muito bonito', 'cansar a vista']],
  [C1, 'pick', 'Num e-mail para um cliente que você não conhece:', ['Prezado senhor, gostaria de confirmar a nossa reunião de amanhã.'], '', 'Registro formal: "Prezado(a)", "gostaria de". "E aí", "bora" e "beleza" são muito informais.', undefined, undefined, undefined, ['Prezado senhor, gostaria de confirmar a nossa reunião de amanhã.', 'E aí, beleza? Bora confirmar a reunião de amanhã?']],
  [C1, 'correct', 'Fazem dois anos que moro aqui.', ['Faz dois anos que moro aqui.'], '', '"Fazer" indicando tempo decorrido é impessoal: fica no singular.'],
  [C1, 'correct', 'Houveram muitos problemas na reunião.', ['Houve muitos problemas na reunião.'], '', '"Haver" no sentido de existir é impessoal: sempre no singular.'],
  [C1, 'correct', 'Se eu ver o Pedro, eu falo com ele.', ['Se eu vir o Pedro, eu falo com ele.', 'Se eu vir o Pedro, falo com ele.'], '', 'Futuro do subjuntivo de "ver" é "vir" (se eu vir), não "ver".'],
  [C1, 'correct', 'Prefiro mais café do que chá.', ['Prefiro café a chá.'], '', '"Preferir" já expressa comparação: preferir algo a algo (sem "mais" e sem "do que").'],
];
const NL_ADV: Adv[] = [
  [B1, 'fill', 'Toen ik binnenkwam, _____ iedereen al aan tafel.', ['zat'], '(zitten)', 'Gisteren / toen: verleden tijd. Zitten is onregelmatig: zat.', 'zitten', 'verleden tijd', 'iedereen'],
  [B1, 'fill', 'Ik weet niet of hij morgen _____.', ['komt'], '(komen)', 'In een bijzin met "of" staat de persoonsvorm achteraan.', 'komen', 'tegenwoordige tijd', 'hij'],
  [B1, 'correct', 'Ik blijf thuis, omdat ik heb geen tijd.', ['Ik blijf thuis, omdat ik geen tijd heb.', 'Ik blijf thuis omdat ik geen tijd heb.'], '', 'In een bijzin met "omdat" staat de persoonsvorm aan het eind.'],
  [B1, 'correct', 'Gisteren ik heb mijn moeder gebeld.', ['Gisteren heb ik mijn moeder gebeld.'], '', 'Begint de zin met "gisteren", dan staat de persoonsvorm op de tweede plaats (inversie).'],
  [B2, 'fill', 'Toen ik op het station aankwam, _____ de trein al vertrokken.', ['was'], '(zijn)', 'Iets dat vóór een ander moment in het verleden gebeurde: voltooid verleden tijd (was + voltooid deelwoord).', 'zijn', 'voltooid verleden tijd', 'de trein'],
  [B2, 'fill', 'Als ik meer tijd had, _____ ik vaker sporten.', ['zou'], '(zullen)', 'Een voorwaarde die niet waar is: "als … had", dan "zou" + infinitief.', 'zullen', 'voorwaardelijke wijs', 'ik'],
  [B2, 'fill', 'Het huis _____ vorig jaar verkocht.', ['werd'], '(worden)', 'Lijdende vorm in de verleden tijd: werd + voltooid deelwoord.', 'worden', 'verleden tijd (passief)', 'het huis'],
  [B2, 'fill', 'Ik had het boek al _____ voordat de film uitkwam.', ['gelezen'], '(lezen)', 'Voltooid verleden tijd: had + voltooid deelwoord.', 'lezen', 'voltooid verleden tijd', 'ik'],
  [B2, 'correct', 'Ik weet niet waar is het station.', ['Ik weet niet waar het station is.'], '', 'In een vraagbijzin ("waar …") staat de persoonsvorm aan het eind.'],
  [B2, 'correct', 'Het boek wat ik lees is spannend.', ['Het boek dat ik lees is spannend.'], '', 'Bij een het-woord is het betrekkelijk voornaamwoord "dat", niet "wat".'],
  [B2, 'correct', 'Als ik rijk was, ik zou een huis kopen.', ['Als ik rijk was, zou ik een huis kopen.'], '', 'Na een bijzin aan het begin komt eerst de persoonsvorm van de hoofdzin.'],
  [B2, 'correct', 'Hij heeft gisteren opgebeld mij.', ['Hij heeft me gisteren opgebeld.', 'Hij heeft mij gisteren opgebeld.'], '', 'Het voltooid deelwoord staat aan het eind van de zin; het voornaamwoord komt vroeg.'],
  [C1, 'choose', 'Wat betekent "de kat uit de boom kijken"?', ['eerst afwachten hoe iets loopt'], '', 'Je wacht af voordat je iets doet of zegt.', undefined, undefined, undefined, ['eerst afwachten hoe iets loopt', 'een dier redden', 'heel nieuwsgierig zijn']],
  [C1, 'choose', 'Wat betekent "met de deur in huis vallen"?', ['meteen ter zake komen'], '', 'Direct zeggen waar het om gaat, zonder inleiding.', undefined, undefined, undefined, ['meteen ter zake komen', 'onhandig binnenkomen', 'te laat komen']],
  [C1, 'choose', 'Wat betekent "door de mand vallen"?', ['betrapt of ontmaskerd worden'], '', 'Het blijkt dat iemand niet de waarheid sprak of niet kon wat hij zei.', undefined, undefined, undefined, ['betrapt of ontmaskerd worden', 'boodschappen laten vallen', 'heel moe zijn']],
  [C1, 'choose', 'Wat betekent "de kool en de geit sparen"?', ['geen partij kiezen om niemand te kwetsen'], '', 'Je probeert iedereen tevreden te houden.', undefined, undefined, undefined, ['geen partij kiezen om niemand te kwetsen', 'zuinig koken', 'voor dieren zorgen']],
  [C1, 'choose', 'Wat betekent "een oogje in het zeil houden"?', ['opletten en toezicht houden'], '', 'Je houdt in de gaten dat alles goed gaat.', undefined, undefined, undefined, ['opletten en toezicht houden', 'gaan zeilen', 'één oog dichtdoen']],
  [C1, 'pick', 'In een e-mail aan een klant die je niet kent:', ['Geachte heer Jansen, hierbij stuur ik u de offerte.'], '', 'Formeel register: "Geachte …", "u", "hierbij". "Hoi" en "hoor" zijn informeel.', undefined, undefined, undefined, ['Geachte heer Jansen, hierbij stuur ik u de offerte.', 'Hoi Jansen, hier is de offerte hoor.']],
  [C1, 'correct', 'Dat is de man waarvan ik het boek heb gelezen.', ['Dat is de man van wie ik het boek heb gelezen.'], '', 'Bij personen gebruik je "van wie", niet "waarvan".'],
  [C1, 'correct', 'Hij is veel groter als ik.', ['Hij is veel groter dan ik.'], '', 'Na een vergrotende trap gebruik je "dan".'],
  [C1, 'correct', 'Hun hebben dat gisteren gezegd.', ['Zij hebben dat gisteren gezegd.', 'Ze hebben dat gisteren gezegd.'], '', '"Hun" is nooit onderwerp; het onderwerp is "zij" of "ze".'],
  [C1, 'correct', 'Het meisje die daar loopt is mijn zus.', ['Het meisje dat daar loopt is mijn zus.'], '', '"Meisje" is een het-woord: het betrekkelijk voornaamwoord is "dat".'],
];
function advItems(lang: 'pt' | 'nl'): GItem[] {
  return (lang === 'pt' ? PT_ADV : NL_ADV).map(([level, kind, prompt, answers, hint, why, verb, tense, person, options], i) => ({
    key: `gr:${lang}:ad:${i}`, lang, level, kind, topic: kind === 'choose' ? 'idioms' : kind === 'pick' ? 'register' : verb ? 'conjugation' : 'word_order',
    label: kind === 'choose' ? (lang === 'pt' ? 'Expressões idiomáticas' : 'Uitdrukkingen') : kind === 'pick' ? (lang === 'pt' ? 'Registro' : 'Register') : verb ? (tense || '') : (lang === 'pt' ? 'Correção' : 'Zinsbouw'),
    sub: kind === 'fill' ? T('Vul de juiste vorm in') : kind === 'correct' ? T('Verbeter de zin') : kind === 'pick' ? T('Welke zin is goed?') : T('Kies de juiste betekenis'),
    prompt, hint: hint || undefined, options, answers, notes: [{k: why}], verb, ...(tense ? {tense, person} : {}),
  } as GItem));
}

/** v54: what a conjugation exercise asks — infinitive, tense and person — always complete (or null when unknown). */
export function describe(g: GItem): {verb: string; tense: string; person: string} | null {
  if (g.tense && g.person && g.verb) return {verb: g.verb, tense: g.tense, person: g.person};
  const m = /^gr:(pt|nl):(?:ch|fi|cj):([^:]+):(pres|pf|imp|perf):(\d)$/.exec(g.key);
  if (!m) return null;
  const p = +m[4], lang = m[1];
  const tense = lang === 'pt' ? PT_TENSE[m[3] as PTense] : NL_TENSE[(m[3] === 'pf' ? 'imp' : m[3]) as NTense];
  const person = lang === 'pt' ? PT_P[p] : NL_P[p];
  return tense && person ? {verb: m[2], tense, person} : null;
}

let cache: Record<string, GItem[]> = {};
/** All built-in grammar items for a language ('pt' / 'nl'); other languages have none (the practice then uses the
 *  student's own words and mistakes only). */
export function grammarBank(lang: string): GItem[] {
  const l = lang === 'pt' || lang.startsWith('pt') ? 'pt' : lang === 'nl' || lang.startsWith('nl') ? 'nl' : '';
  if (!l) return [];
  if (cache[l]) return cache[l];
  const items: GItem[] = [];
  if (l === 'pt') {
    items.push(...ptVerbItems());
    PT_SER_ESTAR.forEach(([s, verb, right, wrong, note], i) => items.push({key: `gr:pt:se:${i}`, lang: 'pt', level: A2, topic: 'ser_estar', label: 'Ser e estar', kind: 'choose', sub: T('Kies ser of estar'), prompt: s,
      options: [right, wrong], answers: [right], notes: [note, {k: T('Hier hoort {0} ({1}).'), a: [right, verb]}]}));
    PT_PREP.forEach(([s, right, wrong, rule], i) => items.push({key: `gr:pt:pr:${i}`, lang: 'pt', level: A2, topic: 'prepositions', label: 'Preposições e contrações', kind: i % 2 ? 'fill' : 'choose', sub: i % 2 ? T('Vul het juiste voorzetsel in') : T('Kies het juiste voorzetsel'),
      prompt: s, options: i % 2 ? undefined : uniq([right, ...wrong]), answers: [right], notes: [{k: T('Samentrekking: {0}.'), a: [rule]}]}));
    PT_ART.forEach(([s, right, wrong, note], i) => items.push({key: `gr:pt:ar:${i}`, lang: 'pt', level: A1, topic: /Meervoud|bijvoeglijk/i.test(note.k) ? 'plural' : 'articles', label: 'Artigos, gênero e plural', kind: 'choose', sub: T('Kies de juiste vorm'),
      prompt: s, options: uniq([right, ...wrong]), answers: [right], notes: [note]}));
    items.push(...advItems('pt'));
    PT_ORDER.forEach(([right, wrong, note], i) => items.push({key: `gr:pt:wo:${i}`, lang: 'pt', level: A2, topic: 'word_order', label: 'Ordem das palavras', kind: 'pick', sub: T('Welke zin is goed?'), prompt: '',
      options: i % 2 ? [right, wrong] : [wrong, right], answers: [right], notes: [note]}));
  } else {
    items.push(...nlItems(), ...advItems('nl'));
    NL_INV.forEach(([right, wrong, note], i) => items.push({key: `gr:nl:in:${i}`, lang: 'nl', level: A2, topic: 'inversion', label: 'Inversie', kind: 'pick', sub: T('Welke zin is goed?'), prompt: '', options: i % 2 ? [right, wrong] : [wrong, right], answers: [right], notes: [note]}));
    NL_SUB.forEach(([right, wrong, note], i) => items.push({key: `gr:nl:bz:${i}`, lang: 'nl', level: B1, topic: 'subordinate_clause', label: 'Bijzinnen', kind: 'pick', sub: T('Welke zin is goed?'), prompt: '', options: i % 2 ? [right, wrong] : [wrong, right], answers: [right], notes: [note]}));
  }
  cache[l] = items;
  return items;
}
export const _resetGrammarCache = () => { cache = {}; };

/** Grammar topics that belong together: an error in one of them makes the bank items of the group more likely. */
export const TOPIC_GROUP: Record<string, string[]> = {
  past_tense: ['past_tense', 'auxiliary', 'participle'], auxiliary: ['auxiliary', 'past_tense', 'participle'], participle: ['participle', 'auxiliary'],
  present_tense: ['present_tense', 'conjugation'], conjugation: ['conjugation', 'present_tense', 'past_tense'],
  ser_estar: ['ser_estar'], prepositions: ['prepositions'], articles: ['articles', 'plural'], gender: ['articles', 'plural'], plural: ['plural', 'articles'],
  inversion: ['inversion', 'word_order'], word_order: ['word_order', 'inversion', 'subordinate_clause'], subordinate_clause: ['subordinate_clause', 'word_order'], sentence_structure: ['word_order', 'inversion'],
};
