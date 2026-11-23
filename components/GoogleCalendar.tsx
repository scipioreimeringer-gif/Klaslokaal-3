'use client';
// v45: Google Calendar in the agenda (teacher): connect with a separate consent, choose the calendar, a small sync
// indicator, an understandable error with "Opnieuw synchroniseren", optional guest invitations and disconnect.
// The browser never sees a Google token: everything goes through /api/calendar/* with the teacher's own session.
import {useCallback,useEffect,useRef,useState} from 'react';
import {CalendarCheck2,RefreshCw,AlertTriangle,Unplug,Check,Loader2,Link2} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {authFetch} from '../lib/authFetch';
import {t,locale} from '../lib/i18n';
import {Select} from './Select';

type Status={configured:boolean;migration?:boolean;connected:boolean;email?:string|null;calendar_id?:string|null;calendar_name?:string|null;invite_students?:boolean;status?:'ok'|'error'|'revoked';last_error?:string|null;last_synced_at?:string|null;push?:boolean;pending?:number;failed?:number;
 // v57 (absent before v57.sql: then the old behaviour — lessons I give, no extra consent step)
 sync_teaching?:boolean;sync_learning?:boolean;sync_personal?:boolean;confirmed?:boolean;is_teacher?:boolean};
type Types={teaching:boolean;learning:boolean;personal:boolean};
/** v57: a calendar that belongs to another platform (e.g. "Preply Schedule") should not receive private lessons. */
export const looksForeign=(name:string|null|undefined)=>/preply|italki|verbling|cambly|amazing\s*talker/i.test(name||'');
export function typesText(s:Pick<Status,'sync_teaching'|'sync_learning'|'sync_personal'|'is_teacher'>){
 return [s.is_teacher!==false&&s.sync_teaching!==false?t('lessen die ik geef'):'',s.sync_learning?t('lessen die ik volg'):'',s.sync_personal?t('persoonlijke afspraken'):''].filter(Boolean).join(', ')||t('niets')}
function TypesPicker({st,busy,onSave,first}:{st:Status;busy:boolean;onSave:(x:Types)=>void;first:boolean}){
 const teacher=st.is_teacher!==false;
 const [v,setV]=useState<Types>(()=>first?{teaching:teacher,learning:true,personal:false}:{teaching:teacher&&st.sync_teaching!==false,learning:!!st.sync_learning,personal:!!st.sync_personal});
 const foreign=looksForeign(st.calendar_name);const [ok,setOk]=useState(!foreign);
 return <div className="gcal-types">
  <p className="small"><strong>{first?t('Wat wil je naar Google Agenda sturen?'):t('Wat wordt gesynchroniseerd')}</strong><br/><span className="muted">{t('Account: {0} · Doelagenda: {1}',st.email||'Google',st.calendar_name||'—')}</span></p>
  {teacher&&<label className="row small"><input type="checkbox" checked={v.teaching} onChange={e=>setV({...v,teaching:e.target.checked})}/> {t('Lessen die ik geef')}</label>}
  <label className="row small"><input type="checkbox" checked={v.learning} onChange={e=>setV({...v,learning:e.target.checked})}/> {t('Lessen die ik volg')}</label>
  <label className="row small"><input type="checkbox" checked={v.personal} onChange={e=>setV({...v,personal:e.target.checked})}/> {t('Persoonlijke afspraken')}</label>
  {foreign&&<p className="notice small" role="alert"><AlertTriangle size={14}/> {t('“{0}” lijkt de agenda van een ander lesplatform. Lessen en afspraken uit TeachyRooms komen daar dan ook in te staan. Kies liever je eigen agenda.',st.calendar_name||'')}
   <label className="row small"><input type="checkbox" checked={ok} onChange={e=>setOk(e.target.checked)}/> {t('Ik weet het zeker: gebruik deze agenda')}</label></p>}
  <button type="button" className="button small" disabled={busy||!ok} onClick={()=>onSave(v)}>{first?t('Toestemming geven en synchroniseren'):t('Keuze opslaan')}</button>
  {first&&<small className="muted">{t('Er wordt niets naar Google gestuurd voordat je hier toestemming geeft.')}</small>}
 </div>
}
type Cal={id:string;name:string;primary:boolean};

export async function calendarApi<T>(action:string,body?:unknown):Promise<T>{
 const r=await authFetch(supabase()!,'/api/calendar/'+action,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(t((j as {error?:string}).error||'')||t('Fout {0}',r.status));return j as T;
}
/** Ask the panel to send local changes now (after planning, moving or cancelling a lesson). */
export function requestCalendarSync(){if(typeof window!=='undefined')window.dispatchEvent(new Event('teachy-gcal-sync'))}

export function GoogleCalendarPanel({onSynced}:{onSynced:()=>void}){
 const [st,setSt]=useState<Status|null>(null);const [done,setDone]=useState(false);const [busy,setBusy]=useState<''|'sync'|'connect'|'cal'|'off'>('');const [msg,setMsg]=useState('');const [cals,setCals]=useState<Cal[]|null>(null);const [open,setOpen]=useState(false);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const load=useCallback(async()=>{try{setSt(await calendarApi<Status>('status'))}catch{setSt({configured:false,connected:false})}},[]);
 const sync=useCallback(async(retry=false)=>{setBusy('sync');setMsg('');try{const r=await calendarApi<{applied?:number;conflicts?:number;needsCalendar?:boolean}>('sync',{retry});if((r.applied||0)>0||(r.conflicts||0)>0)onSynced()}catch(e){setMsg(e instanceof Error?e.message:String(e))}setBusy('');await load()},[load,onSynced]);
 // recovery: every time the agenda opens, missed Google notifications are caught up (incremental sync)
 useEffect(()=>{void (async()=>{await load()})()},[load]);
 useEffect(()=>{if(st?.connected&&st.calendar_id&&st.confirmed!==false&&st.status!=='revoked'&&!busy)void sync();// eslint-disable-next-line react-hooks/exhaustive-deps
 },[st?.connected,st?.calendar_id,st?.confirmed]);
 // v52: only a working connection syncs (after disconnecting or with withdrawn access nothing is sent to Google)
 // v57: and only after the explicit choice of what is synchronised
 const stRef=useRef(st);stRef.current=st;
 useEffect(()=>{const h=()=>{const s=stRef.current;if(!s?.connected||!s.calendar_id||s.confirmed===false||s.status==='revoked')return;if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void sync(),800)};window.addEventListener('teachy-gcal-sync',h);return()=>window.removeEventListener('teachy-gcal-sync',h)},[sync]);
 useEffect(()=>{if(typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('google')==='kies')setOpen(true)},[]);
 useEffect(()=>{if(open&&st?.connected&&!cals)void calendarApi<{calendars:Cal[]}>('calendars').then(r=>setCals(r.calendars),e=>setMsg(e instanceof Error?e.message:String(e)))},[open,st?.connected,cals]);
 if(!st)return null;
 if(st.migration===false)return null;                                    // database update not run: the agenda works as before
 async function connect(){setBusy('connect');setMsg('');try{const r=await calendarApi<{url:string}>('connect',{});window.location.href=r.url}catch(e){setMsg(e instanceof Error?e.message:String(e));setBusy('')}}
 async function saveTypes(x:Types){setBusy('cal');setMsg('');try{await calendarApi('types',x);onSynced()}catch(e){setMsg(e instanceof Error?e.message:String(e))}setBusy('');await load()}
 async function choose(id:string){const c=cals?.find(x=>x.id===id);if(looksForeign(c?.name)&&!confirm(t('“{0}” lijkt de agenda van een ander lesplatform. Weet je zeker dat je je TeachyRooms-afspraken daarin wilt zetten?',c?.name||'')))return;setBusy('cal');setMsg('');try{await calendarApi('calendar',{id,name:c?.name||''});onSynced()}catch(e){setMsg(e instanceof Error?e.message:String(e))}setBusy('');await load()}
 async function invite(on:boolean){setBusy('sync');try{await calendarApi('settings',{invite:on})}catch(e){setMsg(e instanceof Error?e.message:String(e))}setBusy('');await load()}
 // v52: always possible, also when Google already withdrew the access; removes the stored token, account, calendar
 // choice, sync state, push channel and lesson↔event links — never lessons, students or appointments
 async function disconnect(){if(!confirm(t('Google Calendar ontkoppelen?')+(st?.email?'\n'+t('Account: {0}',st.email):'')+'\n\n'+t('TeachyRooms vergeet dit Google-account: de opgeslagen toegang, de gekozen agenda en de synchronisatie worden verwijderd. Lessen, leerlingen en afspraken in TeachyRooms blijven bestaan. Afspraken die al in Google Calendar staan, blijven daar staan maar worden niet meer bijgewerkt.')))return;
  setBusy('off');setMsg('');try{await calendarApi('disconnect',{});setCals(null);setOpen(false);setMsg('');setDone(true)}catch(e){setMsg(e instanceof Error?e.message:String(e))}setBusy('');await load()}
 const err=st.status==='revoked'||!!st.last_error||(st.failed||0)>0;
 if(!st.connected)return <div className="gcal-bar"><span className="gcal-chip off"><CalendarCheck2 size={14} aria-hidden/> {t('Google Calendar niet verbonden')}</span>
  {done&&<small className="muted" role="status">{t('Ontkoppeld. Je kunt nu een ander Google-account verbinden.')}</small>}
  {st.configured?<button type="button" className="button small secondary" disabled={!!busy} onClick={()=>void connect()} title={t('Google laat je kiezen met welk account je verbindt')}>{busy==='connect'?<Loader2 size={14} className="spin"/>:<Link2 size={14}/>} {t('Google Calendar verbinden')}</button>
   :<small className="muted">{t('Nog niet ingesteld door de beheerder.')}</small>}{msg&&<small className="danger-text" role="alert">{msg}</small>}</div>;
 return <div className={'gcal-bar'+(err?' has-error':'')}>
  <button type="button" className={'gcal-chip'+(err?' err':'')} aria-expanded={open} onClick={()=>setOpen(o=>!o)} title={st.email||''}>
   {busy==='sync'?<Loader2 size={14} className="spin" aria-hidden/>:err?<AlertTriangle size={14} aria-hidden/>:<Check size={14} aria-hidden/>}
   {st.status==='revoked'?t('Google Calendar: opnieuw verbinden'):err?t('Google Calendar: synchronisatieprobleem'):t('Google Calendar verbonden')}
   <span className="gcal-sub">{st.email?st.email+' · ':''}{busy==='sync'?t('synchroniseren…'):st.calendar_name?st.calendar_name+(st.last_synced_at?' · '+new Date(st.last_synced_at).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'}):''):t('kies een agenda')}</span>
  </button>
  {err&&<span className="gcal-err" role="alert">{st.status==='revoked'?t('Google heeft de toegang ingetrokken of de verbinding is verlopen.'):st.last_error||t('Niet alle lessen konden worden gesynchroniseerd.')}
   {st.status==='revoked'?<button type="button" className="linklike" onClick={()=>void connect()}>{t('Opnieuw verbinden')}</button>:<button type="button" className="linklike" disabled={!!busy} onClick={()=>void sync(true)}><RefreshCw size={13}/> {t('Opnieuw synchroniseren')}</button>}</span>}
  {open&&<div className="gcal-pop">
   <p className="muted small">{t('Verbonden als {0}',st.email||'Google')}{st.push?' · '+t('wijzigingen in Google komen automatisch binnen'):' · '+t('wijzigingen in Google komen binnen bij openen of synchroniseren')}</p>
   <label className="stack"><span className="label">{t('Agenda voor je lessen')}</span>
    {cals?<Select label={t('Agenda voor je lessen')} value={st.calendar_id||null} placeholder={t('Kies een agenda')} onChange={v=>void choose(String(v))} options={cals.map(c=>({value:c.id,label:c.name+(c.primary?' · '+t('hoofdagenda'):'')}))} disabled={!!busy}/>:<div className="loader small"/>}</label>
   {st.calendar_id&&st.confirmed!==undefined&&st.confirmed&&<TypesPicker key={'t'+String(st.sync_teaching)+st.sync_learning+st.sync_personal} st={st} busy={!!busy} first={false} onSave={x=>void saveTypes(x)}/>}
   {st.is_teacher!==false&&<label className="row small"><input type="checkbox" checked={!!st.invite_students} disabled={!!busy||!st.calendar_id} onChange={e=>void invite(e.target.checked)}/> {t('Leerling uitnodigen als gast (e-mailadres uit het leerlingprofiel)')}</label>}
   <div className="row"><button type="button" className="button small secondary" disabled={!!busy||!st.calendar_id} onClick={()=>void sync(true)}><RefreshCw size={14}/> {t('Nu synchroniseren')}</button>
    <button type="button" className="button small secondary danger-text" disabled={!!busy} onClick={()=>void disconnect()}><Unplug size={14}/> {t('Ontkoppelen')}</button></div>
   {(st.pending||0)>0&&<small className="muted">{t('{0} wijziging(en) wachten nog op Google.',st.pending)}</small>}
  </div>}
  {/* v57: always shown which account, which target calendar and WHAT is synchronised; nothing is sent before consent */}
  {st.calendar_id&&st.confirmed===false&&<TypesPicker st={st} busy={!!busy} first onSave={x=>void saveTypes(x)}/>}
  {st.calendar_id&&st.confirmed&&!open&&<small className="muted gcal-what">{t('Naar {0} gaan: {1}',st.calendar_name||'Google',typesText(st))}</small>}
  {/* v52: always visible, not only inside the panel — also (and especially) when the access was withdrawn */}
  {!open&&<button type="button" className="button small secondary danger-text gcal-off" disabled={!!busy} onClick={()=>void disconnect()}>{busy==='off'?<Loader2 size={14} className="spin"/>:<Unplug size={14}/>} {t('Ontkoppelen')}</button>}
  {msg&&<small className="danger-text" role="alert">{msg}</small>}
 </div>
}
