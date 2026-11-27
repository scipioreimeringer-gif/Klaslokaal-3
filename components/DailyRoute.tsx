'use client';
// v76: the daily learning route — ONE central session per relation (= learning language) and local day, shared by
// Overzicht and Oefenen. Round 1 is the personal daily challenge (keeps the streak); the next rounds open the EXISTING
// games with a frozen deck. Progress (round, position inside it, results) is stored in daily_runs.route, so a refresh,
// a new login or another device continues exactly there; nothing is generated again when a route is resumed.
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {Sparkles,Play,Flame,Zap,CheckCircle2,ArrowRight,X,Clock3,Shuffle,PartyPopper} from 'lucide-react';
import {t} from '../lib/i18n';
import {supabase} from '../lib/supabase';
import {useExplainLang} from './ExplainLang';
import {useGameSets,Flashcards,Quiz,Typing,TypeGame,Match,type Ctx,type GameSets} from './Learning';
import {DailyPlayer,useDaily} from './DailyPractice';
import {useStats} from './Progress';
import {motivationOf,useWeekGoal} from './Motivation';
import {asLvl} from '../lib/practice';
import {seedOf} from '../lib/daily';
import {levelOf} from '../lib/motivation';
import {planRoute,roundXp,routeProgress,routeMinutes,routeXpMax,ROUND_LABEL,type RouteState,type RoundKind} from '../lib/route';
import type {Card,TItem} from '../lib/practice';

const today=()=>new Date().toLocaleDateString('en-CA');
const lsKey=(sid:string,day:string)=>'teachy-route-'+sid+'-'+day;
type R=RouteState&{rs?:number;topics?:string[];words?:string[]};

/** Today's route of one relation: the server copy (daily_runs.route) first, this device as fallback. */
export function useRoute(studentId:string){
 const day=today();const [route,setRoute]=useState<R|null|undefined>(undefined);
 const load=useCallback(async()=>{
  const r=await supabase()!.from('daily_runs').select('route').eq('student_id',studentId).eq('day',day).maybeSingle();
  let srv=!r.error&&r.data?(r.data as {route:R|null}).route:null;
  let loc:R|null=null;try{loc=JSON.parse(localStorage.getItem(lsKey(studentId,day))||'null')}catch{/* private mode */}
  if(loc&&srv&&(loc.cur>srv.cur||(loc.cur===srv.cur&&loc.pos>srv.pos)))srv=loc; // the furthest copy wins (offline answers)
  setRoute(srv||loc||null)},[studentId,day]);
 useEffect(()=>{void load()},[load]);
 const save=useCallback((next:R)=>{setRoute(next);try{localStorage.setItem(lsKey(studentId,day),JSON.stringify(next))}catch{/* private mode */}
  void supabase()!.from('daily_runs').update({route:next,updated_at:new Date().toISOString()}).eq('student_id',studentId).eq('day',day).then(()=>undefined,()=>undefined)},[studentId,day]);
 return {route,save,reload:load,day};
}
function available(s:GameSets):Partial<Record<RoundKind,unknown[]>>{
 const W=s.words.cards;
 return {flashcards:W.slice(0,5),typing:W.slice(5,9).length>=3?W.slice(5,9):W.slice(0,4),quiz:W.slice(0,6),conjugate:s.conjugate,match:s.pairs.cards,sentence:s.sentence,errors:s.errors};
}

export function DailyRoute({studentId,lang,level,userId,mode='daily',autoStart=false}:{studentId:string;lang:string;level?:string|null;userId:string;mode?:'daily'|'mixed';autoStart?:boolean}){
 const day=today();const lvl=asLvl(level||'A1');
 const [seed,setSeed]=useState(()=>mode==='daily'?seedOf(studentId+'|'+day)%2147483647:Date.now()%2147483647);
 const {sets}=useGameSets(studentId,lang,lvl,seed);
 const daily=useRoute(studentId);const [mixed,setMixed]=useState<R|null>(null);
 const r=mode==='daily'?daily.route:mixed;
 const save=(x:R)=>mode==='daily'?daily.save(x):setMixed(x);
 const [ex]=useExplainLang(lang,studentId);
 const [between,setBetween]=useState<{kind:RoundKind;score:number;total:number;xp:number}|null>(null);
 // plan once: today's route is stored and reused; a mixed practice gets a fresh plan (new seed) every time
 useEffect(()=>{if(!sets)return;if(mode==='daily'&&daily.route===null)save(planRoute(day,available(sets),{level:lvl}));if(mode==='mixed'&&!mixed)setMixed(planRoute(day,available(sets),{level:lvl,mixed:true}))},[sets,daily.route,mixed]);// eslint-disable-line react-hooks/exhaustive-deps
 const startPos=useRef<{cur:number;pos:number}|null>(null);
 if(r&&(!startPos.current||startPos.current.cur!==r.cur))startPos.current={cur:r.cur,pos:r.pos};
 const live=useRef(r);live.current=r;
 function step(ok:boolean,kind:RoundKind){const x=live.current;if(!x||x.done)return;if(kind==='match'&&!ok)return;
  const next={...x,pos:x.pos+1,rs:(x.rs||0)+(ok?1:0)};live.current=next;save(next)}
 function finish(score:number,total:number,first=false,topics?:string[]){const x=live.current;if(!x||x.done)return;const rd=x.rounds[x.cur];
  const xp=roundXp(rd.kind,total,first);const cur=x.cur+1;const done=cur>=x.rounds.length;
  const words=rd.kind==='flashcards'||rd.kind==='match'||rd.kind==='typing'?(rd.items as Card[]).map(c=>c.term):[];
  const next:R={...x,cur,pos:0,rs:0,done,res:[...x.res,{score,total,xp}],topics:[...(x.topics||[]),...(topics||[])],words:[...(x.words||[]),...words]};
  live.current=next;save(next);setBetween({kind:rd.kind,score,total,xp})}
 if(!r||!sets)return <div className="loader small"/>;
 const prog=routeProgress(r);const rd=r.rounds[r.cur];
 const head=<div className="route-head">
  <div className="route-title"><b>{mode==='daily'?t('Dagelijkse leerroute'):t('Gemengde oefening')}</b>{!r.done&&rd&&<span className="muted">{t('Ronde {0} van {1}',r.cur+1,r.rounds.length)} · {t(ROUND_LABEL[rd.kind])}</span>}</div>
  <span className="route-xp"><Zap size={14}/> {prog.xp} {t('XP')}</span>
  <Link className="iconbtn" href="/oefenen" title={t('Stoppen (je voortgang blijft bewaard)')} aria-label={t('Stoppen')}><X size={16}/></Link>
  <div className="route-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prog.pct}><span style={{width:prog.pct+'%'}}/></div></div>;
 if(between&&!r.done){const nx=r.rounds[r.cur];return <div className="route">{head}<div className="route-between">
  <CheckCircle2 size={30} className="ok-ic"/><h3>{t(ROUND_LABEL[between.kind])}: {t('{0} van {1} goed',between.score,between.total)}</h3>
  {between.xp>0&&<p className="xp-earned"><Zap size={15}/> {t('+{0} XP',between.xp)}</p>}
  <p className="muted">{t('Volgende: {0}',t(ROUND_LABEL[nx.kind]))}</p>
  <button className="button big" autoFocus onClick={()=>setBetween(null)}>{t('Volgende ronde')} <ArrowRight size={16}/></button></div></div>}
 if(r.done)return <div className="route">{head}<RouteEnd studentId={studentId} lang={lang} r={r} mode={mode} again={()=>{setBetween(null);setSeed(s=>(s*48271+11)%2147483647);setMixed(null)}}/></div>;
 const ctx:Ctx={studentId,lang,level:lvl,ex,onStep:ok=>step(ok,rd.kind)};
 const from=startPos.current?.pos||0;const items=(rd.items||[]).slice(from);const quit=(label:string)=>{if(label==='')window.location.assign('/oefenen');};
 const done=(label:string)=>{if(label===''){quit('');return}finish(live.current?.rs||0,rd.n)};
 const key=r.cur+'-'+from;
 return <div className="route">{head}
  {rd.kind==='daily'?<DailyPlayer studentId={studentId} level={level} lang={lang} userId={userId} autoStart={autoStart} onRoundDone={(s,tot,first,topics)=>finish(s,tot,first,topics)}/>
  :rd.kind==='flashcards'?<Flashcards key={key} deck={items as Card[]} ctx={ctx} onDone={done}/>
  :rd.kind==='typing'?<Typing key={key} deck={items as Card[]} ctx={ctx} onDone={done}/>
  :rd.kind==='quiz'?<Quiz key={key} deck={items as Card[]} pool={sets.quizPool} extra={sets.gquiz.slice(0,2)} ctx={ctx} onDone={done}/>
  :rd.kind==='match'?<Match key={key} deck={items as Card[]} ctx={ctx} onDone={done}/>
  :rd.kind==='conjugate'?<TypeGame key={key} title={t('Werkwoorden vervoegen')} intro={t('Schrijf de juiste vorm van het werkwoord. Je ziet het hele werkwoord, de tijd en de persoon.')} kind="conjugate" items={items as TItem[]} ctx={ctx} onDone={done} conj/>
  :rd.kind==='sentence'?<TypeGame key={key} title={t('Zinnen aanvullen')} intro={t('Vul het ontbrekende woord in. De hint helpt je op weg.')} kind="sentence" items={items as TItem[]} ctx={ctx} onDone={done}/>
  :<TypeGame key={key} title={t('Fouten verbeteren')} intro={t('Schrijf de hele zin opnieuw, zonder fout.')} kind="errors" items={items as TItem[]} ctx={ctx} onDone={done} long/>}
 </div>
}

function RouteEnd({studentId,lang,r,mode,again}:{studentId:string;lang:string;r:R;mode:'daily'|'mixed';again:()=>void}){
 const {d}=useStats([studentId]);const [goal]=useWeekGoal(lang);const m=useMemo(()=>d?motivationOf(d,goal):null,[d,goal]);
 const answered=r.res.reduce((a,b)=>a+b.total,0),correct=r.res.reduce((a,b)=>a+b.score,0),xp=r.res.reduce((a,b)=>a+b.xp,0);const lv=m?levelOf(m.xp.total):null;
 return <div className="route-end">
  <PartyPopper size={36} className="dp-party" aria-hidden/>
  <h2>{mode==='daily'?t('Dagdoel bereikt!'):t('Gemengde oefening klaar!')}</h2>
  <div className="route-end-nums"><span><b>{answered}</b><small>{t('vragen beantwoord')}</small></span><span><b>{correct}</b><small>{t('goed')}</small></span><span className="tone-violet"><b>+{xp}</b><small>{t('XP')}</small></span>{m&&<span className="tone-gold"><b>{m.s.st.current}</b><small>{t('dagen op rij')}</small></span>}</div>
  {lv&&<div className="route-lv"><small>{t('Level {0}',lv.level)} · {t('Nog {0} XP tot level {1}',lv.toNext,lv.level+1)}</small><div className="bar"><span style={{width:(lv.into/lv.need*100)+'%'}}/></div></div>}
  {!!r.topics?.length&&<div className="dp-list"><h4>{t('Geoefende grammatica')}</h4><ul className="chips">{[...new Set(r.topics)].slice(0,6).map(x=><li key={x}>{x}</li>)}</ul></div>}
  {!!r.words?.length&&<div className="dp-list"><h4>{t('Geoefende woorden')}</h4><ul className="chips">{[...new Set(r.words)].slice(0,10).map(x=><li key={x}>{x}</li>)}</ul></div>}
  <div className="row">{mode==='mixed'?<button className="button" onClick={again}><Shuffle size={15}/> {t('Nog een gemengde oefening')}</button>:<Link className="button" href={'/oefenen/dagelijks?student='+encodeURIComponent(studentId)+'&mix=1'}><Shuffle size={15}/> {t('Verder oefenen')}</Link>}
   <Link className="button secondary" href="/">{t('Terug naar Overzicht')}</Link></div>
  {mode==='daily'&&<p className="muted small">{t('Morgen staat er een nieuwe leerroute voor je klaar.')}</p>}
 </div>
}

/** The same route card on Overzicht and Oefenen: not started · in progress · done (green, compact). */
export function RouteCard({studentId,lang,level}:{studentId:string;lang:string;level?:string|null}){
 const {route}=useRoute(studentId);const {d}=useDaily(studentId,level,lang);
 const href='/oefenen/dagelijks?student='+encodeURIComponent(studentId);
 if(route===undefined||!d)return <section className="sd-card sd-daily"><div className="loader small"/></section>;
 if(!d.hasMaterial)return <section className="sd-card sd-daily"><Sparkles size={20}/><p>{t('Na je eerste lessen verschijnt hier je dagelijkse leerroute.')}</p></section>;
 const p=routeProgress(route);const started=!!route&&(route.cur>0||route.pos>0)||!!d.doneToday;
 if(route?.done)return <section className="sd-card sd-daily done"><CheckCircle2 size={28}/><div><b>{t('Dagdoel bereikt!')}</b><p>⚡ {t('+{0} XP vandaag',p.xp)} · <Flame size={13}/> {t('{0} dagen op rij',d.streak)}</p><small>{t('Morgen staat er een nieuwe leerroute klaar.')}</small>
  <Link className="button small light" href={href+'&mix=1'}>{t('Verder oefenen')}</Link></div></section>;
 const rounds=route?route.rounds.length:6, minutes=route?routeMinutes(route):16, xpMax=route?routeXpMax(route):70;
 return <section className="sd-card sd-daily"><div className="sd-daily-top"><span className="sd-daily-ic"><Sparkles size={22}/></span><div><span className="eyebrow">{t('DAGELIJKSE LEERROUTE')}</span><h2>{started?t('Ronde {0} van {1}',Math.min(p.roundsDone+1,rounds),rounds):t('{0} korte oefenrondes',rounds)}</h2></div></div>
  <div className="sd-daily-facts"><span><Clock3 size={14}/> {t('± {0} min',minutes)}</span><span><Zap size={14}/> {started?t('{0} van {1} XP',p.xp,xpMax):t('+{0} XP',xpMax)}</span><span><Flame size={14}/> {t('{0} dagen op rij',d.streak)}</span></div>
  <div className="route-bar light" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.pct}><span style={{width:p.pct+'%'}}/></div>
  <Link className="button light big" href={started?href:href+'&start=1'}><Play size={16}/> {started?t('Verder oefenen'):t('Nu beginnen')}</Link></section>
}
