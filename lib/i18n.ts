// Central interface translation. Keys are the Dutch source texts (gettext style); every key has one
// row with the five other languages in lib/i18n/messages.ts. The interface language is separate from
// the language a user learns or teaches. User content (notes, documents, chat) is never passed through t().
import {M} from './i18n/messages.ts';

export const LANGS = ['nl', 'en', 'pt', 'es', 'fr', 'de'] as const;
export type Lang = typeof LANGS[number];
export const NATIVE: Record<Lang, string> = {nl: 'Nederlands', en: 'English', pt: 'Português (Brasil)', es: 'Español', fr: 'Français', de: 'Deutsch'};
export const LOCALES: Record<Lang, string> = {nl: 'nl-NL', en: 'en-GB', pt: 'pt-BR', es: 'es-ES', fr: 'fr-FR', de: 'de-DE'};
/** Column order of the rows in messages.ts. */
export const ROW: Record<Exclude<Lang, 'nl'>, number> = {en: 0, pt: 1, es: 2, fr: 3, de: 4};
export const isLang = (x: unknown): x is Lang => typeof x === 'string' && (LANGS as readonly string[]).includes(x);

let current: Lang = 'nl';
export const getLang = () => current;
/** Set by LanguageProvider before its subtree renders (the subtree remounts on change). */
export function setCurrentLang(l: Lang) { current = l; }
export const locale = () => LOCALES[current];

/** A label table whose values are translated when read (safe for module-level constants). */
export function translated<T extends Record<string, string>>(table: T): T {
  return new Proxy(table, {get: (o, k) => { const v = Reflect.get(o, k); return typeof v === 'string' ? t(v) : v; }});
}

/** Translate a Dutch UI text; {0}, {1}… are replaced by args. Unknown texts are returned unchanged. */
export function t(nl: string, ...args: unknown[]): string {
  let s = nl;
  if (current !== 'nl') { const row = M[nl]; if (row && row[ROW[current]]) s = row[ROW[current]]; }
  return args.length ? s.replace(/\{(\d+)\}/g, (_, i) => String(args[+i] ?? '')) : s;
}
