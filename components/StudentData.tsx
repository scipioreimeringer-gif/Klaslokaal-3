'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {BookOpenCheck,Clock3,ClipboardList,Languages,Lock,Mic,Trash2,Play,Search,LayoutGrid,History,NotebookPen,PenLine} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {allWords,deleteRecording,duration,loadStudentBundle,niceDate,recordingUrl,type BoardData,type ClassroomState,type LessonEntry,type Recording} from '../lib/data';
import Homework from '../app/huiswerk-client';
import {BarChart,CHART,ChartCard,LineChart,StatTile} from './Charts';
import {TeacherAnalyses,StudentSummaries} from './Analysis';
import {GoalsPanel,SelfPractice,VocabGames,VocabManager} from './Learning';
import {subjectOf} from '../lib/learning';
import {Sparkles,Target,Gamepad2} from 'lucide-react';
import {cumulativeWords,isEmptySeries,lessonsPerMonth} from '../lib/stats';

type Bundle=Awaited<ReturnType<typeof loadStudentBundle>>;
type Progress=Bundle['progress'];

export function ProgressCards({p}:{p:Progress}){
 return <div className="statgrid">
  <StatTile icon={BookOpenCheck} value={p.lessons} label="Lessen" hint={p.lessonsThisMonth+' deze maand'}/>
  <StatTile icon={Languages} tone="mint" value={p.words} label="Woorden" hint="in de woordenlijst"/>
  <StatTile icon={ClipboardList} tone="sky" value={`${p.homeworkDone}/${p.homeworkPublished}`} label="Huiswerk ingeleverd" hint="van gepubliceerde opdrachten"/>
  <StatTile icon={Clock3} tone="coral" value={p.lastLesson?new Date(p.lastLesson+'T12:00:00').toLocaleDateString('nl-NL',{day:'numeric',month:'short'}):'—'} label="Laatste les" hint={p.lastLesson?'opgeslagen':'nog geen les'}/>
 </div>
}

/** Per-student charts inside the workspace overview (teacher and student view). */
function StudentCharts({lessons}:{lessons:LessonEntry[]}){
 const L=lessons.map(l=>({student_id:l.student_id,lesson_date:l.lesson_date,words:l.words}));
 const perMonth=lessonsPerMonth(L,6),growth=cumulativeWords(L,6);
 return <div className="chart-grid two">
  <ChartCard title="Lessen per maand" subtitle="Afgelopen 6 maanden" empty={isEmptySeries(perMonth)} emptyText="Nog geen lessen opgeslagen." table={perMonth}><BarChart data={perMonth} color={CHART.teal}/></ChartCard>
  <ChartCard title="Woordenschat" subtitle="Totaal aantal woorden" empty={growth[growth.length-1].value===0} emptyText="Nog geen woorden." table={growth}><LineChart data={growth} color={CHART.violet}/></ChartCard>
 </div>
}

export function LessonHistory({lessons}:{lessons:LessonEntry[]}){
 if(!lessons.length)return <p className="muted">Nog geen lessen opgeslagen. Lesnotities, woorden en huiswerk uit het live klaslokaal verschijnen hier automatisch.</p>;
 return <div className="lesson-list">{lessons.map((l,i)=><details key={l.id} open={i===0} className="lesson-item"><summary><span className="lesson-date">{niceDate(l.lesson_date)}</span><span className="lesson-meta">{(l.words||[]).length} woorden{l.homework?' · huiswerk':''}</span></summary>
  <div className="lesson-body">{l.notes?<><h4>Lesnotities</h4><p className="pre">{l.notes}</p></>:<p className="muted">Geen notities.</p>}
  {!!(l.words||[]).length&&<><h4>Woorden</h4><ul className="chips">{(l.words||[]).map((w,j)=><li key={j}><b>{w.nl}</b>{w.uit?<span> · {w.uit}</span>:null}</li>)}</ul></>}
  {l.homework&&<><h4>Huiswerk</h4><p className="pre">{l.homework}</p></>}</div></details>)}</div>
}

export function VocabList({lessons}:{lessons:LessonEntry[]}){
 const [q,setQ]=useState('');const words=useMemo(()=>allWords(lessons),[lessons]);
 const shown=words.filter(w=>(w.nl+' '+w.uit).toLowerCase().includes(q.toLowerCase()));
 if(!words.length)return <p className="muted">Nog geen woorden. Woorden die de docent tijdens de les toevoegt, komen hier terecht.</p>;
 return <div><label className="searchbox"><Search size={16}/><input placeholder={`Zoek in ${words.length} woorden…`} value={q} onChange={e=>setQ(e.target.value)}/></label>
  <table className="vocab"><thead><tr><th>Woord</th><th>Betekenis</th><th>Les</th></tr></thead><tbody>{shown.map(w=><tr key={w.nl+w.date}><td><b>{w.nl}</b></td><td>{w.uit||<span className="muted">—</span>}</td><td className="muted">{new Date(w.date+'T12:00:00').toLocaleDateString('nl-NL',{day:'numeric',month:'short'})}</td></tr>)}</tbody></table></div>
}

export function RecordingList({items,onChange}:{items:Recording[];onChange:()=>void}){
 const [urls,setUrls]=useState<Record<string,string>>({});const [msg,setMsg]=useState('');
 if(!items.length)return <p className="muted">Nog geen opnames. Een opname start je in het live klaslokaal; de leerling moet daar eerst toestemming geven.</p>;
 return <div className="rec-list">{msg&&<p className="muted" role="status">{msg}</p>}{items.map(r=><div className="rec-item" key={r.id}><div className="rec-icon"><Mic size={18}/></div><div className="rec-info"><strong>{niceDate(r.created_at)}</strong><small>{duration(r.duration_seconds)} · {(r.size_bytes/1048576).toFixed(1)} MB · toestemming leerling {new Date(r.student_consent_at).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}</small>{urls[r.id]&&<audio controls src={urls[r.id]} preload="metadata"/>}</div>
  {!urls[r.id]&&<button className="button small secondary" onClick={async()=>{const u=await recordingUrl(supabase()!,r.storage_path);if(u.url)setUrls(x=>({...x,[r.id]:u.url!}));else setMsg(u.error||'Niet beschikbaar')}}><Play size={15}/> Afspelen</button>}
  <button className="iconbtn danger" title="Opname verwijderen" aria-label="Opname verwijderen" onClick={async()=>{if(!confirm('Deze opname definitief verwijderen? Dit kan niet ongedaan worden gemaakt.'))return;const e=await deleteRecording(supabase()!,r);setMsg(e||'Opname verwijderd');onChange()}}><Trash2 size={16}/></button></div>)}</div>
}

/** Read-only rendering of the stored drawn whiteboards (same coordinate system as the live classroom). */
export function BoardPreview({board}:{board:BoardData|null}){
 const keys=(board?.list||[]).filter(k=>(board?.objs?.[k]||[]).length);const [i,setI]=useState(0);
 if(!board||!keys.length)return <p className="muted">Er is nog geen whiteboard opgeslagen voor deze leerling.</p>;
 const k=keys[Math.min(i,keys.length-1)];const objs=board.objs[k]||[];const H=7500;
 return <div className="board-preview"><div className="row between"><span className="muted">Bord {Math.min(i,keys.length-1)+1} van {keys.length}</span><div className="row"><button className="button small secondary" disabled={i===0} onClick={()=>setI(i-1)}>‹</button><button className="button small secondary" disabled={i>=keys.length-1} onClick={()=>setI(i+1)}>›</button></div></div>
  <svg viewBox={`0 0 10000 ${H}`} role="img" aria-label="Opgeslagen whiteboard">{objs.map(o=>{if(o.ty==='tx')return <text key={o.id} x={o.x||0} y={(o.y||0)*H/1e4} fill={o.c} fontSize={340} fontWeight={600} dominantBaseline="hanging">{String(o.txt||'').split('\n').map((line,j)=><tspan key={j} x={o.x||0} dy={j?420:0}>{line}</tspan>)}</text>;const p=o.p||[];if(p.length<2)return null;let d=`M${p[0]} ${p[1]*H/1e4}`;for(let j=2;j<p.length;j+=2)d+=`L${p[j]} ${p[j+1]*H/1e4}`;if(p.length===2)d+='l1 0';return <path key={o.id} d={d} fill="none" stroke={o.c==='hl'?'rgba(255,225,77,.45)':o.c} strokeWidth={(o.c==='hl'?200:38)*(o.sz||1)} strokeLinecap="round" strokeLinejoin="round"/>})}</svg></div>
}

function sanitizeCanvas(html:string){
 if(typeof window==='undefined')return '';
 const doc=new DOMParser().parseFromString('<div>'+html+'</div>','text/html');const allowed=new Set(['DIV','P','B','STRONG','I','EM','U','SPAN','MARK','BR','UL','OL','LI']);
 const walk=(el:Element)=>{for(const c of Array.from(el.children)){if(!allowed.has(c.tagName)){c.replaceWith(...Array.from(c.childNodes).filter(n=>n.nodeType===3||n.nodeType===1));continue}
  const color=(c as HTMLElement).style?.color,bg=(c as HTMLElement).style?.backgroundColor;const dt=c.getAttribute('data-t');
  for(const a of Array.from(c.attributes))c.removeAttribute(a.name);
  if(dt&&/^[a-z]{1,4}$/.test(dt)){c.setAttribute('data-t',dt);c.setAttribute('class','b')}
  const st=[color&&/^[#a-z0-9(),.\s%]+$/i.test(color)?`color:${color}`:'',bg&&/^[#a-z0-9(),.\s%]+$/i.test(bg)?`background-color:${bg}`:''].filter(Boolean).join(';');if(st)c.setAttribute('style',st);walk(c)}};
 const root=doc.body.firstElementChild!;walk(root);return root.innerHTML;
}
export function CanvasPreview({state}:{state:ClassroomState|null}){
 const pages=state?.canvas?.pages||[];const [i,setI]=useState(0);const html=useMemo(()=>sanitizeCanvas(pages[i]?.html||''),[pages,i]);
 if(!pages.length||!pages.some(p=>p.html))return <p className="muted">Er zijn nog geen canvaspagina&apos;s opgeslagen.</p>;
 return <div><div className="row between"><select className="field" value={i} onChange={e=>setI(+e.target.value)}>{pages.map((p,j)=><option key={p.id||j} value={j}>{j+1}. {p.title}</option>)}</select></div><div className="canvas-preview" dangerouslySetInnerHTML={{__html:html||'<p class="muted">Lege pagina</p>'}}/></div>
}

export function PrivateNotes({studentId}:{studentId:string}){
 const [notes,setNotes]=useState('');const [saved,setSaved]=useState('');const [status,setStatus]=useState('Laden…');const [ready,setReady]=useState(false);const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{setReady(false);let c=false;void supabase()!.from('teacher_private_notes').select('notes').eq('student_id',studentId).maybeSingle().then(({data,error})=>{if(c)return;if(error){setStatus('Niet beschikbaar: '+error.message);return}const n=data?.notes||'';setNotes(n);setSaved(n);setReady(true);setStatus('Alleen zichtbaar voor jou')});return()=>{c=true}},[studentId]);
 useEffect(()=>{if(!ready||notes===saved)return;if(timer.current)clearTimeout(timer.current);setStatus('Wijzigingen…');timer.current=setTimeout(async()=>{const {error}=await supabase()!.from('teacher_private_notes').upsert({student_id:studentId,notes,updated_at:new Date().toISOString()},{onConflict:'student_id'});if(error)setStatus('Opslaan mislukt: '+error.message);else{setSaved(notes);setStatus('Opgeslagen ✓ · alleen zichtbaar voor jou')}},800);return()=>{if(timer.current)clearTimeout(timer.current)}},[notes,saved,ready,studentId]);
 return <div className="private-notes"><div className="row between"><h3><Lock size={16}/> Privénotities</h3><small className="muted" role="status">{status}</small></div><textarea className="field" disabled={!ready} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Observaties, aandachtspunten, plan voor de volgende les… De leerling kan dit nooit zien."/></div>
}

type Tab='overzicht'|'lessen'|'analyses'|'woorden'|'doelen'|'huiswerk'|'oefenen'|'bord'|'opnames'|'prive';
type WsStudent={id:string;subject:string;level:string|null;lesson_language:string|null;curriculum_subject?:string|null};
export function StudentWorkspace({studentId,viewer,intro,student,initialTab}:{studentId:string;viewer:'teacher'|'student';intro?:React.ReactNode;student?:WsStudent;initialTab?:string|null}){
 const [b,setB]=useState<Bundle|null>(null);const [tab,setTab]=useState<Tab>('overzicht');
 const load=useCallback(async()=>{setB(await loadStudentBundle(supabase()!,studentId))},[studentId]);
 useEffect(()=>{setB(null);setTab((initialTab as Tab)||'overzicht');void load()},[load,initialTab]);
 const tabs:[Tab,string,typeof History][]=[['overzicht','Overzicht',LayoutGrid],['lessen','Lessen',History],['analyses',viewer==='teacher'?'Lesanalyses':'Samenvattingen',Sparkles],['woorden','Woordenschat',Languages],['doelen','Leerdoelen',Target],['huiswerk','Huiswerk',ClipboardList],...(viewer==='student'?[['oefenen','Oefenen',Gamepad2] as [Tab,string,typeof History]]:[]),['bord','Bord & canvas',PenLine],['opnames','Opnames',Mic],...(viewer==='teacher'?[['prive','Privé',Lock] as [Tab,string,typeof History]]:[])];
 const ws:WsStudent=student||{id:studentId,subject:'',level:null,lesson_language:null};
 return <div className="workspace">
  <div className="tabs" role="tablist">{tabs.map(([k,l,Icon])=><button key={k} role="tab" aria-selected={tab===k} onClick={()=>setTab(k)}><Icon size={15}/>{l}</button>)}</div>
  {!b?<div className="card"><div className="loader small"/></div>:<>
  {b.error&&<div className="notice">{b.error}</div>}
  {tab==='overzicht'&&<><ProgressCards p={b.progress}/><StudentCharts lessons={b.lessons}/>{intro}<div className="grid2"><section className="card"><h3><History size={17}/> Laatste les</h3><LessonHistory lessons={b.lessons.slice(0,1)}/></section><section className="card"><h3><NotebookPen size={17}/> Recente woorden</h3><ul className="chips">{allWords(b.lessons).slice(0,24).map(w=><li key={w.nl}><b>{w.nl}</b>{w.uit?<span> · {w.uit}</span>:null}</li>)}</ul>{!allWords(b.lessons).length&&<p className="muted">Nog geen woorden.</p>}</section></div></>}
  {tab==='lessen'&&<section className="card"><h3>Lesgeschiedenis</h3><LessonHistory lessons={b.lessons}/></section>}
  {tab==='analyses'&&<section className="card"><h3><Sparkles size={17}/> {viewer==='teacher'?'AI-lesanalyses':'Lessamenvattingen'}</h3>{viewer==='teacher'?<TeacherAnalyses studentId={studentId}/>:<StudentSummaries studentId={studentId}/>}</section>}
  {tab==='woorden'&&<section className="card"><h3>Woordenschat</h3><VocabManager studentId={studentId} viewer={viewer}/></section>}
  {tab==='doelen'&&<section className="card"><h3><Target size={17}/> Leerdoelen</h3><GoalsPanel student={ws} viewer={viewer}/></section>}
  {tab==='oefenen'&&viewer==='student'&&<><section className="card"><h3><Gamepad2 size={17}/> Oefenen &amp; spelletjes</h3><VocabGames studentId={studentId} subject={subjectOf(ws)}/></section><section className="card"><h3><Sparkles size={17}/> Maak mijn huiswerk</h3><SelfPractice studentId={studentId} level={ws.level}/></section></>}
  {tab==='huiswerk'&&<Homework studentId={studentId} teacher={viewer==='teacher'}/>}
  {tab==='bord'&&<div className="grid2"><section className="card"><h3>Whiteboard</h3><BoardPreview board={b.state?.board||null}/></section><section className="card"><h3>Canvas</h3><CanvasPreview state={b.state}/></section></div>}
  {tab==='opnames'&&<section className="card"><h3>Lesopnames</h3><RecordingList items={b.recordings} onChange={()=>void load()}/></section>}
  {tab==='prive'&&viewer==='teacher'&&<section className="card private"><PrivateNotes studentId={studentId}/></section>}
  </>}
 </div>
}
