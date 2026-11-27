'use client';
// v75: the student's daily start page — compact card grid. One data source (useStats: the same as Voortgang), XP derived
// from stored activities (lib/motivation, never twice), experience levels separate from CEFR. Details live in Voortgang.
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {Flame,Zap,Target,Languages,Route,Trophy,BookOpenCheck,Clock3,GraduationCap,ClipboardList,Dumbbell,Star} from 'lucide-react';
import {t,locale} from '../lib/i18n';
import {supabase} from '../lib/supabase';
import {Flag} from './Flag';
import {languageName} from '../lib/languages';
import {useStats} from './Progress';
import {motivationOf,useWeekGoal} from './Motivation';
import {useDaily} from './DailyPractice';
import {RouteCard} from './DailyRoute';
import {levelOf,type Milestone} from '../lib/motivation';
import {vocabStats,wordGrowth} from '../lib/progressStats';
import {LineChart,CHART} from './Charts';
import {visibleGoals,recommendTopics} from '../lib/curriculum/topics';

type Props={studentId:string;lang:string;level?:string|null;first?:string};
export function StudentDash({studentId,lang,level,first}:Props){
 const {d}=useStats([studentId]);const [goal,setGoal]=useWeekGoal(lang);
 const m=useMemo(()=>d?motivationOf(d,goal):null,[d,goal]);
 const xp=m?.xp.total??0;const lv=levelOf(xp);
 const ms=useMemo(()=>m?[...m.ms,...(lv.level>=2?[{key:'lvl'+lv.level,label:'Nieuw XP-level bereikt',icon:'goal' as const,date:null}]:[])]:[],[m,lv.level]);
 return <div className="sd">
  <header className="sd-head">
   <h1>{first?t('Hoi {0} 👋',first):t('Welkom terug 👋')}</h1>
   <div className="sd-pills">
    {lang&&<span className="pill"><Flag code={lang} size={16}/> {languageName(lang)}</span>}
    {level&&<span className="pill" title={t('Taalniveau (ingesteld door je docent)')}><GraduationCap size={14}/> {level}</span>}
    <span className="pill tone-gold" title={t('Dagen op rij geoefend')}><Flame size={14}/> {m?m.s.st.current:'…'}</span>
    <span className="pill tone-violet" title={t('Totale XP')}><Zap size={14}/> {m?xp:'…'} {t('XP')}</span>
   </div>
  </header>
  <div className="sd-top">
   <RouteCard studentId={studentId} level={level} lang={lang}/>
   <NextLessonSlot/>
  </div>
  <section className="sd-card sd-journey tone-violet">
   <div className="j-left"><span className="j-lv"><Star size={16}/> {t('Level {0}',lv.level)}</span><b className="j-xp">{xp} {t('XP')}</b>
    <div className="bar big"><span style={{width:(lv.into/lv.need*100)+'%'}}/></div><small className="muted">{t('Nog {0} XP tot level {1}',lv.toNext,lv.level+1)}</small></div>
   <div className="j-stats">
    <span><GraduationCap size={15}/><b>{level||'—'}</b><small>{t('CEFR-niveau')}</small></span>
    <span><Languages size={15}/><b>{m?m.s.voc.total:'…'}</b><small>{t('woorden')}</small></span>
    <span><BookOpenCheck size={15}/><b>{m?m.s.les.count:'…'}</b><small>{t('lessen')}</small></span>
    <span><Clock3 size={15}/><b>{m&&m.s.les.measured?t('{0} u {1} min',Math.floor(m.s.les.minutes/60),m.s.les.minutes%60):'—'}</b><small>{t('lestijd')}</small></span>
   </div>
   <p className="j-note muted">{t('XP-levels staan los van je taalniveau en je leerlijn.')}</p>
  </section>
  <div className="sd-grid">
   {m&&<section className="sd-card tone-gold sd-week"><h3><Flame size={16}/> {t('Week en reeks')}</h3>
    <div className="wk-nums"><span><b>{m.s.st.current}</b><small>{t('dagen op rij')}</small></span><span><b>{m.s.st.longest}</b><small>{t('langste reeks')}</small></span><span><b>{m.week.done}/{goal}</b><small>{t('deze week')}</small></span></div>
    <div className="week-dots">{m.week.week.map((x,i)=><span key={x.day} className={'wd'+(x.done?' on':'')+(x.future?' fut':'')} title={x.day}>{t(['ma','di','wo','do','vr','za','zo'][i])}</span>)}</div>
    <div className="row between"><small className={m.week.reached?'ok-text':'muted'}>{m.week.reached?t('Weekdoel gehaald! 🎉'):t('Nog {0} oefendag(en) voor je weekdoel',Math.max(0,goal-m.week.done))}</small>
     <select className="cell" aria-label={t('Weekdoel')} value={goal} onChange={e=>setGoal(Number(e.target.value))}>{[3,5,7].map(n=><option key={n} value={n}>{n===7?t('Elke dag'):t('{0} dagen per week',n)}</option>)}</select></div>
   </section>}
   {d&&<WordsCard studentId={studentId} vocab={d.vocab}/>}
   <GrammarCard studentId={studentId} lang={lang} level={level||'A1'}/>
   {ms.length>0&&<section className="sd-card sd-ach"><h3><Trophy size={16}/> {t('Recente prestaties')}</h3><ul>{ms.slice(0,3).map(x=><Ach key={x.key} m={x}/>)}</ul><Link className="textlink" href="/voortgang">{t('Alle prestaties')} →</Link></section>}
  </div>
 </div>
}
function Ach({m}:{m:Milestone}){const I=m.icon==='lesson'?BookOpenCheck:m.icon==='homework'?ClipboardList:m.icon==='words'?Languages:m.icon==='grammar'?GraduationCap:m.icon==='time'?Clock3:Target;
 return <li><span className={'ach-ic ic-'+m.icon}><I size={15}/></span><span><b>{t(m.label)}</b>{m.date&&<small className="muted block">{new Date(m.date+'T12:00:00').toLocaleDateString(locale(),{day:'numeric',month:'short'})}</small>}</span></li>}

import {NextLessonPanel} from './Agenda';
function NextLessonSlot(){return <NextLessonPanel mode="student" compact/>}

function WordsCard({studentId,vocab}:{studentId:string;vocab:Parameters<typeof vocabStats>[0]}){
 const w=vocabStats(vocab,'week');const g=wordGrowth(vocab,6);
 return <Link className="sd-card tone-green sd-words" href={'/mijn-profiel?student='+encodeURIComponent(studentId)+'&tab=woorden'}>
  <h3><Languages size={16}/> {t('Woordenbank')}</h3>
  <div className="wk-nums"><span><b>{w.total}</b><small>{t('woorden')}</small></span><span><b>+{w.added}</b><small>{t('deze week')}</small></span><span><b>{w.practised}</b><small>{t('geoefend')}</small></span><span><b>{w.mastered}</b><small>{t('beheerst')}</small></span></div>
  {vocab.length?<LineChart data={g} color={CHART.teal}/>:<p className="muted small">{t('Nog geen woorden in je woordenbank.')}</p>}
 </Link>
}

/** Summary of the personal learning line (same data as the teacher's), max. two concrete recommendations. */
export type LineSummary={mastered:number;dev:number;extra:number;atLevel:number;doneAtLevel:number;recs:{id:string;title:string;reason:string}[]};
/** The personal learning line in short (same data as the teacher's): counts and the top recommendations. No AI. */
export function useLineSummary(studentId:string,lang:string,level:string,n=2){
 const [x,setX]=useState<LineSummary|null>(null);
 useEffect(()=>{if(!lang)return;let off=false;const db=supabase()!;
  void Promise.all([db.from('curriculum_goals').select('id,level,title,code,sort').eq('subject',lang),db.from('student_goal_progress').select('goal_id,status,updated_at,lesson_date,hidden,title_override').eq('student_id',studentId)]).then(([g,p])=>{
   if(off)return;const prog=new Map(((p.data||[]) as {goal_id:string;status:string;updated_at:string|null;lesson_date:string|null;hidden:boolean|null;title_override:string|null}[]).map(r=>[r.goal_id,r]));
   const goals=visibleGoals((g.data||[]) as {id:string;level:string;title:string;code:string|null;sort:number}[],lang).map(r=>({...r,status:prog.get(r.id)?.status||'not_started',updated_at:prog.get(r.id)?.updated_at,lesson_date:prog.get(r.id)?.lesson_date,hidden:!!prog.get(r.id)?.hidden,title:prog.get(r.id)?.title_override||r.title})).filter(r=>!r.hidden);
   const L=level.toUpperCase();const at=goals.filter(r=>r.level===L);
   const recs=recommendTopics(goals,{level:L},n).map(r=>{const gg=goals.find(z=>z.id===r.id)!;return {id:r.id,title:gg.title,reason:r.reason}});
   setX({mastered:goals.filter(r=>r.status==='mastered').length,dev:goals.filter(r=>r.status==='in_progress'||r.status==='covered').length,extra:goals.filter(r=>r.status==='review').length,atLevel:at.length,doneAtLevel:at.filter(r=>r.status==='mastered').length,recs})});
  return()=>{off=true}},[studentId,lang,level,n]);
 return x;
}
function GrammarCard({studentId,lang,level}:{studentId:string;lang:string;level:string}){
 const x=useLineSummary(studentId,lang,level,2);
 if(!x)return <section className="sd-card tone-violet"><div className="loader small"/></section>;
 return <section className="sd-card tone-violet sd-gram"><h3><Route size={16}/> {t('Grammatica')}</h3>
  <div className="wk-nums"><span><b>{x.mastered}</b><small>{t('beheerst')}</small></span><span><b>{x.dev}</b><small>{t('in ontwikkeling')}</small></span><span><b>{x.extra}</b><small>{t('extra oefenen')}</small></span></div>
  {x.atLevel>0&&<><small className="muted">{t('Niveau {0}: {1} van {2} onderwerpen beheerst',level,x.doneAtLevel,x.atLevel)}</small><div className="bar"><span style={{width:(x.doneAtLevel/x.atLevel*100)+'%'}}/></div></>}
  {x.recs.length>0&&<ul className="gram-recs">{x.recs.map(r=><li key={r.id}><span>{r.title}</span><Link className="button small secondary" href={`/oefenen?student=${studentId}&onderwerp=${encodeURIComponent(r.title)}#zelf`}><Dumbbell size={13}/> {t('Oefenen')}</Link></li>)}</ul>}
  <Link className="textlink" href="/voortgang?tab=leerlijn">{t('Mijn leerlijn')} →</Link>
 </section>
}
