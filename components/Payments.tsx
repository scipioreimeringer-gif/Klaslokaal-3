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
  <p className="row small">{st?<span className={'pay-chip p-'+st}>{t(PAY_LABEL[st])}</span>:<span className="muted">{t('Onbekend')}</span>}{fmtPrice(l.price_cents,l.currency,locale())&&<span className="muted">{fmtPrice(l.price_cents,l.currency,locale())}</span>}
   {pk&&pk.length>0&&<span className="muted"><Package size={13}/> {t('{0} lessen over in het pakket',left)}{debited?' · '+t('deze les is afgeschreven'):''}</span>}</p>
  {mode==='teacher'?<div className="row">
   {st!=='paid'&&<button className="button small" onClick={()=>void run(()=>db.rpc('set_payment',{p_lesson:l.id,p_status:'paid'}))}><Check size={14}/> {st==='reported'?t('Ontvangst bevestigen'):t('Betaald')}</button>}
   {st==='paid'&&<button className="button small secondary" onClick={()=>void run(()=>db.rpc('set_payment',{p_lesson:l.id,p_status:'open'}))}><RotateCcw size={14}/> {t('Terugdraaien')}</button>}
   {st!=='na'&&<button className="button small secondary" onClick={()=>void run(()=>db.rpc('set_payment',{p_lesson:l.id,p_status:'na'}))}>{t('Niet van toepassing')}</button>}
   {ended&&l.status==='scheduled'&&<button className="button small secondary" onClick={()=>void run(()=>db.from('lessons').update({status:'completed'}).eq('id',l.id))}>{t('Afgerond')}</button>}
   {ended&&(l.status==='scheduled'||l.status==='completed')&&<select className="field inline" value="" aria-label={t('Afwezigheid')} onChange={e=>{const v=e.target.value;if(v)void run(()=>db.from('lessons').update({status:v}).eq('id',l.id))}}><option value="">{t('Afwezigheid…')}</option><option value="no_show_student">{t('Leerling niet verschenen')}</option><option value="no_show_teacher">{t('Docent niet verschenen')}</option></select>}
   {pk&&pk.length>0&&l.status!=='completed'&&l.status!=='scheduled'&&debited===false&&<button className="button small secondary" onClick={()=>void run(()=>db.rpc('package_debit',{p_lesson:l.id,p_on:true}))}><Package size={14}/> {t('Toch afschrijven van pakket')}</button>}
   {debited&&<button className="button small secondary" onClick={()=>void run(()=>db.rpc('package_debit',{p_lesson:l.id,p_on:false}))}>{t('Afschrijving terugdraaien')}</button>}
  </div>:st==='open'&&<button className="button small" onClick={()=>void run(()=>db.rpc('report_payment',{p_lesson:l.id}))}><Wallet size={14}/> {t('Ik heb betaald')}</button>}
  {mode==='student'&&st==='reported'&&<p className="muted small">{t('Je docent bevestigt de ontvangst.')}</p>}
  {msg&&<p className="notice small">{msg}</p>}
 </div>
}

type Data={lessons:(BillLesson&{student_id:string})[];packages:(BillPackage&{student_id:string})[];students:StudentRecord[]};
async function loadData(uid:string):Promise<Data>{const db=supabase()!;const students=(await loadStudents(db,{teacherId:uid})).data;
 const since=new Date(Date.now()-400*86400e3).toISOString();
 const lessons=await db.from('lessons').select('id,student_id,starts_at,ends_at,status,payment_status,price_cents,currency,payment_confirmed_at').eq('teacher_id',uid).gte('starts_at',since).not('payment_status','is',null).order('starts_at',{ascending:false}).then(r=>(r.data||[]) as Data['lessons']);
 const packages=(await Promise.all(students.map(s=>db.rpc('package_balance',{sid:s.id}).then(r=>((r.data||[]) as BillPackage[]).map(p=>({...p,student_id:s.id})))))).flat();
 return {lessons,packages,students}}

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
 const rows=useMemo(()=>(d?.lessons||[]).filter(l=>(!sid||l.student_id===sid)&&l.starts_at.slice(0,7)===month),[d,sid,month]);
 const s=d?summary(d.lessons.filter(l=>!sid||l.student_id===sid),d.packages.filter(p=>!sid||p.student_id===sid),month):null;const loc=locale();
 const name=(id:string)=>d?.students.find(x=>x.id===id)?.name||'';
 return <>
  <div className="page-head"><div><p className="eyebrow-dark">{t('DOCENT')}</p><h1>{t('Betalingen')}</h1><p className="muted">{t('Eenvoudige administratie: er worden geen betalingen verwerkt of facturen verstuurd.')}</p></div>
   {on!==null&&<label className="row small"><input type="checkbox" checked={!!on} onChange={e=>void toggle(e.target.checked)}/> {t('Betalingsadministratie gebruiken')}</label>}</div>
  {msg&&<p className="notice" role="status">{msg}</p>}
  {on===false&&<p className="muted">{t('Uitgeschakeld. Zet het aan om tarieven, betalingen en lespakketten bij te houden. Bestaande lessen krijgen geen betaalstatus.')}</p>}
  {on&&!d&&<div className="loader small"/>}
  {on&&d&&s&&<>
   <div className="row"><select className="field inline" value={sid} onChange={e=>setSid(e.target.value)}><option value="">{t('Alle leerlingen')}</option>{d.students.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
    <input className="field inline" type="month" value={month} onChange={e=>setMonth(e.target.value)}/></div>
   <dl className="fin-grid card"><div><dt>{t('Ontvangen')}</dt><dd>{fmtMoney(s.received,loc)}</dd></div><div><dt>{t('Openstaand')}</dt><dd>{fmtMoney(s.outstanding,loc)}</dd></div>
    <div><dt>{t('Gegeven lessen')}</dt><dd>{s.lessonsGiven} <small className="muted">({t('waarde')} {fmtMoney(s.givenValue,loc)})</small></dd></div><div><dt>{t('Vooruitbetaald')}</dt><dd>{t('{0} lessen',s.prepaidLeft)}</dd></div></dl>
   <section className="card"><h3>{t('Lessen')}</h3>{rows.length?<table className="pay-table"><tbody>{rows.map(l=><tr key={l.id}><td>{new Date(l.starts_at).toLocaleDateString(loc,{day:'numeric',month:'short'})}</td><td>{name(l.student_id)}</td><td>{fmtPrice(l.price_cents,l.currency,loc)}</td>
    <td><span className={'pay-chip p-'+l.payment_status}>{t(PAY_LABEL[l.payment_status as PayStatus])}</span></td><td>{(l.payment_status==='open'||l.payment_status==='reported')&&<button className="button small secondary" onClick={()=>void setPaid(l.id)}><Check size={13}/> {t('Betaald')}</button>}</td></tr>)}</tbody></table>:<p className="muted small">{t('Geen lessen met een betaalstatus in deze maand.')}</p>}</section>
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
