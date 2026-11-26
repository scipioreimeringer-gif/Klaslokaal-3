'use client';
// v72: "AI-analyse opnieuw uitvoeren" for an existing report (teacher only): with the stored transcript, re-transcribed from
// the original recording, or with an imported transcript (TXT/SRT/VTT) or audio file (MP3/M4A/WAV). The current report and
// the recording stay until the new analysis has succeeded; nothing runs over the lesson history by itself.
import {useState} from 'react';
import {RefreshCw,AudioLines,Upload,Loader2} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {authedPost} from '../lib/learning';
import {t as tt} from '../lib/i18n';
import {parseImported,importedLabels,toTranscript,type Line} from '../lib/transcript';
import {prepareAudio,AUDIO_EXT,TEXT_EXT} from '../lib/audioImport';

type Row={id:string;student_id:string;status:string;recording_id?:string|null;transcript?:string|null;stage?:string|null;stage_detail?:Record<string,unknown>|null;error?:string|null};
export const rerunActive=(a:Row)=>!!a.stage_detail?.rerun&&a.stage!=='done'&&a.stage!=='failed'&&a.stage!=='partial_failed';
const GUESS=(l:string):Line['speaker']=>/docent|teacher|professor|leraar|juf|meester|tutor/i.test(l)?'DOCENT':/leerling|student|aluno|aluna|learner/i.test(l)?'LEERLING':'ONBEKEND';

export function Reanalyse({a,onChange}:{a:Row;onChange:()=>void}){
 const [busy,setBusy]=useState('');const [err,setErr]=useState('');
 const [lines,setLines]=useState<ReturnType<typeof parseImported>|null>(null);const [map,setMap]=useState<Record<string,Line['speaker']>>({});const [fileName,setFileName]=useState('');
 if(a.status!=='approved'&&a.status!=='ready')return null;
 const running=rerunActive(a);
 async function run(body:Record<string,unknown>){setErr('');try{await authedPost(supabase()!,'/api/ai/analyze',{rerunId:a.id,...body});setLines(null);onChange()}catch(e){setErr(e instanceof Error?e.message:String(e))}setBusy('')}
 async function pick(f:File|undefined){if(!f)return;setErr('');setFileName(f.name);
  if(TEXT_EXT.test(f.name)){const l=parseImported(await f.text());if(l.length<2){setErr(tt('Geen bruikbare tekst gevonden in dit bestand.'));return}
   setLines(l);setMap(Object.fromEntries(importedLabels(l).map(x=>[x,GUESS(x)])));return}
  if(!AUDIO_EXT.test(f.name)){setErr(tt('Kies een MP3-, M4A-, WAV-, TXT-, SRT- of VTT-bestand.'));return}
  try{setBusy(tt('Audio voorbereiden…'));const p=await prepareAudio(f);const db=supabase()!;const stamp=Date.now().toString(36);const paths:string[]=[];
   for(let i=0;i<p.blobs.length;i++){setBusy(tt('Uploaden {0} van {1}…',i+1,p.blobs.length));const path=`${a.student_id}/import-${stamp}-${i}.${p.ext[i]}`;
    const u=await db.storage.from('recordings').upload(path,p.blobs[i],{contentType:p.mime,upsert:false});if(u.error)throw new Error(/mime|type/i.test(u.error.message)?tt('Dit audioformaat wordt nog niet geaccepteerd: voer supabase/v72.sql uit.'):u.error.message);paths.push(path)}
   setBusy(tt('Analyse starten…'));await run({audio:{paths,offsets:p.offsets,mime:p.mime}})}
  catch(e){setErr(e instanceof Error?e.message:String(e));setBusy('')}}
 const failedRerun=(a.stage==='failed'||a.stage==='partial_failed')&&!!a.error;
 return <details className="reanalyse">
  <summary><RefreshCw size={14}/> {tt('AI-analyse opnieuw uitvoeren')}{running&&<span className="tag"><Loader2 size={12} className="spin"/> {tt('bezig')}</span>}</summary>
  {running?<p className="muted">{tt('De nieuwe analyse loopt. Het huidige verslag blijft zichtbaar totdat de nieuwe analyse helemaal klaar is.')}</p>:<>
   {failedRerun&&<p className="notice">{tt('De nieuwe analyse is niet gelukt; het bestaande verslag is behouden.')} {a.error}</p>}
   <p className="muted small-print">{tt('Analyseert deze les opnieuw met de verbeterde methode. Jouw goedgekeurde, aangepaste en verwijderde fouten blijven behouden; er komen geen dubbele fouten, woorden of huiswerk bij.')}</p>
   <div className="row wrap">
    <button className="button small" disabled={!!busy||!a.transcript} onClick={()=>{setBusy('…');void run({})}}><RefreshCw size={14}/> {tt('Opnieuw analyseren')}</button>
    {a.recording_id&&<button className="button small secondary" disabled={!!busy} title={tt('Alleen nodig als de bestaande transcriptie onvoldoende is.')} onClick={()=>{setBusy('…');void run({retranscribe:true})}}><AudioLines size={14}/> {tt('Opnieuw transcriberen')}</button>}
    <label className="button small secondary"><Upload size={14}/> {tt('Audio of transcript importeren')}<input type="file" hidden accept=".mp3,.m4a,.wav,.txt,.srt,.vtt,audio/mpeg,audio/mp4,audio/wav,text/plain,text/vtt" onChange={e=>{void pick(e.target.files?.[0]);e.target.value=''}}/></label>
   </div>
   {busy&&busy!=='…'&&<p className="muted" role="status"><Loader2 size={13} className="spin"/> {busy}</p>}
   {lines&&<div className="import-map">
    <p><b>{fileName}</b> · {tt('{0} regels',lines.length)}{lines.some(l=>l.start!=null)?' · '+tt('met tijdstempels'):''}</p>
    {Object.keys(map).length?<><p className="muted small-print">{tt('Wie is wie? Uitspraken van een onbekende spreker worden nooit met zekerheid aan de leerling toegeschreven.')}</p>
     {Object.keys(map).map(k=><label key={k} className="row"><span className="grow">{k}</span><select className="cell" value={map[k]} onChange={e=>setMap(m=>({...m,[k]:e.target.value as Line['speaker']}))}>
      <option value="DOCENT">{tt('Docent')}</option><option value="LEERLING">{tt('Leerling')}</option><option value="ONBEKEND">{tt('Onbekend')}</option></select></label>)}</>
     :<p className="muted small-print">{tt('Geen sprekerlabels gevonden: alle uitspraken krijgen een onbekende spreker (fouten worden als onzeker gemarkeerd).')}</p>}
    <div className="row"><button className="button small" disabled={!!busy} onClick={()=>{setBusy('…');void run({transcript:toTranscript(lines,map)})}}>{tt('Importeren en analyseren')}</button><button className="button small secondary" onClick={()=>setLines(null)}>{tt('Annuleren')}</button></div>
   </div>}
  </>}
  {err&&<p className="notice" role="alert">{err}</p>}
 </details>
}
