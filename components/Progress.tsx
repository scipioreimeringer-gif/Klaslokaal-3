'use client';
// v73: "Voortgang" — Statistieken · Mijn leerlijn · Werkpunten. Statistics come straight from the database (RLS: a student
// sees only their own relations, a teacher only their students); no AI, nothing estimated. The same hook feeds the
// student's page, the dashboard summary and the teacher's student profile, so the numbers never differ.
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {BookOpenCheck,Clock3,Flame,Languages,ClipboardList,Route,Target,Dumbbell,TrendingUp,AlertCircle,CheckCircle2} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {t} from '../lib/i18n';
import {mergeLessons,type LessonLike,type SessionLike} from '../lib/stats';
import {lessonStats,practiceStats,streaks,vocabStats,homeworkStats,grammarStats,perWeek,correctPerWeek,perMonth,wordGrowth,type Period,type PracticeRow,type VocabRow} from '../lib/progressStats';
import {BarChart,CHART,ChartCard,LineChart,StatTile} from './Charts';
import {LearningPath} from './LearningPath';
import {errorsOf} from '../lib/analysis/core';

type Raw={lessons:ReturnType<typeof mergeLessons>;practice:PracticeRow[];vocab:VocabRow[];assignments:{id:string;published_at:string|null}[];submitted:string[];reviewed:number;
 progress:{status:string;updated_at?:string|null}[];focus:{key:string;status:string}[]};
const today=()=>new Date().toLocaleDateString('en-CA');

/** All stored data needed for the statistics of these relations, loaded once (few columns, no AI). */
export function useStats(ids:string[]){
 const [d,setD]=useState<Raw|null>(null);const [err,setErr]=useState('');const key=ids.join(',');
 useEffect(()=>{if(!ids.length){setD(null);return}let off=false;const db=supabase()!;void(async()=>{
  const [le,se,pr,vo,as,gp,...fo]=await Promise.all([
   db.from('lesson_entries').select('student_id,lesson_date').in('student_id',ids).limit(5000),
   db.from('lesson_sessions').select('id,student_id,lesson_date,started_at,ended_at,joint_seconds,registered_at,lesson_id,recording_id,language').in('student_id',ids).limit(5000),
   db.from('practice_sessions').select('created_at,score,total,kind,details').in('student_id',ids).order('created_at',{ascending:false}).limit(5000),
   db.from('vocab_items').select('status,created_at,last_practiced_at,due_at,difficult').in('student_id',ids).limit(20000),
   db.from('assignments').select('id,published_at').in('student_id',ids).limit(2000),
   db.from('student_goal_progress').select('status,updated_at,hidden').in('student_id',ids),
   ...ids.map(id=>db.rpc('memory_focus',{sid:id}).then(r=>r.error?[]:(r.data||[]) as {key:string;status:string}[]))]);
  const pub=((as.data||[]) as {id:string;published_at:string|null}[]).filter(a=>a.published_at).map(a=>a.id);
  const sub=pub.length?await db.from('homework_submissions').select('assignment_id,feedback_published_at').in('assignment_id',pub).limit(5000):{data:[]};
  if(off)return;
  const e=[le,se,pr,vo,as].find(x=>x.error&&!/does not exist|schema cache/.test(x.error.message));if(e?.error)setErr(e.error.message);
  const subs=(sub.data||[]) as {assignment_id:string;feedback_published_at:string|null}[];
  setD({lessons:mergeLessons((le.data||[]) as LessonLike[],se.error?null:(se.data||[]) as SessionLike[]),practice:(pr.data||[]) as PracticeRow[],vocab:(vo.data||[]) as VocabRow[],
   assignments:(as.data||[]) as Raw['assignments'],submitted:subs.map(s=>s.assignment_id),reviewed:subs.filter(s=>s.feedback_published_at).length,
   progress:((gp.data||[]) as {status:string;updated_at?:string|null;hidden?:boolean}[]).filter(p=>!p.hidden),focus:(fo as {key:string;status:string}[][]).flat()});
 })();return()=>{off=true}},[key]);// eslint-disable-line react-hooks/exhaustive-deps
 return {d,err};
}
export function summarize(d:Raw,p:Period){
 const days=d.practice.map(r=>r.details?.day||r.created_at.slice(0,10));
 return {les:lessonStats(d.lessons as never,p),pr:practiceStats(d.practice,p),st:streaks(days,today()),voc:vocabStats(d.vocab,p),hw:homeworkStats(d.assignments,d.submitted),gr:grammarStats(d.progress,d.focus)};
}

/** Dashboard: one small line of real numbers (same source as Voortgang). Nothing when there is nothing yet. */
export function ProgressSummary({ids}:{ids:string[]}){
 const {d}=useStats(ids);if(!d)return null;const s=summarize(d,'all');
 if(!s.les.count&&!s.voc.total&&!s.pr.sessions)return null;
 return <section className="mini-summary" aria-label={t('Mijn voortgang')}>
  <span><BookOpenCheck size={15}/> <b>{s.les.count}</b> {t('lessen')}</span>
  <span><Languages size={15}/> <b>{s.voc.total}</b> {t('woorden')} <small className="muted">({t('{0} beheerst',s.voc.mastered)})</small></span>
  <span><Flame size={15}/> <b>{s.st.current}</b> {t('dagen op rij')}</span>
  <Link className="textlink" href="/voortgang">{t('Alle voortgang')} →</Link>
 </section>
}

const PER:[Period,string][]=[['week','Deze week'],['month','Deze maand'],['all','Alles']];
export function StatsView({ids}:{ids:string[]}){
 const {d,err}=useStats(ids);const [p,setP]=useState<Period>('month');
 const charts=useMemo(()=>d?{
  practice:perWeek(d.practice,r=>r.created_at,()=>1,8),correct:correctPerWeek(d.practice,8),words:wordGrowth(d.vocab,6),
  minutes:perMonth(d.lessons as {lesson_date:string;session?:{joint_seconds:number}}[],l=>l.lesson_date,l=>Math.round((l.session?.joint_seconds||0)/60),6),
  mastered:perMonth(d.progress.filter(x=>x.status==='mastered'),x=>x.updated_at,()=>1,6)}:null,[d]);
 if(err)return <p className="notice">{err}</p>;
 if(!d||!charts)return <div className="loader small"/>;
 const s=summarize(d,p);const none=(x:number)=>x===0;
 return <div className="stats-view">
  <div className="chipbar period" role="group" aria-label={t('Periode')}>{PER.map(([k,l])=><button key={k} aria-pressed={p===k} onClick={()=>setP(k)}>{t(l)}</button>)}</div>
  <h4 className="stats-h">{t('Lesactiviteit')}</h4>
  <div className="statgrid compact">
   <StatTile icon={BookOpenCheck} value={s.les.count} label={t('Gevolgde lessen')} hint={p!=='month'?t('{0} deze maand',s.les.thisMonth):undefined}/>
   <StatTile icon={Clock3} tone="mint" value={s.les.measured?t('{0} u {1} min',Math.floor(s.les.minutes/60),s.les.minutes%60):'—'} label={t('Gemeten lestijd')} hint={s.les.measured<s.les.count?t('{0} van {1} lessen gemeten',s.les.measured,s.les.count):undefined}/>
   <StatTile icon={Clock3} tone="sky" value={s.les.avgMinutes!==null?t('{0} min',s.les.avgMinutes):'—'} label={t('Gemiddelde lesduur')}/>
  </div>
  <h4 className="stats-h">{t('Zelfstandig oefenen')}</h4>
  <div className="statgrid compact">
   <StatTile icon={Dumbbell} value={s.pr.sessions} label={t('Oefeningen voltooid')} hint={t('{0} vragen beantwoord',s.pr.answered)}/>
   <StatTile icon={CheckCircle2} tone="mint" value={s.pr.pct!==null?s.pr.pct+'%':'—'} label={t('Correct beantwoord')}/>
   <StatTile icon={Flame} tone="coral" value={s.st.current} label={t('Huidige reeks (dagen)')} hint={t('Langste reeks: {0}',s.st.longest)}/>
  </div>
  <p className="muted small">{t('Oefentijd wordt nog niet betrouwbaar gemeten en wordt daarom niet getoond.')}</p>
  <h4 className="stats-h">{t('Woordenschat')}</h4>
  <div className="statgrid compact">
   <StatTile icon={Languages} value={s.voc.total} label={t('In je woordenbank')} hint={t('{0} nieuw in deze periode',s.voc.added)}/>
   <StatTile icon={Dumbbell} tone="sky" value={s.voc.practised} label={t('Geoefend')}/>
   <StatTile icon={CheckCircle2} tone="mint" value={s.voc.mastered} label={t('Aantoonbaar beheerst')}/>
   <StatTile icon={AlertCircle} tone="coral" value={s.voc.review} label={t('Herhaling nodig')}/>
  </div>
  <h4 className="stats-h">{t('Huiswerk en grammatica')}</h4>
  <div className="statgrid compact">
   <StatTile icon={ClipboardList} value={`${s.hw.done}/${s.hw.assigned}`} label={t('Huiswerk afgerond')} hint={t('{0} open · {1} met feedback',s.hw.open,d.reviewed)}/>
   <StatTile icon={Route} tone="mint" value={s.gr.covered} label={t('Onderwerpen behandeld')} hint={t('{0} beheerst · {1} in ontwikkeling',s.gr.mastered,s.gr.developing)}/>
   <StatTile icon={Target} tone="coral" value={s.gr.extra} label={t('Extra oefening nodig')}/>
  </div>
  <div className="chart-grid">
   <ChartCard className="span2" title={t('Oefenactiviteit')} subtitle={t('Oefensessies per week · gemeten')} empty={charts.practice.every(x=>none(x.value))} emptyText={t('Nog geen oefensessies opgeslagen.')} table={charts.practice}><BarChart data={charts.practice} color={CHART.coral}/></ChartCard>
   <ChartCard title={t('Correcte antwoorden')} subtitle={t('% per week · gemeten')} empty={charts.correct.every(x=>none(x.value))} emptyText={t('Nog geen beantwoorde vragen.')} table={charts.correct}><BarChart data={charts.correct} color={CHART.teal} unit="%"/></ChartCard>
   <ChartCard className="span2" title={t('Groei van je woordenbank')} subtitle={t('Aantal woorden aan het eind van de maand')} empty={!d.vocab.length} emptyText={t('Nog geen woorden in je woordenbank.')} table={charts.words}><LineChart data={charts.words} color={CHART.violet}/></ChartCard>
   <ChartCard title={t('Lestijd per maand')} subtitle={t('Minuten · alleen gemeten lessen')} empty={charts.minutes.every(x=>none(x.value))} emptyText={t('Nog geen gemeten lestijd. Lestijd wordt gemeten sinds de klaslokaalregistratie.')} table={charts.minutes}><BarChart data={charts.minutes} color={CHART.teal} unit=" min"/></ChartCard>
   <ChartCard title={t('Grammatica beheerst')} subtitle={t('Onderwerpen op “beheerst” gezet per maand · docentbeoordeling')} empty={charts.mastered.every(x=>none(x.value))} emptyText={t('Nog geen onderwerpen als beheerst gemarkeerd.')} table={charts.mastered}><BarChart data={charts.mastered} color={CHART.ochre}/></ChartCard>
  </div>
 </div>
}

/** Werkpunten: recurring CERTAIN mistakes from published reports (teacher-removed ones left out), grouped per topic. */
type Point={key:string;label:string;count:number;lessons:number;original:string;corrected:string;why:string;last:string;status?:string};
export function Werkpunten({studentId}:{studentId:string}){
 const [list,setList]=useState<Point[]|null>(null);const [all,setAll]=useState(false);
 useEffect(()=>{let off=false;const db=supabase()!;void Promise.all([db.rpc('student_lesson_summaries',{sid:studentId}),db.rpc('memory_focus',{sid:studentId})]).then(([s,f])=>{
  const focus=new Map(((f.error?[]:f.data||[]) as {key:string;status:string}[]).map(x=>[x.key,x.status]));const m=new Map<string,Point&{days:Set<string>}>();
  for(const r of (s.data||[]) as {lesson_date:string;final:unknown}[]){const doc=r.final as {categories?:{key:string;explanation?:string}[]}|null;
   for(const e of errorsOf(r.final as never).filter(e=>e.status!=='rejected'&&!e.later&&e.certainty==='certain'&&e.original&&e.corrected)){
    const x=m.get(e.category_key)||{key:e.category_key,label:e.category,count:0,lessons:0,original:'',corrected:'',why:'',last:'',days:new Set<string>(),status:focus.get(e.category_key)};
    x.count+=e.repeats||1;x.days.add(r.lesson_date);
    if(r.lesson_date>=x.last){x.last=r.lesson_date;x.original=e.original;x.corrected=e.corrected;x.why=e.why||doc?.categories?.find(c=>c.key===e.category_key)?.explanation||x.why}
    m.set(e.category_key,x)}}
  if(!off)setList([...m.values()].map(x=>({...x,lessons:x.days.size})).sort((a,b)=>(b.status==='review'?1:0)-(a.status==='review'?1:0)||b.lessons-a.lessons||b.count-a.count))});return()=>{off=true}},[studentId]);
 if(!list)return <div className="loader small"/>;
 if(!list.length)return <p className="muted">{t('Nog geen terugkerende werkpunten. Ze verschijnen na lesverslagen met verbeteringen.')}</p>;
 const shown=all?list:list.slice(0,6);
 return <div className="werkpunten">
  <p className="muted small">{t('Alleen zekere verbeteringen uit je gepubliceerde lesverslagen; door je docent verwijderde fouten tellen niet mee.')}</p>
  <ul className="wp-list">{shown.map(x=><li key={x.key} className={'wp'+(x.status==='review'?' review':'')}>
   <div className="wp-head"><b>{x.label}</b><span className="tag">{t('{0}× in {1} lessen',x.count,x.lessons)}</span>{x.status==='review'&&<span className="tag uncertain">{t('Herhaling nodig')}</span>}</div>
   <p className="wp-ex"><s>{x.original}</s> → <b>{x.corrected}</b></p>
   {x.why&&<p className="muted small">{x.why}</p>}
   <Link className="button small secondary" href={`/oefenen?student=${studentId}&onderwerp=${encodeURIComponent(x.label)}#zelf`}><Dumbbell size={14}/> {t('Oefenen')}</Link>
  </li>)}</ul>
  {list.length>6&&<button className="linklike" onClick={()=>setAll(a=>!a)}>{all?t('Minder tonen'):t('Alle {0} werkpunten tonen',list.length)}</button>}
 </div>
}

type HubTab='stats'|'leerlijn'|'werkpunten';
/** The student's Voortgang: three tabs, only the open tab loads its data. */
export function ProgressHub({student,initial}:{student:React.ComponentProps<typeof LearningPath>['student']&{id:string};initial?:string|null}){
 const [tab,setTab]=useState<HubTab>(initial==='leerlijn'||initial==='werkpunten'?initial:'stats');
 const TABS:[HubTab,string,typeof TrendingUp][]=[['stats','Statistieken',TrendingUp],['leerlijn','Mijn leerlijn',Route],['werkpunten','Werkpunten',Target]];
 return <div className="progress-hub">
  <nav className="tabs hub-tabs" role="tablist">{TABS.map(([k,l,I])=><button key={k} role="tab" aria-selected={tab===k} className={tab===k?'active':''} onClick={()=>setTab(k)}><I size={15}/> {t(l)}</button>)}</nav>
  <section className="card">{tab==='stats'?<StatsView ids={[student.id]}/>:tab==='leerlijn'?<LearningPath student={student} viewer="student"/>:<Werkpunten studentId={student.id}/>}</section>
 </div>
}
