'use client';
// v61: simple payment administration — compact on the lesson card, fuller in the lesson details, a finance card on
// the teacher dashboard and a "Betalingen" page (tariffs, packages, filters). No payments are processed.
import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {Euro,Check,RotateCcw,Package,Wallet} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {t,locale} from '../lib/i18n';
import {useAuth} from './Auth';
import {loadStudents,type StudentRecord} from '../lib/data';
import {summary,fmtMoney,fmtPrice,PAY_LABEL,type BillLesson,type BillPackage,type PayStatus} from '../lib/billing';
import type {Lesson} from '../lib/lessons';

/** Tiny marker on the lesson card (only when a payment status is known). */
export function PayIcon({status}:{status?:PayStatus|null}){
 if(!status||status==='na')return null;
 return <span className={'pay-ico p-'+status} title={t(PAY_LABEL[status])} aria-label={t(PAY_LABEL[status])}><Euro size={11}/>{status==='paid'?<Check size={10}/>:status==='reported'?'?':''}</span>;
}

export function useBillingEnabled(){const {user,canTeach}=useAuth();const [on,setOn]=useState<boolean|null>(null);
 const load=useCallback(()=>{if(!user||!canTeach){setOn(false);return}void supabase()!.from('profiles').select('billing_enabled').eq('id',user.id).maybeSingle().then(({data,error})=>setOn(!error&&!!(data as {billing_enabled?:boolean}|null)?.billing_enabled))},[user?.id,canTeach]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{load()},[load]);return {on,reload:load}}

/** In the lesson details: teacher confirms / undoes / records lesson outcome; learner reports and sees packages. */
export function LessonPayment({lesson:l,mode,onChanged}:{lesson:Lesson;mode:'teacher'|'student';onChanged:()=>void}){
 const [msg,setMsg]=useState('');const [pk,setPk]=useState<BillPackage[]|null>(null);const [debited,setDebited]=useState<boolean|null>(null);
 useEffect(()=>{const db=supabase()!;void db.rpc('package_balance',{sid:l.student_id}).then(({data,error})=>setPk(error?[]:(data||[]) as BillPackage[]));
  void db.from('lesson_package_uses').select('lesson_id').eq('lesson_id',l.id).maybeSingle().then(({data,error})=>setDebited(error?null:!!data))},[l.id,l.student_id]);
 const run=async(fn:()=>PromiseLike<{error:{message:string}|null}>)=>{setMsg('');const {error}=await fn();if(error){setMsg(error.message);return}onChanged()};
 const db=supabase()!;const ended=Date.parse(l.ends_at)<=Date.now();const left=(pk||[]).reduce((n,p)=>n+Math.max(0,p.remaining),0);
 if(l.payment_status===undefined&&!(pk&&pk.length))return null;                 // v61.sql not run, nothing to show
 const st=l.payment_status||null;
 return <div className="ld-pay">
  <h4>{t('Betaling')}</h4>
  <p className="row small">{st?<span className={'pay-chip p-'+st}>{st==='reported'&&mode==='student'?t('Wacht op bevestiging'):t(PAY_LABEL[st])}</span>:<span className="muted">{t('Onbekend')}</span>}{fmtPrice(l.price_cents,l.currency,locale())&&<span className="muted">{fmtPrice(l.price_cents,l.currency,locale())}</span>}
   {pk&&pk.length>0&&<span className="muted"><Package size={13}/> {t('{0} lessen over in het pakket',left)}{debited?' · '+t('deze les is afgeschreven'):''}</span>}</p>
  {mode==='teacher'?<div className="row">
   {st!=='paid'&&<button className="button small" onClick={()=>void run(()=>db.rpc('set_payment',{p_lesson:l.id,p_status:'paid'}))}><Check size={14}/> {st==='reported'?t('Ontvangst bevestigen'):t('Betaald')}</button>}
   {st==='paid'&&<button className="button small secondary" onClick={()=>void run(()=>db.rpc('set_payment',{p_lesson:l.id,p_status:'open'}))}><RotateCcw size={14}/> {t('Terugdraaien')}</button>}
   {st!=='na'&&<button className="button small secondary" onClick={()=>void run(()=>db.rpc('set_payment',{p_lesson:l.id,p_status:'na'}))}>{t('Niet van toepassing')}</button>}
   {ended&&l.status==='scheduled'&&<button className="button small secondary" onClick={()=>void run(()=>db.from('lessons').update({status:'completed'}).eq('id',l.id))}>{t('Afgerond')}</button>}
   {l.status==='completed'&&<button className="button small secondary" onClick={()=>void run(()=>db.from('lessons').update({status:'scheduled'}).eq('id',l.id))}>{t('Niet afgerond')}</button>}
   {st!=='paid'&&pk&&left>0&&<button className="button small secondary" onClick={()=>void run(()=>db.rpc('use_credit',{p_lesson:l.id}))}><Package size={14}/> {t('Betalen met tegoed')}</button>}
   {ended&&(l.status==='scheduled'||l.status==='completed')&&<select className="field inline" value="" aria-label={t('Afwezigheid')} onChange={e=>{const v=e.target.value;if(v)void run(()=>db.from('lessons').update({status:v}).eq('id',l.id))}}><option value="">{t('Afwezigheid…')}</option><option value="no_show_student">{t('Leerling niet verschenen')}</option><option value="no_show_teacher">{t('Docent niet verschenen')}</option></select>}
   {pk&&pk.length>0&&l.status!=='completed'&&l.status!=='scheduled'&&debited===false&&<button className="button small secondary" onClick={()=>void run(()=>db.rpc('package_debit',{p_lesson:l.id,p_on:true}))}><Package size={14}/> {t('Toch afschrijven van pakket')}</button>}
   {debited&&<button className="button small secondary" onClick={()=>void run(()=>db.rpc('package_debit',{p_lesson:l.id,p_on:false}))}>{t('Afschrijving terugdraaien')}</button>}
  </div>:st==='open'&&<button className="button small" onClick={()=>void run(()=>db.rpc('report_payment',{p_lesson:l.id}))}><Wallet size={14}/> {t('Ik heb betaald')}</button>}
  {mode==='student'&&st==='reported'&&<p className="muted small">{t('Je docent bevestigt de ontvangst.')}</p>}
  {msg&&<p className="notice small">{msg}</p>}
 </div>
}

type Rec={id:string;student_id:string;paid_on:string;amount_cents:number|null;currency:string|null;note:string|null;credit_lessons:number;voided_at:string|null};
type Data={lessons:(BillLesson&{student_id:string})[];packages:(BillPackage&{student_id:string})[];students:StudentRecord[];records:Rec[]};
async function loadData(uid:string):Promise<Data>{const db=supabase()!;const students=(await loadStudents(db,{teacherId:uid})).data;
 const since=new Date(Date.now()-400*86400e3).toISOString();
 const lessons=await db.from('lessons').select('*').eq('teacher_id',uid).gte('starts_at',since).order('starts_at',{ascending:false}).then(r=>(r.data||[]) as Data['lessons']);
 const packages=(await Promise.all(students.map(s=>db.rpc('package_balance',{sid:s.id}).then(r=>((r.data||[]) as BillPackage[]).map(p=>({...p,student_id:s.id})))))).flat();
 const records=await db.from('payment_records').select('id,student_id,paid_on,amount_cents,currency,note,credit_lessons,voided_at').order('paid_on',{ascending:false}).limit(300).then(r=>(r.error?[]:r.data||[]) as Rec[]);
 return {lessons,packages,students,records}}

/** Teacher dashboard: compact finance card (only when billing is on). */
export function FinanceCard(){const {user}=useAuth();const {on}=useBillingEnabled();const [d,setD]=useState<Data|null>(null);
 useEffect(()=>{if(on&&user)void loadData(user.id).then(setD)},[on,user?.id]);// eslint-disable-line react-hooks/exhaustive-deps
 if(!on||!d)return null;const month=new Date().toISOString().slice(0,7);const s=summary(d.lessons,d.packages,month);const loc=locale();
 return <section className="card finance-card"><div className="row between"><h3><Wallet size={16}/> {t('Betalingen deze maand')}</h3><Link className="textlink" href="/betalingen">{t('Alles bekijken')} →</Link></div>
  <dl className="fin-grid"><div><dt>{t('Ontvangen')}</dt><dd>{fmtMoney(s.received,loc)}</dd></div><div><dt>{t('Openstaand')}</dt><dd>{fmtMoney(s.outstanding,loc)}</dd></div>
   <div><dt>{t('Gegeven lessen')}</dt><dd>{s.lessonsGiven} <small className="muted">({t('waarde')} {fmtMoney(s.givenValue,loc)})</small></dd></div><div><dt>{t('Vooruitbetaald')}</dt><dd>{t('{0} lessen',s.prepaidLeft)}</dd></div></dl></section>}

/** "Betalingen" page: switch on/off, tariffs per student, packages, overview per student and month. */
export function PaymentsPage(){
 const {user}=useAuth();const {on,reload}=useBillingEnabled();const [d,setD]=useState<Data|null>(null);const [msg,setMsg]=useState('');
 const [sid,setSid]=useState('');const [month,setMonth]=useState(()=>new Date().toISOString().slice(0,7));const [tariffs,setTariffs]=useState<Record<string,{price:string;currency:string;minutes:string;method:string;mode:string}>>({});
 const load=useCallback(async()=>{if(!user)return;const x=await loadData(user.id);setD(x);
  const {data}=await supabase()!.from('student_billing').select('*');const m:typeof tariffs={};for(const s of x.students)m[s.id]={price:'',currency:'EUR',minutes:'',method:'',mode:'lesson'};
  for(const b of (data||[]) as {student_id:string;price_cents:number|null;currency:string;default_minutes:number|null;method:string|null;mode:string}[])m[b.student_id]={price:b.price_cents==null?'':String(b.price_cents/100),currency:b.currency,minutes:b.default_minutes?String(b.default_minutes):'',method:b.method||'',mode:b.mode};setTariffs(m)},[user?.id]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(on)void load()},[on,load]);
 async function toggle(v:boolean){const {error}=await supabase()!.rpc('set_billing_enabled',{p_on:v});if(error){setMsg(/set_billing_enabled/.test(error.message)?t('Voer eerst supabase/v61.sql uit.'):error.message);return}reload()}
 async function saveTariff(id:string){const x=tariffs[id];const cents=x.price.trim()?Math.round(parseFloat(x.price.replace(',','.'))*100):null;
  const {error}=await supabase()!.from('student_billing').upsert({student_id:id,price_cents:Number.isFinite(cents as number)?cents:null,currency:(x.currency||'EUR').toUpperCase().slice(0,3),default_minutes:x.minutes?+x.minutes:null,method:x.method||null,mode:x.mode,updated_at:new Date().toISOString()},{onConflict:'student_id'});
  setMsg(error?error.message:t('Opgeslagen ✓'))}
 async function addPackage(id:string){const n=prompt(t('Hoeveel lessen zitten er in het pakket?'),'4');if(!n||!(+n>0))return;const price=prompt(t('Prijs van het pakket (leeg = onbekend)'),'')||'';
  const cur=tariffs[id]?.currency||'EUR';const paid=confirm(t('Is het pakket al betaald?'));
  const {error}=await supabase()!.from('lesson_packages').insert({student_id:id,lessons_total:Math.min(200,Math.round(+n)),price_cents:price.trim()?Math.round(parseFloat(price.replace(',','.'))*100):null,currency:cur,paid_at:paid?new Date().toISOString():null,confirmed_by:paid?user?.id:null});
  if(error){setMsg(error.message);return}await load()}
 async function setPaid(id:string){const {error}=await supabase()!.rpc('set_payment',{p_lesson:id,p_status:'paid'});if(error)setMsg(error.message);await load()}
 const rows=useMemo(()=>(d?.lessons||[]).filter(l=>l.payment_status&&(!sid||l.student_id===sid)&&l.starts_at.slice(0,7)===month),[d,sid,month]);
 const [regOpen,setRegOpen]=useState(false);
 async function voidRec(id:string){if(!confirm(t('Deze registratie corrigeren? De lessen worden weer openstaand en het tegoed vervalt. De registratie blijft zichtbaar als gecorrigeerd.')))return;const {error}=await supabase()!.rpc('void_payment',{p_record:id});if(error)setMsg(error.message);await load()}
 const s=d?summary(d.lessons.filter(l=>!sid||l.student_id===sid),d.packages.filter(p=>!sid||p.student_id===sid),month):null;const loc=locale();
 const name=(id:string)=>d?.students.find(x=>x.id===id)?.name||'';
 return <>
  <div className="page-head"><div><p className="eyebrow-dark">{t('DOCENT')}</p><h1>{t('Betalingen')}</h1><p className="muted">{t('Eenvoudige administratie: er worden geen betalingen verwerkt of facturen verstuurd.')}</p></div>
   {on!==null&&<label className="row small"><input type="checkbox" checked={!!on} onChange={e=>void toggle(e.target.checked)}/> {t('Betalingsadministratie gebruiken')}</label>}</div>
  {msg&&<p className="notice" role="status">{msg}</p>}
  {on===false&&<p className="muted">{t('Uitgeschakeld. Zet het aan om tarieven, betalingen en lespakketten bij te houden. Bestaande lessen krijgen geen betaalstatus.')}</p>}
  {on&&!d&&<div className="loader small"/>}
  {on&&d&&s&&<>
   <div className="row"><button className="button" onClick={()=>setRegOpen(true)}><Wallet size={15}/> {t('Betaling registreren')}</button><select className="field inline" value={sid} onChange={e=>setSid(e.target.value)}><option value="">{t('Alle leerlingen')}</option>{d.students.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
    <input className="field inline" type="month" value={month} onChange={e=>setMonth(e.target.value)}/></div>
   <dl className="fin-grid card"><div><dt>{t('Ontvangen')}</dt><dd>{fmtMoney(s.received,loc)}</dd></div><div><dt>{t('Openstaand')}</dt><dd>{fmtMoney(s.outstanding,loc)}</dd></div>
    <div><dt>{t('Gegeven lessen')}</dt><dd>{s.lessonsGiven} <small className="muted">({t('waarde')} {fmtMoney(s.givenValue,loc)})</small></dd></div><div><dt>{t('Vooruitbetaald')}</dt><dd>{t('{0} lessen',s.prepaidLeft)}</dd></div></dl>
   <section className="card"><h3>{t('Lessen')}</h3>{rows.length?<table className="pay-table"><tbody>{rows.map(l=><tr key={l.id}><td>{new Date(l.starts_at).toLocaleDateString(loc,{day:'numeric',month:'short'})}</td><td>{name(l.student_id)}</td><td>{fmtPrice(l.price_cents,l.currency,loc)}</td>
    <td><span className={'pay-chip p-'+l.payment_status}>{t(PAY_LABEL[l.payment_status as PayStatus])}</span></td><td>{(l.payment_status==='open'||l.payment_status==='reported')&&<button className="button small secondary" onClick={()=>void setPaid(l.id)}><Check size={13}/> {t('Betaald')}</button>}</td></tr>)}</tbody></table>:<p className="muted small">{t('Geen lessen met een betaalstatus in deze maand.')}</p>}</section>
   {regOpen&&<RegisterPayment data={d} initial={sid} onClose={()=>setRegOpen(false)} onSaved={()=>{setRegOpen(false);void load()}}/>}
   <section className="card"><h3>{t('Per leerling')}</h3><table className="pay-table"><thead><tr><th>{t('Leerling')}</th><th>{t('Betaald')}</th><th>{t('Onbetaald')}</th><th>{t('Afgerond')}</th><th>{t('Vooruit betaald')}</th><th>{t('Tegoed')}</th></tr></thead><tbody>{d.students.filter(x=>!sid||x.id===sid).map(x=>{const ls=d.lessons.filter(l=>l.student_id===x.id&&l.status!=='cancelled'),now=Date.now();
    return <tr key={x.id}><td>{x.name}</td><td>{ls.filter(l=>l.payment_status==='paid').length}</td><td>{ls.filter(l=>(l.payment_status==='open'||l.payment_status==='reported')&&Date.parse(l.starts_at)<=now).length}</td><td>{ls.filter(l=>l.status==='completed').length}</td><td>{ls.filter(l=>l.payment_status==='paid'&&Date.parse(l.starts_at)>now).length}</td><td>{d.packages.filter(p=>p.student_id===x.id).reduce((n,p)=>n+Math.max(0,p.remaining),0)}</td></tr>})}</tbody></table></section>
   <section className="card"><h3>{t('Geregistreerde betalingen')}</h3>{d.records.filter(r=>!sid||r.student_id===sid).length?<table className="pay-table"><tbody>{d.records.filter(r=>!sid||r.student_id===sid).map(r=><tr key={r.id} className={r.voided_at?'muted':''}><td>{new Date(r.paid_on).toLocaleDateString(loc,{day:'numeric',month:'short',year:'numeric'})}</td><td>{name(r.student_id)}</td><td>{r.amount_cents!=null&&r.currency?fmtPrice(r.amount_cents,r.currency,loc):'—'}</td><td>{t('{0} lessen',d.lessons.filter(l=>(l as {payment_record_id?:string}).payment_record_id===r.id).length)}{r.credit_lessons?' · '+t('tegoed {0}',r.credit_lessons):''}</td><td className="muted small">{r.note||''}</td><td>{r.voided_at?<span className="muted small">{t('gecorrigeerd')}</span>:<button className="button small secondary" onClick={()=>void voidRec(r.id)}>{t('Corrigeren')}</button>}</td></tr>)}</tbody></table>:<p className="muted small">{t('Nog geen betalingen geregistreerd.')}</p>}</section>
   <details className="card"><summary><strong>{t('Tarieven en lespakketten')}</strong></summary>
    {d.students.filter(x=>!sid||x.id===sid).map(x=>{const tr=tariffs[x.id];if(!tr)return null;const up=(k:keyof typeof tr,v:string)=>setTariffs(m=>({...m,[x.id]:{...m[x.id],[k]:v}}));const pks=d.packages.filter(p=>p.student_id===x.id);
     return <div key={x.id} className="tariff-row"><strong>{x.name}</strong>
      <input className="field inline" inputMode="decimal" placeholder={t('Prijs')} value={tr.price} onChange={e=>up('price',e.target.value)} aria-label={t('Prijs per les')}/>
      <input className="field inline" maxLength={3} value={tr.currency} onChange={e=>up('currency',e.target.value.toUpperCase())} aria-label={t('Valuta')} style={{width:60}}/>
      <input className="field inline" type="number" placeholder={t('min')} value={tr.minutes} onChange={e=>up('minutes',e.target.value)} aria-label={t('Standaard lesduur')} style={{width:70}}/>
      <input className="field inline" placeholder={t('Betaalmethode')} value={tr.method} onChange={e=>up('method',e.target.value)}/>
      <select className="field inline" value={tr.mode} onChange={e=>up('mode',e.target.value)} aria-label={t('Betaling per')}><option value="lesson">{t('Per les')}</option><option value="package">{t('Pakket')}</option><option value="month">{t('Per maand')}</option></select>
      <button className="button small secondary" onClick={()=>void saveTariff(x.id)}>{t('Opslaan')}</button>
      <button className="button small secondary" onClick={()=>void addPackage(x.id)}><Package size={13}/> {t('Pakket registreren')}</button>
      {pks.length>0&&<span className="muted small">{pks.map(p=>t('{0} van {1} over',p.remaining,p.lessons_total)+(p.paid_at?'':' · '+t('nog niet betaald'))).join(' · ')}</span>}</div>})}
   </details></>}
 </>
}

/** v63: one registration for several lessons (past or future), optional amount, date, note and/or a credit in lessons. */
function RegisterPayment({data,initial,onClose,onSaved}:{data:Data;initial:string;onClose:()=>void;onSaved:()=>void}){
 const [sid,setSid]=useState(initial||data.students[0]?.id||'');const [sel,setSel]=useState<Set<string>>(new Set());const [amount,setAmount]=useState('');const [cur,setCur]=useState('EUR');
 const [day,setDay]=useState(()=>new Date().toISOString().slice(0,10));const [note,setNote]=useState('');const [credit,setCredit]=useState('');const [msg,setMsg]=useState('');const [saving,setSaving]=useState(false);
 const loc=locale();const open=data.lessons.filter(l=>l.student_id===sid&&l.status!=='cancelled'&&l.payment_status!=='paid').sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
 async function save(){const cents=amount.trim()?Math.round(parseFloat(amount.replace(',','.'))*100):null;setSaving(true);setMsg('');
  const {error}=await supabase()!.rpc('record_payment',{p_student:sid,p_lessons:[...sel],p_amount_cents:Number.isFinite(cents as number)?cents:null,p_currency:cur.toUpperCase().slice(0,3)||'EUR',p_paid_on:day,p_note:note||null,p_credit:Math.max(0,Math.min(200,parseInt(credit)||0))});
  setSaving(false);if(error){setMsg(/Already paid/.test(error.message)?t('Deze lessen zijn al betaald.'):/Nothing/.test(error.message)?t('Kies lessen of vul een tegoed in.'):/record_payment/.test(error.message)?t('Voer eerst supabase/v63.sql uit.'):error.message);return}onSaved()}
 return <div className="modal-scrim" onClick={onClose}><div className="modal card lesson-form" role="dialog" aria-modal="true" aria-label={t('Betaling registreren')} onClick={e=>e.stopPropagation()}>
  <h3>{t('Betaling registreren')}</h3>
  <label className="stack"><span className="label">{t('Leerling')}</span><select className="field" value={sid} onChange={e=>{setSid(e.target.value);setSel(new Set())}}>{data.students.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
  <div className="stack"><span className="label">{t('Lessen')}</span>{open.length?<div className="pay-pick">{open.map(l=><label key={l.id} className="row small"><input type="checkbox" checked={sel.has(l.id)} onChange={e=>{const n=new Set(sel);if(e.target.checked)n.add(l.id);else n.delete(l.id);setSel(n)}}/> {new Date(l.starts_at).toLocaleDateString(loc,{weekday:'short',day:'numeric',month:'short'})}{Date.parse(l.starts_at)>Date.now()?' · '+t('toekomstig'):''}{l.status==='completed'?' · '+t('afgerond'):''}{l.payment_status==='reported'?' · '+t('gemeld door leerling'):''}</label>)}</div>:<p className="muted small">{t('Geen onbetaalde lessen.')}</p>}</div>
  <div className="grid2"><label className="stack"><span className="label">{t('Bedrag (optioneel)')}</span><input className="field" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
   <label className="stack"><span className="label">{t('Valuta')}</span><input className="field" maxLength={3} value={cur} onChange={e=>setCur(e.target.value.toUpperCase())}/></label>
   <label className="stack"><span className="label">{t('Betaaldatum')}</span><input className="field" type="date" value={day} onChange={e=>setDay(e.target.value)}/></label>
   <label className="stack"><span className="label">{t('Tegoed in lessen (optioneel)')}</span><input className="field" type="number" min={0} max={200} value={credit} onChange={e=>setCredit(e.target.value)} placeholder={t('voor lessen die nog niet gepland zijn')}/></label></div>
  <label className="stack"><span className="label">{t('Notitie (optioneel)')}</span><input className="field" maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
  {msg&&<p className="notice" role="alert">{msg}</p>}
  <div className="row"><button className="button" disabled={saving||(!sel.size&&!(parseInt(credit)>0))} onClick={()=>void save()}>{saving?t('Opslaan…'):t('Registreren')}</button><button className="button secondary" onClick={onClose}>{t('Annuleren')}</button></div>
 </div></div>
}

/** v63: the learner's own payments (only own data): open / waiting for confirmation / paid, credit, history. */
export function StudentPayments(){const {user,studentLinks}=useAuth();const [d,setD]=useState<{lessons:BillLesson[];credit:number;hist:{id:string;paid_on:string;amount_cents:number|null;currency:string|null;lessons:number;credit_lessons:number;voided:boolean}[]}|null>(null);const [msg,setMsg]=useState('');
 const load=useCallback(async()=>{if(!user||!studentLinks.length)return;const db=supabase()!;const ids=studentLinks.map(s=>s.id);
  const l=await db.from('lessons').select('*').in('student_id',ids).not('payment_status','is',null).order('starts_at',{ascending:false}).limit(60);if(l.error){setD(null);return}
  const credit=(await Promise.all(ids.map(id=>db.rpc('package_balance',{sid:id}).then(r=>((r.data||[]) as {remaining:number}[]).reduce((n,p)=>n+Math.max(0,p.remaining),0))))).reduce((a,b)=>a+b,0);
  const hist=(await Promise.all(ids.map(id=>db.rpc('my_payment_history',{sid:id}).then(r=>(r.error?[]:r.data||[]) as NonNullable<typeof d>['hist'])))).flat();
  setD({lessons:(l.data||[]) as BillLesson[],credit,hist})},[user?.id,studentLinks.length]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{void load()},[load]);
 if(!d||(!d.lessons.length&&!d.credit&&!d.hist.length))return null;const loc=locale();const now=Date.now();
 const due=d.lessons.filter(l=>l.payment_status==='open'&&Date.parse(l.starts_at)<=now);
 async function report(id:string){const {error}=await supabase()!.rpc('report_payment',{p_lesson:id});setMsg(error?error.message:t('Gemeld. Je docent bevestigt de ontvangst.'));await load()}
 return <section className="card my-pay"><h3><Wallet size={16}/> {t('Mijn betalingen')}</h3>
  {due.length>0&&<p className="pay-notice">{t('{0} les(sen) nog niet betaald.',due.length)}</p>}
  {msg&&<p className="muted small" role="status">{msg}</p>}
  {d.credit>0&&<p className="small"><Package size={14}/> {t('Vooruitbetaald tegoed: {0} lessen',d.credit)}</p>}
  <table className="pay-table"><tbody>{d.lessons.slice(0,12).map(l=><tr key={l.id}><td>{new Date(l.starts_at).toLocaleDateString(loc,{day:'numeric',month:'short'})}</td><td>{fmtPrice(l.price_cents,l.currency,loc)}</td>
   <td><span className={'pay-chip p-'+l.payment_status}>{l.payment_status==='reported'?t('Wacht op bevestiging'):t(PAY_LABEL[l.payment_status as PayStatus])}</span></td>
   <td>{l.payment_status==='open'&&<button className="button small secondary" onClick={()=>void report(l.id)}>{t('Ik heb betaald')}</button>}</td></tr>)}</tbody></table>
  {d.hist.length>0&&<details><summary className="small">{t('Betalingsgeschiedenis')}</summary><ul className="mem-list">{d.hist.map(h=><li key={h.id} className={h.voided?'muted':''}>{new Date(h.paid_on).toLocaleDateString(loc,{day:'numeric',month:'short',year:'numeric'})} · {h.amount_cents!=null&&h.currency?fmtPrice(h.amount_cents,h.currency,loc)+' · ':''}{t('{0} lessen',h.lessons)}{h.credit_lessons?' · '+t('tegoed {0}',h.credit_lessons):''}{h.voided?' · '+t('gecorrigeerd'):''}</li>)}</ul></details>}
 </section>}
