'use client';
/* v66: teacher control before publication. The AI homework is shown per exercise block (title, instruction, example,
   questions with answer and correction model). The teacher edits single questions, adds or removes questions,
   removes a block or regenerates ONE block — the rest of the homework stays exactly as it is. */
import {useState} from 'react';
import {RefreshCw, Plus, Trash2} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {authedPost} from '../lib/learning';
import {t} from '../lib/i18n';
import type {ExerciseSet, ExerciseItem, ExerciseSection} from './Learning';

type Props = {set: ExerciseSet; studentId: string; onChange: (s: ExerciseSet) => void};

/** Remove block k and renumber the remaining blocks (the player finds a block's section by its index). */
export function dropBlock(set: ExerciseSet, k: number): ExerciseSet {
  const items = set.items.filter(it => it.block !== k).map(it => it.block != null && it.block > k ? {...it, block: it.block - 1} : it);
  return {...set, items, sections: (set.sections || []).filter((_, j) => j !== k), plan: set.plan?.filter((_, j) => j !== k).map((p, j) => ({...p, i: j}))};
}
/** Replace the items and section of block k by a newly generated version; other blocks are untouched. */
export function replaceBlock(set: ExerciseSet, k: number, section: ExerciseSection, fresh: ExerciseItem[]): ExerciseSet {
  const at = set.items.findIndex(it => it.block === k), rest = set.items.filter(it => it.block !== k);
  const after = rest.findIndex(it => (it.block ?? -1) > k);
  const pos = at >= 0 ? at : after < 0 ? rest.length : after; // items before block k are never block k, so `at` is unchanged in rest
  const items = [...rest.slice(0, pos), ...fresh.map(it => ({...it, block: k})), ...rest.slice(pos)];
  const sections = [...(set.sections || [])]; sections[k] = section;
  return {...set, items, sections};
}

export function HomeworkDraft({set, studentId, onChange}: Props) {
  const [busy, setBusy] = useState<number | null>(null), [err, setErr] = useState('');
  const secs = set.sections || [];
  const edit = (i: number, patch: Partial<ExerciseItem>) => onChange({...set, items: set.items.map((x, j) => j === i ? {...x, ...patch} : x)});
  const editSec = (k: number, patch: Partial<ExerciseSection>) => onChange({...set, sections: secs.map((s, j) => j === k ? {...s, ...patch} : s)});
  async function regen(k: number) {
    const spec = set.plan?.[k]; if (!spec || busy != null) return;
    setBusy(k); setErr('');
    try {
      const r = await authedPost<{section: ExerciseSection; items: ExerciseItem[]}>(supabase()!, '/api/ai/exercises', {studentId, action: 'block', block: spec, level: set.level, minutes: set.minutes, focus: set.focus});
      onChange(replaceBlock(set, k, r.section, r.items));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  }
  function add(k: number | null) {
    const like = set.items.filter(it => it.block === k).pop();
    const it: ExerciseItem = {type: like?.type || 'fill_in', prompt: '', passage: '', options: like?.type === 'multiple_choice' ? ['', ''] : [], answer: '', accept: [], explanation: '', block: k ?? undefined, topic: like?.topic ?? null, open: like?.open};
    const last = set.items.map(x => x.block).lastIndexOf(k ?? undefined);
    const items = [...set.items]; items.splice(last < 0 ? items.length : last + 1, 0, it); onChange({...set, items});
  }
  const groups: (number | null)[] = secs.length ? secs.map((_, k) => k) : [null];
  return <div className="hw-draft">
    {err && <p className="notice">{err}</p>}
    {groups.map(k => {
      const sec = k == null ? null : secs[k], rows = set.items.map((it, i) => ({it, i})).filter(x => k == null ? true : x.it.block === k);
      return <section key={k ?? 'all'} className="hw-draft-block">
        {sec && <header className="hw-draft-head">
          <input className="field hw-draft-title" value={sec.title} onChange={e => editSec(k!, {title: e.target.value})} aria-label={t('Titel van de oefening')}/>
          {sec.topic && <span className="pill muted small">{sec.topic}</span>}
          <span className="grow"/>
          {set.plan?.[k!] && <button type="button" className="button secondary small" disabled={busy != null} onClick={() => void regen(k!)}><RefreshCw size={14} className={busy === k ? 'spin' : ''}/> {busy === k ? t('Bezig…') : t('Opnieuw maken')}</button>}
          <button type="button" className="iconbtn danger" title={t('Oefening verwijderen')} onClick={() => onChange(dropBlock(set, k!))}><Trash2 size={15}/></button>
        </header>}
        {sec && <textarea className="field small" rows={2} value={sec.instruction} onChange={e => editSec(k!, {instruction: e.target.value})} aria-label={t('Instructie')}/>}
        {sec?.example && <p className="muted small hw-draft-ex">{t('Voorbeeld')}: {sec.example}</p>}
        {sec?.passage && <details className="hw-draft-passage"><summary>{t('Leestekst')}</summary><textarea className="field" rows={6} value={sec.passage} onChange={e => editSec(k!, {passage: e.target.value})}/></details>}
        {rows.map(({it, i}, n) => <div key={i} className="ex-item">
          <div className="ex-num">{n + 1}</div>
          <div className="grow">
            <textarea className="field" rows={2} value={it.prompt} placeholder={t('Vraag')} onChange={e => edit(i, {prompt: e.target.value})}/>
            {it.type === 'multiple_choice' && <input className="field small" value={it.options.join(' | ')} title={t('Opties, gescheiden door |')} onChange={e => edit(i, {options: e.target.value.split('|').map(x => x.trim())})}/>}
            <input className="field" value={it.answer} placeholder={t('Juist antwoord')} title={t('Juist antwoord')} onChange={e => edit(i, {answer: e.target.value})}/>
            <details className="hw-draft-model"><summary>{t('Correctiemodel')}</summary>
              <input className="field small" value={it.accept.join(' | ')} placeholder={t('Ook goed (gescheiden door |)')} onChange={e => edit(i, {accept: e.target.value.split('|').map(x => x.trim()).filter(Boolean)})}/>
              <textarea className="field small" rows={2} value={it.explanation} placeholder={t('Uitleg / regel')} onChange={e => edit(i, {explanation: e.target.value})}/>
            </details>
          </div>
          <button type="button" className="iconbtn danger" title={t('Verwijderen')} onClick={() => onChange({...set, items: set.items.filter((_, j) => j !== i)})}>{t('×')}</button>
        </div>)}
        <button type="button" className="textlink small" onClick={() => add(k)}><Plus size={13}/> {t('Vraag toevoegen')}</button>
      </section>;
    })}
  </div>;
}
