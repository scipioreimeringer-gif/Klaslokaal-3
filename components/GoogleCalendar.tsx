'use client';
// v45: Google Calendar in the agenda (teacher): connect with a separate consent, choose the calendar, a small sync
// indicator, an understandable error with "Opnieuw synchroniseren", optional guest invitations and disconnect.
// The browser never sees a Google token: everything goes through /api/calendar/* with the teacher's own session.
import {useCallback,useEffect,useRef,useState} from 'react';
import {CalendarCheck2,RefreshCw,AlertTriangle,Unplug,Check,Loader2,Link2} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {t,locale} from '../lib/i18n';
import {Select} from './Select';

type Status={configured:boolean;migration?:boolean;connected:boolean;email?:string|null;calendar_id?:string|null;calendar_name?:string|null;invite_students?:boolean;status?:'ok'|'error'|'revoked';last_error?:string|null;last_synced_at?:string|null;push?:boolean;pending?:number;failed?:number};
type Cal={id:string;name:string;primary:boolean};

export async function calendarApi<T>(action:string,body?:unknown):Promise<T>{
 const {data}=await supabase()!.auth.getSession();
 const r=await fetch('/api/calendar/'+action,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(data.session?.access_token||'')},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(t((j as {error?:string}).error||'')||t('Fout {0}',r.status));return j as T;
}
/** Ask the panel to send local changes now (after planning, moving or cancelling a lesson). */
export function requestCalendarSync(){if(typeof window!=='undefined')window.dispatchEvent(new Event('teachy-gcal-sync'))}

export function GoogleCalendarPanel({onSynced}:{onSynced:()=>void}){
 const [st,setSt]=useState<Status|null>(null);const [busy,setBusy]=useState<''|'sync'|'connect'|'cal'|'off'>('');const [msg,setMsg]=useState('');const [cals,setCals]=useState<Cal[]|null>(null);const [open,setOpen]=useState(false);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const load=useCallback(async()=>{try{setSt(await calendarApi<Status>('status'))}catch{setSt({configured:false,connected:false})}},[]);
 const sync=useCallback(async(retry=false)=>{setBusy('sync');setMsg('');try{const r=await calendarApi<{applied?:number;conflicts?:number;needsCalendar?:boolean}>('sync',{retry});if((r.applied||0)>0||(r.conflicts||0)>0)onSynced()}catch(e){setMsg(e instanceof Error?e.message:String(e))}setBusy('');await load()},[load,onSynced]);
 // recovery: every time the agenda opens, missed Google notifications are caught up (incremental sync)
 useEffect(()=>{void (async()=>{await load()})()},[load]);
 useEffect(()=>{if(st?.connected&&st.calendar_id&&st.status!=='revoked'&&!busy)void sync();// eslint-disable-next-line react-hooks/exhaustive-deps
 },[st?.connected,st?.calendar_id]);
 useEffect(()=>{const h=()=>{if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void sync(),800)};window.addEventListener('teachy-gcal-sync',h);return()=>window.removeEventListener('teachy-gcal-sync',h)},[sync]);
 useEffect(()=>{if(typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('google')==='kies')setOpen(true)},[]);
 useEffect(()=>{if(open&&st?.connected&&!cals)void calendarApi<{calendars:Cal[]}>('calendars').then(r=>setCals(r.calendars),e=>setMsg(e instanceof Error?e.message:String(e)))},[open,st?.connected,cals]);
 if(!st)return null;
 if(st.migration===false)return null;                                    // database update not run: the agenda works as before
 async function connect(){setBusy('connect');setMsg('');try{const r=await calendarApi<{url:string}>('connect',{});window.location.href=r.url}catch(e){setMsg(e instanceof Error?e.message:String(e));setBusy('')}}
 async function choose(id:string){const c=cals?.find(x=>x.id===id);setBusy('cal');setMsg('');try{await calendarApi('calendar',{id,name:c?.name||''});onSynced()}catch(e){setMsg(e instanceof Error?e.message:String(e))}setBusy('');await load()}
 async function invite(on:boolean){setBusy('sync');try{await calendarApi('settings',{invite:on})}catch(e){setMsg(e instanceof Error?e.message:String(e))}setBusy('');await load()}
 async function disconnect(){if(!confirm(t('Google Calendar ontkoppelen?')+'\n\n'+t('Lessen in TeachyRooms blijven bestaan. Afspraken die al in Google Calendar staan, blijven daar staan maar worden niet meer bijgewerkt.')))return;
  setBusy('off');try{await calendarApi('disconnect',{});setCals(null);setOpen(false)}catch(e){setMsg(e instanceof Error?e.message:String(e))}setBusy('');await load()}
 const err=st.status==='revoked'||!!st.last_error||(st.failed||0)>0;
 if(!st.connected)return <div className="gcal-bar"><span className="gcal-chip off"><CalendarCheck2 size={14} aria-hidden/> {t('Google Calendar')}</span>
  {st.configured?<button type="button" className="button small secondary" disabled={!!busy} onClick={()=>void connect()}>{busy==='connect'?<Loader2 size={14} className="spin"/>:<Link2 size={14}/>} {t('Google Calendar verbinden')}</button>
   :<small className="muted">{t('Nog niet ingesteld door de beheerder.')}</small>}{msg&&<small className="danger-text" role="alert">{msg}</small>}</div>;
 return <div className={'gcal-bar'+(err?' has-error':'')}>
  <button type="button" className={'gcal-chip'+(err?' err':'')} aria-expanded={open} onClick={()=>setOpen(o=>!o)} title={st.email||''}>
   {busy==='sync'?<Loader2 size={14} className="spin" aria-hidden/>:err?<AlertTriangle size={14} aria-hidden/>:<Check size={14} aria-hidden/>}
   {st.status==='revoked'?t('Google Calendar: opnieuw verbinden'):err?t('Google Calendar: synchronisatieprobleem'):t('Google Calendar verbonden')}
   <span className="gcal-sub">{busy==='sync'?t('synchroniseren…'):st.calendar_name?st.calendar_name+(st.last_synced_at?' · '+new Date(st.last_synced_at).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'}):''):t('kies een agenda')}</span>
  </button>
  {err&&<span className="gcal-err" role="alert">{st.status==='revoked'?t('Google heeft de toegang ingetrokken of de verbinding is verlopen.'):st.last_error||t('Niet alle lessen konden worden gesynchroniseerd.')}
   {st.status==='revoked'?<button type="button" className="linklike" onClick={()=>void connect()}>{t('Opnieuw verbinden')}</button>:<button type="button" className="linklike" disabled={!!busy} onClick={()=>void sync(true)}><RefreshCw size={13}/> {t('Opnieuw synchroniseren')}</button>}</span>}
  {open&&<div className="gcal-pop">
   <p className="muted small">{t('Verbonden als {0}',st.email||'Google')}{st.push?' · '+t('wijzigingen in Google komen automatisch binnen'):' · '+t('wijzigingen in Google komen binnen bij openen of synchroniseren')}</p>
   <label className="stack"><span className="label">{t('Agenda voor je lessen')}</span>
    {cals?<Select label={t('Agenda voor je lessen')} value={st.calendar_id||null} placeholder={t('Kies een agenda')} onChange={v=>void choose(String(v))} options={cals.map(c=>({value:c.id,label:c.name+(c.primary?' · '+t('hoofdagenda'):'')}))} disabled={!!busy}/>:<div className="loader small"/>}</label>
   <label className="row small"><input type="checkbox" checked={!!st.invite_students} disabled={!!busy||!st.calendar_id} onChange={e=>void invite(e.target.checked)}/> {t('Leerling uitnodigen als gast (e-mailadres uit het leerlingprofiel)')}</label>
   <div className="row"><button type="button" className="button small secondary" disabled={!!busy||!st.calendar_id} onClick={()=>void sync(true)}><RefreshCw size={14}/> {t('Nu synchroniseren')}</button>
    <button type="button" className="button small secondary danger-text" disabled={!!busy} onClick={()=>void disconnect()}><Unplug size={14}/> {t('Ontkoppelen')}</button></div>
   {(st.pending||0)>0&&<small className="muted">{t('{0} wijziging(en) wachten nog op Google.',st.pending)}</small>}
  </div>}
  {msg&&<small className="danger-text" role="alert">{msg}</small>}
 </div>
}
