'use client';
// v46 phase 2: "Fouten en verbeteringen" — every registered error of a lesson, grouped per main category with details on
// request. Student: only errors the teacher did not remove (and never "for later" material). Teacher: approve, correct
// or remove each error; only approved errors are used for practice. Nothing here calls AI.
import {useState} from 'react';
import {Check,Pencil,Trash2,RotateCcw,AlertTriangle,Repeat2,Clock3} from 'lucide-react';
import {t as tt} from '../lib/i18n';
import {ERROR_TYPES,ERROR_TYPE_LABEL,errorsOf,groupErrors,type ErrorItem,type ErrorType} from '../lib/analysis/core';
import type {AnalysisV2} from '../lib/analysis/pipeline';

const clock = (s: number | null) => s == null ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** What the student may see. */
export const visibleErrors = (doc: AnalysisV2) => errorsOf(doc).filter(e => e.status !== 'rejected' && !e.later);
/** Honest note when the source is incomplete (speakers not separated, little speech, poor quality). */
export function sourceNote(doc: AnalysisV2): string | null {
  if (!doc.speakers_separated) return tt('Docent en leerling waren in deze opname niet apart te horen: fouten zijn als onzeker gemarkeerd en aantallen zijn een schatting.');
  if (doc.source_quality === 'poor' || doc.source_quality === 'partial') return doc.quality_note || tt('De opname was onvolledig; niet alle fouten zijn mogelijk gevonden.');
  return null;
}

function Row({e, teacher, onChange}: {e: ErrorItem; teacher: boolean; onChange?: (e: ErrorItem) => void}) {
  const [edit, setEdit] = useState(false); const [d, setD] = useState(e);
  const rejected = e.status === 'rejected';
  return <li className={'er-row st-' + e.status}>
    <div className="er-pair"><s className="er-wrong">{e.original}</s><span aria-hidden>→</span><b className="er-right">{e.corrected}</b></div>
    {e.why && !edit && <p className="er-why">{e.why}</p>}
    <div className="er-meta">
      {e.start != null && <span title={tt('Tijd in de opname')}><Clock3 size={12} aria-hidden/> {clock(e.start)}</span>}
      {e.repeats > 1 && <span className="tag recurring"><Repeat2 size={12} aria-hidden/> {tt('{0}× in deze les', e.repeats)}</span>}
      {e.certainty === 'uncertain' && <span className="tag uncertain">{tt('onzeker')}</span>}
      {e.kind === 'slip' && <span className="tag">{tt('verspreking')}</span>}
      {teacher && e.later && <span className="tag">{tt('voor later')}</span>}
      {teacher && <span className={'er-status s-' + e.status}>{e.status === 'approved' ? tt('Goedgekeurd') : rejected ? tt('Verwijderd') : tt('Te controleren')}</span>}
    </div>
    {teacher && onChange && (edit ? <div className="er-edit">
      <label className="stack"><span className="label">{tt('Juiste formulering')}</span><input className="field" value={d.corrected} onChange={x => setD({...d, corrected: x.target.value})}/></label>
      <label className="stack"><span className="label">{tt('Uitleg')}</span><input className="field" value={d.why} onChange={x => setD({...d, why: x.target.value.slice(0, 200)})}/></label>
      <label className="stack"><span className="label">{tt('Soort fout')}</span><select className="field" value={d.type} onChange={x => setD({...d, type: x.target.value as ErrorType})}>{ERROR_TYPES.map(t => <option key={t} value={t}>{tt(ERROR_TYPE_LABEL[t])}</option>)}</select></label>
      <div className="row"><button type="button" className="button small" onClick={() => { onChange({...d, corrected: d.corrected.trim() || e.corrected, status: 'approved', edited: true}); setEdit(false); }}><Check size={13}/> {tt('Opslaan en goedkeuren')}</button>
        <button type="button" className="button small secondary" onClick={() => { setD(e); setEdit(false); }}>{tt('Annuleren')}</button></div>
    </div> : <div className="er-actions">
      {rejected ? <button type="button" className="linklike" onClick={() => onChange({...e, status: 'pending'})}><RotateCcw size={13}/> {tt('Herstellen')}</button> : <>
        {e.status !== 'approved' && <button type="button" className="iconbtn" title={tt('Goedkeuren')} aria-label={tt('Goedkeuren')} onClick={() => onChange({...e, status: 'approved'})}><Check size={15}/></button>}
        <button type="button" className="iconbtn" title={tt('Corrigeren')} aria-label={tt('Corrigeren')} onClick={() => { setD(e); setEdit(true); }}><Pencil size={14}/></button>
        <button type="button" className="iconbtn danger" title={tt('Verwijderen: geen echte fout')} aria-label={tt('Verwijderen')} onClick={() => onChange({...e, status: 'rejected'})}><Trash2 size={14}/></button></>}
    </div>)}
  </li>;
}

export function ErrorList({doc, teacher = false, onChange}: {doc: AnalysisV2; teacher?: boolean; onChange?: (errors: ErrorItem[]) => void}) {
  const all = errorsOf(doc), list = teacher ? all : visibleErrors(doc), groups = groupErrors(list), note = sourceNote(doc);
  const pending = all.filter(e => e.status === 'pending').length;
  const set = (e: ErrorItem) => onChange?.(all.map(x => x.id === e.id ? e : x));
  return <div className="er-list">
    {note && <p className="er-note"><AlertTriangle size={14} aria-hidden/> {note}</p>}
    {teacher && onChange && pending > 0 && <div className="row between er-bulk"><small className="muted">{tt('{0} fouten wachten op jouw controle. Alleen goedgekeurde fouten worden gebruikt voor oefeningen.', pending)}</small>
      <button type="button" className="button small" onClick={() => onChange(all.map(e => e.status === 'pending' ? {...e, status: 'approved'} : e))}><Check size={13}/> {tt('Alle open fouten goedkeuren')}</button></div>}
    {!groups.length ? <p className="muted">{tt('Geen belangrijke fouten in de stof van deze les. Goed gedaan!')}</p>
      : groups.map((g, i) => <details key={g.type} className="er-group" open={i === 0 || teacher}><summary><b>{tt(g.label)}</b><span className="lr-count">{tt('{0}×', g.items.length)}</span></summary>
        <ul>{g.items.map(e => <Row key={e.id + e.status} e={e} teacher={teacher} onChange={teacher && onChange ? set : undefined}/>)}</ul></details>)}
  </div>;
}
