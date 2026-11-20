// Collects every interface translation key used in the app source:
// literal first arguments of t()/tt()/tx()/T(), values of translated({...}) tables,
// language names L('xx','Name'), plus texts that are translated dynamically (DYNAMIC below).
import {createRequire} from 'node:module';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ts = createRequire(path.join(root, 'package.json'))('typescript');
const TFN = new Set(['t', 'tt', 'tx', 'T']);

/** Texts passed to t() through a variable (tab labels, field labels, server messages). */
export const DYNAMIC = [
  // components/StudentData.tsx tabs
  'Overzicht', 'Lessen', 'Lesanalyses', 'Samenvattingen', 'Woordenschat', 'Leerdoelen', 'Huiswerk', 'Oefenen', 'Bord & canvas', 'Opnames', 'Privé',
  // app/portugees tabs
  'Spreekvragen', 'Werkwoorden', 'Checklist', 'Oefenopname',
  // app/leerlingen FIELDS
  'Algemene notities en feedback', 'Wat wil deze leerling bereiken?', 'Zichtbaar voor de leerling', 'Algemeen huiswerk', 'Lesgeschiedenis (vrije tekst)', 'Oudere aantekeningen; nieuwe lessen worden automatisch per datum bewaard',
  // app/tools
  'AI-huiswerk', 'Flashcards', 'Quizzen', 'Toetsen', 'Voortgangsrapporten', 'Lesanalyse',
  // lib/data.ts
  'De database-update v27 is nog niet uitgevoerd. Voer supabase/v27.sql uit in de Supabase SQL Editor.',
  // server messages shown through t(error) (app/api/ai/*, lib/server/*)
  'Log eerst in', 'Ongeldige sessie, log opnieuw in', 'Supabase-configuratie ontbreekt', 'Onbekende fout',
  'De leerling heeft nog geen toestemming gegeven voor AI-analyse van deze opname.', 'Geef eerst zelf toestemming voor AI-analyse van deze opname.',
  'Alleen beheerders mogen testtranscripten importeren.', 'Kies een testleerling.', 'Het transcript is te lang (maximaal 400.000 tekens).', 'Kies een leerling aan wie jij lesgeeft.', 'Voer eerst supabase/v33.sql uit.',
  // v34: analysis 2.0 (route messages, stage labels and relevance labels in components/AnalysisV2.tsx)
  'Ongeldige analyse', 'Analyse niet gevonden', 'Voer eerst supabase/v34.sql uit.', 'Alleen de docent start een analyse',
  'Bronnen verzamelen en transcriberen', 'Transcript in delen analyseren', 'Fouten samenvoegen en tellen', 'Verslag en uitleg schrijven', 'Huiswerkconcept maken', 'Klaar',
  'Lesdoel van vandaag', 'Al behandeld', 'Vandaag uitgelegd', 'Relevant', 'Voor later', 'Leertraject',
  // v35: word list and classroom games (components/Games.tsx labels, route messages)
  'Woordenlijst', 'Flashcards', '30 Seconds', 'Taboe', 'Woorden uit de vorige les', 'Woorden uit de laatste vijf lessen', 'Alle woorden', 'Woorden die de leerling moeilijk vindt', 'Zelf kiezen',
  'Alleen de docent kan woorden van het canvas laten herkennen.', 'Alleen de docent start een spelronde.', 'Ongeldige spelronde', 'De leerling heeft nog geen account gekoppeld en kan daarom niet uitleggen.', 'Voer eerst supabase/v35.sql uit.', 'Deze ronde is al gestart.',
  // v43: countdown wording (lib/lessons.ts), grammar groups (lib/analysis/groups.ts), word classes (lib/vocab/grammar.ts)
  'Over {0} dag en {1} uur', 'Over {0} dagen en {1} uur', 'Over {0} dag', 'Over {0} dagen', 'Over 1 minuut', 'Over {0} minuten',
  'Woordvolgorde', 'Lidwoorden (de/het)', 'Meervoud', 'Bijvoeglijk naamwoord', 'Voorzetsels', 'Voornaamwoorden', 'Werkwoorden en tijden', 'Woordkeuze', 'Uitspraak', 'Spelling',
  'Ser en estar', 'Overeenstemming (concordância)', 'Geslacht en lidwoorden', 'Voorzetsels en samentrekkingen', 'Spelling en accenten', 'Overig',
  'Zelfstandige naamwoorden', 'Bijvoeglijke naamwoorden', 'Bijwoorden', 'Voegwoorden', 'Uitdrukkingen', 'Voorbeeldzinnen',
  // v44: workspace tabs (components/StudentData.tsx), homework kinds and statuses (app/huiswerk-client.tsx)
  'Mijn lessen', 'Voortgang', 'Leerpad', 'Meer', 'Privé', 'Grammatica', 'Woorden', 'Schrijven', 'Lezen', 'Concept', 'Klaar voor controle', 'Gepubliceerd', 'Ingeleverd', 'Feedback gegeven', 'Open', 'Te laat',
  // v46 phase 2: main error categories (lib/analysis/core.ts ERROR_TYPE_LABEL)
  'Grammatica', 'Werkwoordvervoegingen', 'Woordvolgorde en zinsbouw', 'Verkeerd woordgebruik', 'Ontbrekende woorden', 'Lidwoorden', 'Voorzetsels', 'Uitspraak', 'Overig',
  // v46 phase 3: daily practice question texts (lib/daily.ts, shown with t(q.sub))
  'Wat betekent dit?', 'Welk woord past?', 'Schrijf een korte zin met dit woord', 'Vul het ontbrekende woord in', 'Vul in zoals het goed is', 'Zeg de zin goed', 'Verbeter de zin', 'Welke zin is goed?',
  // v51: daily practice — production tasks (lib/daily.ts)
  'Schrijf een zin met dit woord in de verleden tijd', 'Beantwoord de vraag in een hele zin',
];

function sourceFiles() {
  const out = [];
  const walk = (d, rec) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) { if (rec && !/node_modules|\.next|[\\/]api$|server|[\\/]i18n$/.test(p)) walk(p, rec); } else if (/\.tsx?$/.test(f)) out.push(p); } };
  walk(path.join(root, 'app'), true); walk(path.join(root, 'components'), false); walk(path.join(root, 'lib'), false);
  return out;
}

export function collectKeys() {
  const keys = new Map();
  const add = (k, where) => { if (!keys.has(k)) keys.set(k, where); };
  for (const file of sourceFiles()) {
    const src = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const rel = path.relative(root, file);
    (function visit(n) {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const name = n.expression.text, a0 = n.arguments[0];
        if (TFN.has(name) && a0 && (ts.isStringLiteral(a0) || ts.isNoSubstitutionTemplateLiteral(a0))) add(a0.text, rel);
        if (name === 'translated' && a0) {
          let o = a0; while (ts.isAsExpression(o) || ts.isParenthesizedExpression(o)) o = o.expression;
          if (ts.isObjectLiteralExpression(o)) for (const p of o.properties) if (ts.isPropertyAssignment(p) && ts.isStringLiteral(p.initializer)) add(p.initializer.text, rel);
        }
        if (name === 'L' && n.arguments[1] && ts.isStringLiteral(n.arguments[1])) add(n.arguments[1].text, rel);
      }
      ts.forEachChild(n, visit);
    })(sf);
  }
  for (const k of DYNAMIC) add(k, 'DYNAMIC');
  return keys;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const keys = collectKeys();
  const {M} = await import('../../lib/i18n/messages.ts');
  const missing = [...keys.keys()].filter(k => !M[k]);
  if (process.argv.includes('--missing')) console.log(JSON.stringify(missing, null, 0));
  else console.log(`keys: ${keys.size}, missing: ${missing.length}`);
}
