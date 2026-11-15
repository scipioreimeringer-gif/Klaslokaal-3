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
