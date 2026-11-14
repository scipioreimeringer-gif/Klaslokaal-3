// Brazilian Portuguese practice material for the lesson preparation page.
export const PERSONS = ['eu', 'você / ele / ela', 'nós', 'vocês / eles / elas'] as const;
export type Tense = 'presente' | 'perfeito' | 'imperfeito';
export const TENSES: Record<Tense, string> = {presente: 'Presente', perfeito: 'Pretérito perfeito', imperfeito: 'Pretérito imperfeito'};

type Forms = [string, string, string, string];
export const VERBS: Record<string, {nl: string; presente: Forms; perfeito: Forms; imperfeito?: Forms}> = {
  ser: {nl: 'zijn (blijvend)', presente: ['sou', 'é', 'somos', 'são'], perfeito: ['fui', 'foi', 'fomos', 'foram'], imperfeito: ['era', 'era', 'éramos', 'eram']},
  estar: {nl: 'zijn (tijdelijk)', presente: ['estou', 'está', 'estamos', 'estão'], perfeito: ['estive', 'esteve', 'estivemos', 'estiveram']},
  ter: {nl: 'hebben', presente: ['tenho', 'tem', 'temos', 'têm'], perfeito: ['tive', 'teve', 'tivemos', 'tiveram'], imperfeito: ['tinha', 'tinha', 'tínhamos', 'tinham']},
  ir: {nl: 'gaan', presente: ['vou', 'vai', 'vamos', 'vão'], perfeito: ['fui', 'foi', 'fomos', 'foram'], imperfeito: ['ia', 'ia', 'íamos', 'iam']},
  fazer: {nl: 'doen, maken', presente: ['faço', 'faz', 'fazemos', 'fazem'], perfeito: ['fiz', 'fez', 'fizemos', 'fizeram']},
  poder: {nl: 'kunnen, mogen', presente: ['posso', 'pode', 'podemos', 'podem'], perfeito: ['pude', 'pôde', 'pudemos', 'puderam']},
  querer: {nl: 'willen', presente: ['quero', 'quer', 'queremos', 'querem'], perfeito: ['quis', 'quis', 'quisemos', 'quiseram']},
  dizer: {nl: 'zeggen', presente: ['digo', 'diz', 'dizemos', 'dizem'], perfeito: ['disse', 'disse', 'dissemos', 'disseram']},
  ver: {nl: 'zien', presente: ['vejo', 'vê', 'vemos', 'veem'], perfeito: ['vi', 'viu', 'vimos', 'viram']},
  dar: {nl: 'geven', presente: ['dou', 'dá', 'damos', 'dão'], perfeito: ['dei', 'deu', 'demos', 'deram']},
  falar: {nl: 'spreken', presente: ['falo', 'fala', 'falamos', 'falam'], perfeito: ['falei', 'falou', 'falamos', 'falaram']},
  comer: {nl: 'eten', presente: ['como', 'come', 'comemos', 'comem'], perfeito: ['comi', 'comeu', 'comemos', 'comeram']},
  partir: {nl: 'vertrekken', presente: ['parto', 'parte', 'partimos', 'partem'], perfeito: ['parti', 'partiu', 'partimos', 'partiram']},
};

/** Imperfeito: regular for every verb in the list except ser, ter and ir (given explicitly). */
export function conjugate(verb: string, tense: Tense): Forms {
  const v = VERBS[verb];
  if (tense !== 'imperfeito') return v[tense];
  if (v.imperfeito) return v.imperfeito;
  const stem = verb.slice(0, -2), end = verb.slice(-2);
  return end === 'ar' ? [stem + 'ava', stem + 'ava', stem + 'ávamos', stem + 'avam'] : [stem + 'ia', stem + 'ia', stem + 'íamos', stem + 'iam'];
}

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
export function checkAnswer(answer: string, correct: string): 'correct' | 'accent' | 'wrong' {
  const a = answer.trim().toLowerCase();
  if (a === correct) return 'correct';
  return plain(a) === plain(correct) ? 'accent' : 'wrong';
}

export const SPEAKING: {theme: string; questions: string[]}[] = [
  {theme: 'Rotina', questions: ['Como é a sua rotina num dia normal?', 'O que você costuma fazer no fim de semana?', 'A que horas você acorda e o que faz primeiro?']},
  {theme: 'Passado', questions: ['O que você fez ontem à noite?', 'Conte sobre a sua última viagem.', 'Como era a sua vida quando você era criança?']},
  {theme: 'Opinião', questions: ['Qual é a sua comida preferida e por quê?', 'Você prefere morar na cidade ou no campo? Por quê?', 'O que você acha das redes sociais?']},
  {theme: 'Futuro e hipóteses', questions: ['O que você vai fazer nas próximas férias?', 'O que você faria se tivesse um mês livre?', 'Onde você gostaria de morar daqui a dez anos?']},
  {theme: 'Trabalho', questions: ['Fale sobre o seu trabalho como professor.', 'Qual foi o melhor momento da sua semana?', 'O que você aprendeu recentemente?']},
];

export const STARTER_WORDS: {nl: string; uit: string}[] = [
  {nl: 'a saudade', uit: 'het gemis, heimwee'}, {nl: 'valer a pena', uit: 'de moeite waard zijn'}, {nl: 'dar certo', uit: 'lukken, goed uitpakken'},
  {nl: 'ainda', uit: 'nog'}, {nl: 'já', uit: 'al, meteen'}, {nl: 'aproveitar', uit: 'genieten van, benutten'}, {nl: 'combinar', uit: 'afspreken'},
  {nl: 'mudar', uit: 'veranderen, verhuizen'}, {nl: 'lembrar-se de', uit: 'zich herinneren'}, {nl: 'esquecer', uit: 'vergeten'},
  {nl: 'acontecer', uit: 'gebeuren'}, {nl: 'chato', uit: 'vervelend, saai'}, {nl: 'legal', uit: 'leuk, tof'}, {nl: 'ficar', uit: 'blijven, worden'},
  {nl: 'demorar', uit: 'lang duren'}, {nl: 'ir embora', uit: 'weggaan'},
];

export const CHECKLIST: [string, string][] = [
  ['Aquecimento', 'Como foi sua semana? O que você fez ontem?'], ['Conversação', 'Conte sobre sua última viagem e seus planos para o fim de semana.'],
  ['Passado', 'Pratique: fui, tive, fiz, estive, quis, pude.'], ['Expressões', 'ainda, valer a pena, dar certo, ter saudade, ficar impressionado'],
  ['Perguntas', 'O que você faria se tivesse um mês livre?'], ['Correção', 'Peça à professora para corrigir suas frases; repita a versão correta.'],
  ['Tarefa', 'Grave um resumo de 60 segundos em português.'],
];
