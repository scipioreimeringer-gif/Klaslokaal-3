'use client';
// v67: explanation language of practice feedback — separate from the interface language and the learning language.
// Default English for learners of Dutch, otherwise the interface language; the student can change it (stored in this
// browser per learning language, no account setting or migration needed).
import {useEffect, useState} from 'react';
import {getLang, loadMessages, messagesLoaded, NATIVE, t, tIn, type Lang} from '../lib/i18n';
import {defaultExplainLang, EXPLAIN_LANGS, noteText, type ExplainLang} from '../lib/quiz';
import type {Note} from '../lib/grammar';

const keyOf = (learning: string) => 'teachy-explain-' + (String(learning || '').slice(0, 2) || 'x');
const ok = (v: string | null): v is ExplainLang => !!v && (EXPLAIN_LANGS as readonly string[]).includes(v);
/** v70: with a studentId the choice is remembered per student AND learning language; it starts from the
 *  learner's general choice for that language (practice), else the default. */
export function useExplainLang(learning: string, studentId?: string): [ExplainLang, (l: ExplainLang) => void] {
  const own = studentId ? keyOf(learning) + '-' + studentId : '';
  const [ex, setEx] = useState<ExplainLang>(() => {
    try { const a = own ? localStorage.getItem(own) : null; if (ok(a)) return a; const v = localStorage.getItem(keyOf(learning)); if (ok(v)) return v; } catch { /* no storage */ }
    return defaultExplainLang(learning, getLang());
  });
  const [, force] = useState(0);
  // the translation table is needed for any explanation language other than Dutch
  useEffect(() => { if (ex !== 'nl' && !messagesLoaded()) void loadMessages().then(() => force(x => x + 1)).catch(() => {}); }, [ex]);
  const set = (l: ExplainLang) => { setEx(l); try { localStorage.setItem(own || keyOf(learning), l); } catch { /* ignore */ } };
  return [ex, set];
}

export function ExplainLangSelect({value, onChange, label = 'Uitleg in'}: {value: ExplainLang; onChange: (l: ExplainLang) => void; label?: string}) {
  return <label className="pr-explain small muted">{t(label)}{' '}
    <select className="field small" value={value} onChange={e => onChange(e.target.value as ExplainLang)} aria-label={t(label)}>
      {EXPLAIN_LANGS.map(l => <option key={l} value={l}>{NATIVE[l as Lang]}</option>)}
    </select></label>;
}

/** Feedback notes in the chosen explanation language; notes that exist only in another language are left out. */
export function noteIn(n: Note, ex: string) { return noteText(n, ex, (l, k, a) => tIn(l, k, ...a)); }
export function NoteList({notes, ex, className}: {notes: Note[]; ex: string; className: string}) {
  const list = notes.map(n => noteIn(n, ex)).filter(Boolean);
  return list.length ? <ul className={className}>{list.map((s, k) => <li key={k}>{s}</li>)}</ul> : null;
}
