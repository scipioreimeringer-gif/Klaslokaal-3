'use client';
import {planBlocks,type Focus} from '../lib/homework/plan';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Plus,Trash2,Search,Check,X,RotateCcw,Shuffle,Eye,Sparkles,Layers,ListChecks,Keyboard,Puzzle,Trophy,Flag} from 'lucide-react';
import {niceDate} from '../lib/data';
import {supabase} from '../lib/supabase';
import {addVocab,authedPost,loadVocab,LEVELS,VOCAB_STATUS_LABEL,type VocabItem} from '../lib/learning';
import {checkText,mcOptions,practiceOrder} from '../lib/answers';
import {wordDeck,quizOptions,sentenceSet,conjugationSet,correctionSet,idiomQuestions,progressOf,levelNum,rng,shuffle,DECK,MATCH,type Lvl,type OwnWord,type Card,type TItem,type SessionRow,ownConjugations} from '../lib/practice';
import {grammarBank,type GItem,type Note} from '../lib/grammar';
import {loadBank,type BankItem} from '../lib/wordbank';
import {errorsOf} from '../lib/analysis/core';
const hasGrammar=(lang:string)=>grammarBank(lang).length>0;
import {PenLine,Repeat,Wrench,CalendarDays,Clock3} from 'lucide-react';
import {Select} from './Select';
import {InfoTip} from './InfoTip';
import {posIcon,posKindOf,POS_GROUP_ORDER,POS_GROUP_TITLE} from '../lib/vocab/grammar';
import {filterVocab,vocabFacets,type VocabFilter} from '../lib/vocab/filter';
import {t as tt, translated, locale} from '../lib/i18n';

/* ========================= Vocabulary ========================= */
/** Teacher: words recognised on the canvas or in the AI lesson analysis, waiting for review. Nothing enters the list unseen. */
type Sug={id:string;term:string;translation:string;example:string;pos:string|null;kind:'word'|'expression';lang:string|null;origin:'canvas'|'analysis';lesson_date:string|null;lesson_id:string|null;source_page:string|null};
function Suggestions({studentId,onAdded}:{studentId:string;onAdded:()=>void}){
 const [rows,setRows]=useState<Sug[]|null>(null);const [msg,setMsg]=useState('');const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{const r=await supabase()!.from('vocab_suggestions').select('id,term,translation,example,pos,kind,lang,origin,lesson_date,lesson_id,source_page').eq('student_id',studentId).eq('status','pending').order('created_at');
  if(r.error){setRows([]);if(!/vocab_suggestions|PGRST205/.test(r.error.message))setMsg(r.error.message);return}setRows((r.data||[]) as Sug[])},[studentId]);
 useEffect(()=>{void load()},[load]);
 async function scan(){setBusy(true);setMsg('');try{const r=await authedPost<{added:number;scannedPages:number;direct?:boolean}>(supabase()!,'/api/vocab/detect',{studentId});setMsg(r.added?(r.direct?tt('{0} nieuwe woorden toegevoegd aan de woordenlijst. Je kunt ze hieronder aanpassen of verwijderen.',r.added):tt('{0} nieuwe woorden gevonden. Controleer ze hieronder.',r.added)):r.scannedPages?tt('Geen nieuwe woorden gevonden op het canvas.'):tt('Het canvas is niet veranderd sinds de vorige keer.'));await load();if(r.direct)onAdded()}catch(e){setMsg(e instanceof Error?e.message:String(e))}setBusy(false)}
 async function accept(list:Sug[]){setBusy(true);const db=supabase()!;let added=0;
  for(const s of list){const r=await db.from('vocab_items').insert({student_id:studentId,term:s.term.trim(),translation:s.translation.trim(),example:s.example.trim(),kind:s.kind,pos:s.pos||null,lang:s.lang,source:s.origin==='analysis'?'ai':'canvas',lesson_date:s.lesson_date,lesson_id:s.lesson_id,source_page:s.source_page});
   if(!r.error)added++;await db.from('vocab_suggestions').update({status:'accepted',decided_at:new Date().toISOString(),term:s.term.trim(),translation:s.translation.trim()}).eq('id',s.id)}
  setMsg(tt('{0} woorden toegevoegd aan de woordenlijst.',added));setBusy(false);await load();onAdded()}
 async function reject(s:Sug){await supabase()!.from('vocab_suggestions').update({status:'rejected',decided_at:new Date().toISOString()}).eq('id',s.id);await load()}
 const up=(id:string,p:Partial<Sug>)=>setRows(x=>x?.map(r=>r.id===id?{...r,...p}:r)||null);
 if(!rows)return null;
 return <section className="vocab-suggest">
  <div className="row between wrap"><h4><Sparkles size={15}/> {tt('Voorgestelde woorden')} {rows.length>0&&<span className="tag">{rows.length}</span>}</h4>
   <div className="row wrap"><button className="button small secondary" disabled={busy} onClick={()=>void scan()}>{tt('Woorden van het canvas herkennen')}</button>{rows.length>1&&<button className="button small" disabled={busy} onClick={()=>void accept(rows)}><Check size={14}/> {tt('Alles toevoegen')}</button>}</div></div>
  {msg&&<p className="muted" role="status">{msg}</p>}
  {rows.length?<table className="vocab edit">{/* v43: grouped per word class (nouns, verbs, adjectives, adverbs, prepositions, conjunctions, expressions); teacher edits each row */}
   {POS_GROUP_ORDER.map(k=>[k,rows.filter(s=>posKindOf(s.pos)===k)] as const).filter(([,g])=>g.length).map(([k,g])=><tbody key={k}><tr className="pos-group"><th colSpan={4}>{posIcon(g[0].pos)} {tt(POS_GROUP_TITLE[k])} <small className="muted">{g.length}</small></th></tr>{g.map(s=><tr key={s.id}>
   <td><input className="cell" value={s.term} onChange={e=>up(s.id,{term:e.target.value})} aria-label={tt('Woord')}/></td>
   <td><input className="cell" value={s.translation} onChange={e=>up(s.id,{translation:e.target.value})} aria-label={tt('Betekenis')}/></td>
   <td className="muted small-print">{s.pos?(posIcon(s.pos)+' '+s.pos).trim():''}{s.source_page?' · '+s.source_page:''}{s.origin==='analysis'?' · '+tt('AI-lesanalyse'):''}</td>
   <td className="row"><button className="button small" disabled={busy||!s.term.trim()} onClick={()=>void accept([s])}><Check size={13}/> {tt('Toevoegen')}</button><button className="iconbtn danger" title={tt('Afwijzen')} onClick={()=>void reject(s)}><X size={14}/></button></td></tr>)}</tbody>)}</table>
  :<p className="muted small-print">{tt('Geen voorstellen. Getypte tekst op het canvas wordt herkend; handgeschreven tekst op het bord niet, omdat die niet betrouwbaar te lezen is.')}</p>}
 </section>
}

/* v62: grammar of a word from the central word bank — compact line, full conjugation only when unfolded */
type Gram={pos?:string;article?:string;plural?:string;gender?:string;present?:string;past_sg?:string;past_pl?:string;participle?:string;aux?:string;aux_note?:string;separable?:string;conj_present?:string[];conj_past?:string[];inflected?:string;comparative?:string;superlative?:string};
function GrammarInfo({g}:{g?:Gram|null}){
 if(!g)return null;
 const line=g.pos==='noun'?[g.article,g.gender&&'('+g.gender+')',g.plural&&tt('mv.')+' '+g.plural].filter(Boolean).join(' ')
  :g.pos==='verb'?[g.present,[g.past_sg,g.past_pl].filter(Boolean).join(' / '),g.participle&&g.participle+(g.aux?' ('+g.aux+')':''),g.separable==='yes'?tt('scheidbaar'):g.separable==='no'?tt('onscheidbaar'):''].filter(Boolean).join(' · ')
  :g.pos==='adjective'?[g.inflected,g.comparative,g.superlative].filter(Boolean).join(' · '):'';
 if(!line&&!g.conj_present)return null;
 return <small className="block muted gram">{line}{g.aux==='H/Z'&&g.aux_note?' — '+g.aux_note:''}
  {(g.conj_present||g.conj_past)&&<details><summary>{tt('Vervoeging')}</summary>{g.conj_present&&<p>{g.conj_present.join(' · ')}</p>}{g.conj_past&&<p>{g.conj_past.join(' · ')}</p>}</details>}</small>
}
export function VocabManager({studentId,viewer}:{studentId:string;viewer:'teacher'|'student'}){
 const [items,setItems]=useState<VocabItem[]|null>(null);const [err,setErr]=useState('');const [q,setQ]=useState('');const [filter,setFilter]=useState<'all'|VocabItem['status']>('all');
 const [term,setTerm]=useState('');const [tr,setTr]=useState('');const [ex,setEx]=useState('');
 const [fx,setFx]=useState<VocabFilter>({lang:'all',pos:'all',level:'all',lesson:'all'});
 const [links,setLinks]=useState<Map<string,string[]>>(new Map());
 const load=useCallback(async()=>{const db=supabase()!;const r=await loadVocab(db,studentId);if(r.error)setErr(/vocab_items/.test(r.error)?tt("Database-update v28 ontbreekt: voer supabase/v28.sql uit."):r.error);setItems(r.items)
  // v46: every lesson a word appeared in (v47 table; without it: the word's own lesson date)
  const l=await db.from('vocab_lessons').select('vocab_id,lesson_date').eq('student_id',studentId);const m=new Map<string,string[]>();if(!l.error)for(const x of (l.data||[]) as {vocab_id:string;lesson_date:string}[])m.set(x.vocab_id,[...(m.get(x.vocab_id)||[]),x.lesson_date]);setLinks(m)},[studentId]);
 useEffect(()=>{void load()},[load]);
 const canEdit=(v:VocabItem)=>viewer==='teacher'||v.source==='student';
 async function add(){if(!term.trim())return;const r=await addVocab(supabase()!,studentId,[{term,translation:tr,example:ex}],viewer==='teacher'?'teacher':'student');if(!r.added)setErr(tt("Dit woord staat al in de lijst."));else{setErr('');setTerm('');setTr('');setEx('')}await load()}
 async function patch(v:VocabItem,p:Partial<VocabItem>){setItems(x=>x?.map(i=>i.id===v.id?{...i,...p}:i)||null);const r=await supabase()!.from('vocab_items').update({...p,updated_at:new Date().toISOString()}).eq('id',v.id);if(r.error)setErr(r.error.message)}
 async function del(v:VocabItem){if(!confirm(tt("\"{0}\" verwijderen?", v.term)))return;await supabase()!.from('vocab_items').delete().eq('id',v.id);await load()}
 if(!items)return <div className="loader small"/>;
 const counts={new:items.filter(i=>i.status==='new').length,practicing:items.filter(i=>i.status==='practicing').length,mastered:items.filter(i=>i.status==='mastered').length};
 // v44: filters on the ONE central word list (same rows as the word list of a lesson; one row per word)
 const rows=items.map(i=>({...i,lesson_dates:links.get(i.id)||(i.lesson_date?[i.lesson_date]:[])}));
 const facets=vocabFacets(rows);
 const shown=filterVocab(rows,{...fx,status:filter,q});
 return <div>
  {err&&<div className="notice">{err}</div>}
  {viewer==='teacher'&&<Suggestions studentId={studentId} onAdded={()=>void load()}/>}
  <div className="chipbar"><button aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>{tt("Alle ({0})", items.length)}</button>{(['new','practicing','mastered'] as const).map(s=><button key={s} aria-pressed={filter===s} onClick={()=>setFilter(s)}>{VOCAB_STATUS_LABEL[s]} ({counts[s]})</button>)}</div>
  <div className="vocab-filters" role="group" aria-label={tt("Filters")}>
   {facets.langs.length>1&&<Select size="sm" label={tt("Lestaal")} value={fx.lang} onChange={v=>setFx({...fx,lang:v})} options={[{value:'all',label:tt("Alle talen")},...facets.langs.map(l=>({value:l,label:l.toUpperCase()}))]}/>}
   <Select size="sm" label={tt("Woordsoort")} value={fx.pos} onChange={v=>setFx({...fx,pos:v})} options={[{value:'all',label:tt("Alle woordsoorten")},...facets.pos.map(p=>({value:p,label:tt(POS_GROUP_TITLE[p])}))]}/>
   {facets.levels.length>0&&<Select size="sm" label={tt("Niveau")} value={fx.level} onChange={v=>setFx({...fx,level:v})} options={[{value:'all',label:tt("Alle niveaus")},...facets.levels.map(l=>({value:l,label:l}))]}/>}
   {facets.lessons.length>0&&<Select size="sm" label={tt("Les")} value={fx.lesson} onChange={v=>setFx({...fx,lesson:v})} options={[{value:'all',label:tt("Alle lessen")},...facets.lessons.map(d=>({value:d,label:niceDate(d)}))]}/>}
   {(fx.lang!=='all'||fx.pos!=='all'||fx.level!=='all'||fx.lesson!=='all')&&<button type="button" className="linklike" onClick={()=>setFx({lang:'all',pos:'all',level:'all',lesson:'all'})}>{tt("Filters wissen")}</button>}
   <span className="muted small-print">{tt("{0} van {1} woorden",shown.length,items.length)}</span>
  </div>
  <form className="row vocab-add" onSubmit={e=>{e.preventDefault();void add()}}><input className="field" placeholder={tt("Woord of uitdrukking")} value={term} onChange={e=>setTerm(e.target.value)}/><input className="field" placeholder={tt("Betekenis")} value={tr} onChange={e=>setTr(e.target.value)}/><input className="field grow" placeholder={tt("Voorbeeldzin (optioneel)")} value={ex} onChange={e=>setEx(e.target.value)}/><button className="button small" type="submit"><Plus size={15}/> {tt("Toevoegen")}</button></form>
  <label className="searchbox"><Search size={16}/><input placeholder={tt("Zoeken…")} value={q} onChange={e=>setQ(e.target.value)}/></label>
  {!shown.length?<p className="muted">{tt("Nog geen woorden. Woorden uit de live les, goedgekeurde AI-analyses en woorden die je hier toevoegt, komen in deze lijst.")}</p>:
  <table className="vocab"><thead><tr><th>{tt("Woord")}</th><th>{tt("Betekenis")}</th><th>{tt("Voorbeeld")}</th><th>{tt("Status")}</th><th>{tt("Les")}</th><th>{tt("Bron")}</th><th/></tr></thead>{/* v46: grouped per word class */}{POS_GROUP_ORDER.map(k=>[k,shown.filter(v=>posKindOf(v.pos)===k)] as const).filter(([,g])=>g.length).map(([k,g])=><tbody key={k}><tr className="pos-group"><th colSpan={7}>{posIcon(g[0].pos)} {tt(POS_GROUP_TITLE[k])} <small className="muted">{g.length}</small></th></tr>{g.map(v=><tr key={v.id}>
   <td>{canEdit(v)?<input className="cell" value={v.term} onChange={e=>setItems(x=>x?.map(i=>i.id===v.id?{...i,term:e.target.value}:i)||null)} onBlur={e=>void patch(v,{term:e.target.value})}/>:<b>{v.term}</b>}<GrammarInfo g={(v as {grammar?:Gram|null}).grammar}/></td>
   <td>{canEdit(v)?<input className="cell" value={v.translation} onChange={e=>setItems(x=>x?.map(i=>i.id===v.id?{...i,translation:e.target.value}:i)||null)} onBlur={e=>void patch(v,{translation:e.target.value})}/>:v.translation}</td>
   <td className="muted">{canEdit(v)?<input className="cell" value={v.example} onChange={e=>setItems(x=>x?.map(i=>i.id===v.id?{...i,example:e.target.value}:i)||null)} onBlur={e=>void patch(v,{example:e.target.value})}/>:v.example}</td>
   <td>{viewer==='teacher'?<select className="cell" value={v.status} onChange={e=>void patch(v,{status:e.target.value as VocabItem['status']})}>{(['new','practicing','mastered'] as const).map(s=><option key={s} value={s}>{VOCAB_STATUS_LABEL[s]}</option>)}</select>:<span className={'vstat vs-'+v.status}>{VOCAB_STATUS_LABEL[v.status]}</span>}<small className="muted block">{v.correct_count}✓ {v.wrong_count}✗</small></td>
   <td className="muted small-print">{v.lesson_date?niceDate(v.lesson_date):niceDate(v.created_at)}{v.lesson_dates.length>1&&<small className="block">{tt('in {0} lessen',v.lesson_dates.length)}</small>}{v.pos?<small className="block">{(posIcon(v.pos)+' '+v.pos).trim()}</small>:null}</td>
   <td><span className="tag">{v.source==='lesson'?tt("les"):v.source==='ai'?tt("AI · goedgekeurd"):v.source==='canvas'?tt("canvas"):v.source==='student'?tt("zelf"):tt("docent")}</span>{v.difficult&&<span className="tag uncertain">{tt('moeilijk')}</span>}{viewer==='teacher'&&<button className="iconbtn" title={v.difficult?tt('Niet meer als moeilijk markeren'):tt('Markeren als moeilijk')} onClick={()=>void patch(v,{difficult:!v.difficult})}><Flag size={13}/></button>}</td>
   <td>{canEdit(v)&&<button className="iconbtn danger" title={tt("Verwijderen")} onClick={()=>void del(v)}><Trash2 size={14}/></button>}</td></tr>)}</tbody>)}</table>}
 </div>
}

/* ========================= Games ========================= */
/* v54: one set of question builders (lib/practice.ts) per learning language and CEFR level. Own words first; the
   built-in word bank and grammar only when needed, and then marked as such. Results per student (= per language
   relation), per game, with language and level in the details. Nothing can start with an empty or broken question. */
type GameKind='flashcards'|'quiz'|'typing'|'match'|'sentence'|'conjugate'|'errors';
const GAME_KINDS:GameKind[]=['flashcards','quiz','typing','match','sentence','conjugate','errors'];
type Ctx={studentId:string|null;lang:string;level:Lvl};
async function saveGameSession(ctx:Ctx,kind:string,score:number,total:number,started:number,details:Record<string,unknown>,assignmentId?:string|null){
 if(!ctx.studentId)return; // self-study without a teacher: nothing to store results with (no student record)
 const db=supabase()!;const {data:{user}}=await db.auth.getUser();if(!user)return;
 await db.from('practice_sessions').insert({student_id:ctx.studentId,user_id:user.id,kind,score,total,duration_seconds:Math.round((Date.now()-started)/1000),details:{...details,lang:ctx.lang,level:ctx.level},assignment_id:assignmentId||null});
}
const record=(id:string,ok:boolean)=>supabase()!.rpc('record_vocab_practice',{item:id,correct:ok});
/** spaced repetition for one answer: own word → word list; grammar / own mistake → practice_items (gr: / err:) */
function recordItem(ctx:Ctx,x:{vocabId?:string;itemKey?:string;label?:string},ok:boolean){
 if(!ctx.studentId)return;
 if(x.vocabId){void record(x.vocabId,ok);return}
 if(x.itemKey&&/^(gr|err):/.test(x.itemKey))void supabase()!.rpc('record_practice_item',{p_student:ctx.studentId,p_key:x.itemKey.slice(0,200),p_kind:x.itemKey.startsWith('err:')?'error':'grammar',p_label:(x.label||'').slice(0,120),p_correct:ok});
}
const BankTag=({on}:{on:boolean})=>on?<span className="tag pr-bank" title={tt('Niet uit je eigen woordenlijst')}>{tt('uit de oefenbank')}</span>:null;

export function VocabGames({studentId,lang,level,start}:{studentId:string|null;lang:string;level:Lvl;start?:string|null}){
 const ctx:Ctx={studentId,lang,level};
 const [own,setOwn]=useState<OwnWord[]|null>(null);const [bank,setBank]=useState<BankItem[]>([]);const [errs,setErrs]=useState<{key:string;original:string;corrected:string;why?:string}[]>([]);
 const [sessions,setSessions]=useState<SessionRow[]>([]);const [game,setGame]=useState<GameKind|null>(null);const [seed,setSeed]=useState(()=>Date.now()%2147483647);const [result,setResult]=useState('');const [due,setDue]=useState(0);
 const load=useCallback(async()=>{const db=supabase()!;
  setBank(await loadBank(lang));
  if(!studentId){setOwn([]);setErrs([]);setSessions([]);return}
  const r=await loadVocab(db,studentId);setDue(r.items.filter(i=>i.translation&&new Date(i.due_at).getTime()<=Date.now()).length);setOwn(practiceOrder(r.items.filter(i=>i.translation)).map(i=>({id:i.id,term:i.term,translation:i.translation,example:i.example,pos:i.pos,level:i.level,grammar:(i as {grammar?:unknown}).grammar as never})));
  // own mistakes: only those the teacher approved (never "for later" material), each unique mistake once
  const s=await db.rpc('student_lesson_summaries',{sid:studentId});const seen=new Set<string>();
  setErrs(((s.data||[]) as {id:string;final:unknown}[]).flatMap(x=>errorsOf(x.final as never).filter(e=>e.status!=='rejected'&&!e.later&&e.original&&e.corrected).map(e=>({key:`err:${x.id}:${e.id}`.slice(0,200),original:e.original,corrected:e.corrected,why:e.why})))
   .filter(e=>{const k=(e.original+'|'+e.corrected).toLowerCase();if(seen.has(k))return false;seen.add(k);return true}));
  const p=await db.from('practice_sessions').select('kind,score,total,created_at,details').eq('student_id',studentId).in('kind',GAME_KINDS).order('created_at',{ascending:false}).limit(300);
  setSessions(p.error?[]:(p.data||[]) as SessionRow[])},[studentId,lang]);
 useEffect(()=>{setOwn(null);void load()},[load]);
 // all sets for the chosen language and level; a new seed per round = different questions each time
 const sets=useMemo(()=>{if(!own)return null;const n=DECK[level];
  const words=wordDeck(own,bank,level,n,seed),pairs=wordDeck(own,bank,level,MATCH[level],seed+1);
  return {words,pairs,quizPool:[...words.cards,...wordDeck([],bank,level,24,seed+2).cards],idioms:idiomQuestions(lang,level,seed),
   sentence:sentenceSet(own,lang,level,10,seed),conjugate:(()=>{const mine=ownConjugations(own as Parameters<typeof ownConjugations>[0],lang,level,4,seed);return [...mine,...conjugationSet(lang,level,10-mine.length,seed)]})(),errors:correctionSet(errs,lang,level,8,seed)}},[own,bank,errs,lang,level,seed]);
 const autoStarted=useRef(false);
 useEffect(()=>{if(start==='flashcards'&&sets&&sets.words.cards.length>=2&&!autoStarted.current){autoStarted.current=true;setGame('flashcards')}},[start,sets]);
 if(!sets)return <div className="loader small"/>;
 const prog=progressOf(sessions,lang) as Record<string,{sessions:number;answered:number;correct:number;last:string;pct:number|null;often:string[]}>;
 const done=(label:string)=>{setResult(label);setGame(null);setSeed(x=>(x*48271+11)%2147483647);void load()};
 const W=sets.words.cards;
 if(game==='flashcards')return <Flashcards deck={W} ctx={ctx} onDone={done}/>;
 if(game==='quiz')return <Quiz deck={W} pool={sets.quizPool} extra={sets.idioms.slice(0,levelNum(level)>=4?3:0)} ctx={ctx} onDone={done}/>;
 if(game==='typing')return <Typing deck={W} ctx={ctx} onDone={done}/>;
 if(game==='match')return <Match deck={sets.pairs.cards} ctx={ctx} onDone={done}/>;
 if(game==='sentence')return <TypeGame title={tt("Zinnen aanvullen")} intro={tt("Vul het ontbrekende woord in. De hint helpt je op weg.")} kind="sentence" items={sets.sentence} ctx={ctx} onDone={done}/>;
 if(game==='conjugate')return <TypeGame title={tt("Werkwoorden vervoegen")} intro={tt("Schrijf de juiste vorm van het werkwoord. Je ziet het hele werkwoord, de tijd en de persoon.")} kind="conjugate" items={sets.conjugate} ctx={ctx} onDone={done} conj/>;
 if(game==='errors')return <TypeGame title={tt("Fouten verbeteren")} intro={tt("Schrijf de hele zin opnieuw, zonder fout.")} kind="errors" items={sets.errors} ctx={ctx} onDone={done} long/>;
 const fromBank=sets.words.fromBank;
 const info=(k:GameKind)=>{const p=prog[k];return p?<small className="pr-stat">{tt('{0}× geoefend',p.sessions)}{p.pct!==null?' · '+tt('{0}% goed',p.pct):''}{p.last?' · '+new Date(p.last).toLocaleDateString(locale(),{day:'numeric',month:'short'}):''}</small>:null};
 const often=[...new Set(Object.values(prog).flatMap(p=>p.often))].slice(0,8);
 const tile=(k:GameKind,icon:React.ReactNode,title:string,sub:string,ok:boolean,why:string)=><button key={k} className="game-tile" disabled={!ok} onClick={()=>setGame(k)}>{icon}<b>{title}</b><small>{ok?sub:why}</small>{info(k)}</button>;
 const supported=hasGrammar(lang);
 return <div>
  {result&&<div className="game-result"><Trophy size={18}/> {result}</div>}
  {studentId&&own!.length>0&&<p className="muted">{tt("{0} woorden staan klaar om te herhalen.", due)} <InfoTip text={tt("Moeilijke woorden komen vaker terug (gespreide herhaling); na 5 keer achter elkaar goed is een woord “beheerst”.")}/></p>}
  {fromBank>0&&<p className="muted small pr-note"><Sparkles size={14}/> {own!.length?tt('Je woordenlijst heeft op dit niveau te weinig woorden; {0} woorden komen uit de oefenbank.',fromBank):tt('Nog geen eigen woorden: je oefent met woorden uit de oefenbank.')}</p>}
  {!studentId&&<p className="muted small pr-note">{tt('Zelfstudie: je oefent met de oefenbank. Resultaten worden bewaard zodra je een docent hebt voor deze taal.')}</p>}
  <div className="game-grid">
   {tile('flashcards',<Layers size={24}/>,tt("Flashcards"),tt("Omdraaien en zelf beoordelen"),W.length>=2,tt("Nog niet genoeg woorden op dit niveau"))}
   {tile('quiz',<ListChecks size={24}/>,tt("Meerkeuzequiz"),levelNum(level)>=4?tt("Betekenis, uitdrukkingen en register"):tt("Kies de juiste vertaling"),W.length>=4,tt("Minstens 4 woorden nodig"))}
   {tile('typing',<Keyboard size={24}/>,tt("Vertaalspel"),tt("Schrijf het woord bij de betekenis"),W.length>=2,tt("Nog niet genoeg woorden op dit niveau"))}
   {tile('match',<Puzzle size={24}/>,tt("Woorden koppelen"),tt("Verbind woord en betekenis"),sets.pairs.cards.length>=3,tt("Nog niet genoeg woorden op dit niveau"))}
   {tile('sentence',<PenLine size={24}/>,tt("Zinnen aanvullen"),tt("Vul het ontbrekende woord in"),sets.sentence.length>0,supported?tt("Nog geen geschikte zinnen op dit niveau"):tt("Nodig: woorden met voorbeeldzin"))}
   {tile('conjugate',<Repeat size={24}/>,tt("Werkwoorden vervoegen"),levelNum(level)<=1?tt("Tegenwoordige tijd"):levelNum(level)===2?tt("Tegenwoordige en verleden tijden"):tt("Alle tijden, in zinnen"),sets.conjugate.length>0,tt("Beschikbaar voor Nederlands en Portugees"))}
   {tile('errors',<Wrench size={24}/>,tt("Fouten verbeteren"),errs.length?tt("Je eigen fouten uit goedgekeurde lesanalyses"):tt("Veelgemaakte fouten op jouw niveau"),sets.errors.length>0,tt("Nog geen goedgekeurde correcties"))}
  </div>
  {often.length>0&&<div className="pr-often"><h4>{tt('Vaak fout')}</h4><ul className="chips">{often.map(w=><li key={w}>{w}</li>)}</ul></div>}
 </div>
}

function GameShell({title,i,n,onQuit,children,intro}:{title:string;i:number;n:number;onQuit:()=>void;children:React.ReactNode;intro?:string}){
 return <div className="game"><div className="row between"><b>{title}</b><div className="row"><span className="muted">{Math.min(i+1,n)} / {n}</span><button className="iconbtn" title={tt("Stoppen")} aria-label={tt("Stoppen")} onClick={onQuit}><X size={16}/></button></div></div>
  <div className="game-progress" role="progressbar" aria-valuemin={0} aria-valuemax={n} aria-valuenow={i} aria-label={tt('Voortgang')}><span style={{width:`${(i/Math.max(1,n))*100}%`}}/></div>{intro&&<p className="muted small pr-intro">{intro}</p>}{children}</div>
}

/* v42: both directions — lesson language → meaning and meaning → lesson language; from B1 the harder direction by default */
function Flashcards({deck,ctx,onDone}:{deck:Card[];ctx:Ctx;onDone:(s:string)=>void}){
 const [i,setI]=useState(0);const [flip,setFlip]=useState(false);
 const [rev,setRevRaw]=useState(()=>{try{const v=localStorage.getItem('teachy-flash-dir');return v?v==='from-en':levelNum(ctx.level)>=3}catch{return false}});
 const setRev=(r:boolean)=>{setRevRaw(r);setFlip(false);try{localStorage.setItem('teachy-flash-dir',r?'from-en':'to-en')}catch{}};const score=useRef(0);const started=useRef(Date.now());const wrong=useRef<string[]>([]);
 async function answer(ok:boolean){const v=deck[i];recordItem(ctx,v,ok);if(ok)score.current++;else wrong.current.push(v.term);setFlip(false);
  if(i+1>=deck.length){await saveGameSession(ctx,'flashcards',score.current,deck.length,started.current,{wrong:wrong.current});onDone(tt('Flashcards: {0} van {1} gekend',score.current,deck.length))}else setI(i+1)}
 const v=deck[i];
 return <GameShell title={tt("Flashcards")} i={i} n={deck.length} onQuit={()=>onDone('')} intro={tt("Bedenk het antwoord, draai de kaart om en wees eerlijk.")}>
  <div className="seg flash-dir" role="group" aria-label={tt('Richting')}><button type="button" aria-pressed={!rev} onClick={()=>setRev(false)}>{tt('Woord → betekenis')}</button><button type="button" aria-pressed={rev} onClick={()=>setRev(true)}>{tt('Betekenis → woord')}</button></div>
  <button className={'flipcard'+(flip?' flipped':'')} onClick={()=>setFlip(!flip)} aria-live="polite"><span className="face front"><strong>{rev?v.meaning:v.term}</strong><small><Eye size={14}/> {tt("tik om om te draaien")}</small></span><span className="face back"><strong>{rev?v.term:v.meaning}</strong>{v.example&&<small>{v.example}</small>}</span></button>
  <div className="row center"><BankTag on={v.source==='bank'}/></div>
  <div className="row center"><button className="button secondary" onClick={()=>void answer(false)}><RotateCcw size={15}/> {tt("Nog oefenen")}</button><button className="button" onClick={()=>void answer(true)}><Check size={15}/> {tt("Ken ik")}</button></div>
 </GameShell>
}

type QuizQ={key:string;card?:Card;q:string;ask:string;options:string[];right:string;notes?:Note[];source:'own'|'bank';itemKey?:string;label?:string};
function Quiz({deck,pool,extra,ctx,onDone}:{deck:Card[];pool:Card[];extra:GItem[];ctx:Ctx;onDone:(s:string)=>void}){
 const qs=useMemo<QuizQ[]>(()=>[...deck.map((c,k)=>({key:c.key,card:c,q:c.term,ask:tt("Wat betekent"),options:quizOptions(c,pool,ctx.level,k*31+c.term.length),right:c.meaning,source:c.source})),
  ...extra.map(g=>({key:g.key,q:g.prompt,ask:'',options:shuffle(g.options||[],rng(g.key.length*7)),right:g.answers[0],notes:g.notes,source:'bank' as const,itemKey:g.key,label:g.label}))].filter(x=>x.options.length>=2&&x.options.includes(x.right)),[deck,pool,extra,ctx.level]);
 const [i,setI]=useState(0);const [picked,setPicked]=useState<string|null>(null);const score=useRef(0);const started=useRef(Date.now());const wrong=useRef<string[]>([]);
 const v=qs[i];
 function pick(o:string){if(picked)return;setPicked(o);const ok=o===v.right;recordItem(ctx,v.card||{itemKey:v.itemKey,label:v.label},ok);if(ok)score.current++;else wrong.current.push(v.q)}
 async function next(){setPicked(null);if(i+1>=qs.length){await saveGameSession(ctx,'quiz',score.current,qs.length,started.current,{wrong:wrong.current});onDone(tt('Quiz: {0} van {1} goed',score.current,qs.length))}else setI(i+1)}
 if(!v)return null;
 return <GameShell title={tt("Meerkeuzequiz")} i={i} n={qs.length} onQuit={()=>onDone('')} intro={tt("Kies het juiste antwoord.")}>
  <div className="quiz-q">{v.ask&&<small className="muted">{v.ask}</small>}<strong>{v.q}</strong><BankTag on={v.source==='bank'}/></div>
  <div className="quiz-opts">{v.options.map(o=><button key={o} className={'quiz-opt'+(picked?o===v.right?' right':o===picked?' wrong':'':'')} disabled={!!picked} onClick={()=>pick(o)}>{o}</button>)}</div>
  {picked&&<Feedback ok={picked===v.right} right={v.right} notes={v.notes}/>}
  {picked&&<div className="row center"><button className="button" autoFocus onClick={()=>void next()}>{tt("Volgende")}</button></div>}
 </GameShell>
}

function Feedback({ok,accent,right,notes}:{ok:boolean;accent?:boolean;right:string;notes?:Note[]}){
 return <div className={'drill-result '+(ok?accent?'accent':'correct':'wrong')} role="status">
  <p>{ok?<><Check size={16}/> {accent?<>{tt("Bijna: let op de accenten →")} <b>{right}</b></>:tt("Goed!")}</>:<><X size={16}/> {tt("Juist is:")} <b>{right}</b></>}</p>
  {!!notes?.length&&<ul className="pr-notes">{(ok?notes.slice(0,1):notes).map((n,k)=><li key={k}>{tt(n.k,...(n.a||[]))}</li>)}</ul>}
 </div>
}

function Typing({deck,ctx,onDone}:{deck:Card[];ctx:Ctx;onDone:(s:string)=>void}){
 const [i,setI]=useState(0);const [val,setVal]=useState('');const [res,setRes]=useState<null|'correct'|'accent'|'wrong'>(null);const score=useRef(0);const started=useRef(Date.now());const wrong=useRef<string[]>([]);const inp=useRef<HTMLInputElement>(null);
 const v=deck[i];const L=levelNum(ctx.level);
 async function submit(e:React.FormEvent){e.preventDefault();if(res){setRes(null);setVal('');if(i+1>=deck.length){await saveGameSession(ctx,'typing',score.current,deck.length,started.current,{wrong:wrong.current});onDone(tt('Vertaalspel: {0} van {1} goed',score.current,deck.length))}else{setI(i+1);setTimeout(()=>inp.current?.focus(),0)}return}
  if(!val.trim())return;const r=checkText(val,[v.term,v.term.replace(/^(de|het|een|o|a|os|as|um|uma)\s+/i,'')]);setRes(r);const ok=r!=='wrong';recordItem(ctx,v,ok);if(ok)score.current++;else wrong.current.push(v.term)}
 return <GameShell title={tt("Vertaalspel")} i={i} n={deck.length} onQuit={()=>onDone('')} intro={tt("Schrijf het woord in de taal die je leert.")}>
  <form className="drill-card" onSubmit={e=>void submit(e)}><div className="drill-q"><small className="muted">{tt("Schrijf in de doeltaal")}</small><strong>{v.meaning}</strong>{L<=1&&!res&&<small className="muted">{tt('Begint met "{0}" · {1} letters',v.term.replace(/^(de|het|een|o|a|os|as|um|uma)\s+/i,'').charAt(0),v.term.replace(/^(de|het|een|o|a|os|as|um|uma)\s+/i,'').length)}</small>}{v.example&&res&&<small className="muted">{v.example}</small>}<BankTag on={v.source==='bank'}/></div>
   <div className="row"><input ref={inp} autoFocus className="field grow" aria-label={tt('Jouw antwoord')} autoComplete="off" autoCapitalize="off" spellCheck={false} value={val} readOnly={!!res} onChange={e=>setVal(e.target.value)}/><button className="button" type="submit" disabled={!res&&!val.trim()}>{res?tt("Volgende"):tt("Controleer")}</button></div>
   {res&&<Feedback ok={res!=='wrong'} accent={res==='accent'} right={v.term}/>}</form>
 </GameShell>
}

function TypeGame({title,intro,kind,items,ctx,onDone,long,conj}:{title:string;intro:string;kind:string;items:TItem[];ctx:Ctx;onDone:(s:string)=>void;long?:boolean;conj?:boolean}){
 const [i,setI]=useState(0);const [val,setVal]=useState('');const [res,setRes]=useState<null|'correct'|'accent'|'wrong'>(null);const score=useRef(0);const started=useRef(Date.now());const wrong=useRef<string[]>([]);const inp=useRef<HTMLInputElement&HTMLTextAreaElement>(null);
 const it=items[i];
 const norm=(s:string)=>long?s.replace(/[.,!?;:"“”'’¿¡]/g,'').replace(/\s+/g,' ').trim():s;
 async function submit(e:React.FormEvent){e.preventDefault();if(res){setRes(null);setVal('');if(i+1>=items.length){await saveGameSession(ctx,kind,score.current,items.length,started.current,{wrong:wrong.current,own:items.filter(x=>x.source==='own').length,bank:items.filter(x=>x.source==='bank').length});onDone(tt('{0}: {1} van {2} goed',title,score.current,items.length))}else{setI(i+1);setTimeout(()=>inp.current?.focus(),0)}return}
  if(!val.trim())return;const r=checkText(norm(val),it.answers.map(norm));setRes(r);const ok=r!=='wrong';recordItem(ctx,it,ok);if(ok)score.current++;else wrong.current.push(it.answers[0])}
 if(!it)return null;
 const [verb,tense,person]=conj?it.hint.split(' · '):[];
 return <GameShell title={title} i={i} n={items.length} onQuit={()=>onDone('')} intro={intro}>
  <form className="drill-card" onSubmit={e=>void submit(e)}><div className="drill-q">
   {conj&&verb&&tense&&person?<div className="pr-conj"><span><small>{tt('Werkwoord')}</small><b>{verb}</b></span><span><small>{tt('Tijd')}</small><b>{tense}</b></span><span><small>{tt('Persoon')}</small><b>{person}</b></span></div>:it.hint?<small className="muted">{it.hint}</small>:null}
   <strong className={long?'long':''}>{conj&&it.prompt===verb?tt('Vervoeg: {0}',verb):it.prompt}</strong><BankTag on={it.source==='bank'}/></div>
   <div className="row">{long?<textarea ref={inp} autoFocus className="field grow" rows={2} spellCheck={false} aria-label={tt('Jouw antwoord')} value={val} readOnly={!!res} onChange={e=>setVal(e.target.value)} placeholder={tt("Schrijf de verbeterde zin…")}/>:<input ref={inp} autoFocus className="field grow" aria-label={tt('Jouw antwoord')} autoComplete="off" autoCapitalize="off" spellCheck={false} value={val} readOnly={!!res} onChange={e=>setVal(e.target.value)}/>}<button className="button" type="submit" disabled={!res&&!val.trim()}>{res?tt("Volgende"):tt("Controleer")}</button></div>
   {res&&<Feedback ok={res!=='wrong'} accent={res==='accent'} right={it.answers[0]} notes={it.notes}/>}</form>
 </GameShell>
}

function Match({deck,ctx,onDone}:{deck:Card[];ctx:Ctx;onDone:(s:string)=>void}){
 const right=useMemo(()=>shuffle(deck.map(d=>d.meaning),rng(deck.length*97+deck[0].term.length)).filter((x,i,a)=>a.indexOf(x)===i),[deck]);
 const [sel,setSel]=useState<string|null>(null);const [matched,setMatched]=useState<string[]>([]);const [flash,setFlash]=useState('');const mistakes=useRef(0);const started=useRef(Date.now());const wrongs=useRef<string[]>([]);
 function pickRight(t:string){if(!sel)return;const v=deck.find(d=>d.key===sel)!;const ok=v.meaning===t;recordItem(ctx,v,ok);if(ok){const m=[...matched,v.key];setMatched(m);setSel(null);if(m.length===deck.length){void saveGameSession(ctx,'match',Math.max(0,deck.length-mistakes.current),deck.length,started.current,{mistakes:mistakes.current,wrong:wrongs.current}).then(()=>onDone(tt('Woorden koppelen klaar met {0} fout(en)',mistakes.current)))}}else{mistakes.current++;wrongs.current.push(v.term);setFlash(t);setTimeout(()=>setFlash(''),500)}}
 const doneMeanings=deck.filter(d=>matched.includes(d.key)).map(d=>d.meaning);
 return <GameShell title={tt("Woorden koppelen")} i={matched.length} n={deck.length} onQuit={()=>onDone('')} intro={tt("Kies links een woord en daarna rechts de betekenis.")}>
  <div className="match"><div>{deck.map(d=><button key={d.key} disabled={matched.includes(d.key)} aria-pressed={sel===d.key} className={'match-item'+(sel===d.key?' sel':'')+(matched.includes(d.key)?' done':'')} onClick={()=>setSel(d.key)}>{d.term}</button>)}</div>
   <div>{right.map(t=><button key={t} disabled={doneMeanings.includes(t)} className={'match-item'+(flash===t?' wrong':'')+(doneMeanings.includes(t)?' done':'')} onClick={()=>pickRight(t)}>{t}</button>)}</div></div>
 </GameShell>
}

/** homework/self-made exercise sets (unchanged) */
async function saveSession(studentId:string,kind:string,score:number,total:number,started:number,details:unknown,assignmentId?:string|null){
 const db=supabase()!;const {data:{user}}=await db.auth.getUser();if(!user)return;
 await db.from('practice_sessions').insert({student_id:studentId,user_id:user.id,kind,score,total,duration_seconds:Math.round((Date.now()-started)/1000),details,assignment_id:assignmentId||null});
}

/* ========================= Exercises (AI) ========================= */
export type ExerciseItem={type:'multiple_choice'|'fill_in'|'translate'|'conjugate'|'correct_error'|'make_sentence'|'write'|'reading';prompt:string;passage:string;options:string[];answer:string;accept:string[];explanation:string;
 /* v64 */ block?:number;topic?:string|null;open?:boolean};
export type ExerciseSection={title:string;instruction:string;example:string;passage:string;topic:string|null;start:number};
export type ExerciseSet={title:string;items:ExerciseItem[];sections?:ExerciseSection[]};
const KIND_LABELS:Record<string,string>=translated({woordenschat:'Woordenschat',grammatica:'Grammatica',vertalen:'Vertalen',invullen:'Invulzinnen',meerkeuze:'Meerkeuze',werkwoorden:'Werkwoorden vervoegen',fouten:'Fouten verbeteren',zinnen:'Zinnen maken',schrijven:'Schrijven',lezen:'Begrijpend lezen',gemengd:'Gemengde herhaling'});void KIND_LABELS;
/* v64: the teacher chooses only level, duration and (optionally) a focus; the rest comes from the student's own data */
const FOCUS_LABEL:Record<Focus,string>=translated({auto:'Automatisch gepersonaliseerd',last_lesson:'Laatste les herhalen',weak:'Zwakke punten oefenen',review:'Eerdere grammatica herhalen',vocab:'Woordenschat',topics:'Specifieke grammaticaonderwerpen'});
const DURATIONS=[5,10,15,20,30,45];
const exCache=new Map<string,ExerciseSet>();
export function ExerciseForm({studentId,defaultLevel,onReady,teacher,initialTopic}:{studentId:string;defaultLevel?:string|null;onReady:(s:ExerciseSet)=>void;teacher?:boolean;initialTopic?:string}){
 const [focus,setFocus]=useState<Focus>(initialTopic?'topics':'auto');
 const [level,setLevel]=useState<string>(defaultLevel&&LEVELS.includes(defaultLevel as typeof LEVELS[number])?defaultLevel:'A2');const [topic,setTopic]=useState(initialTopic||'');const [minutes,setMinutes]=useState(10);
 const [lessons,setLessons]=useState<{date:string;report:boolean}[]|null>(null);const [lessonDate,setLessonDate]=useState('');const [busy,setBusy]=useState(false);const [err,setErr]=useState('');const [reused,setReused]=useState(false);const inFlight=useRef(false);
 const [started,setStarted]=useState(0);const [tick,setTick]=useState(0);
 useEffect(()=>{let c=false;const db=supabase()!;void Promise.all([db.from('lesson_entries').select('lesson_date').eq('student_id',studentId).order('lesson_date',{ascending:false}).limit(30),db.rpc('student_lesson_summaries',{sid:studentId})]).then(([l,s])=>{if(c)return;
  const rep=new Set(((s.data||[]) as {lesson_date:string}[]).map(x=>x.lesson_date));const dates=Array.from(new Set([...rep,...((l.data||[]) as {lesson_date:string}[]).map(x=>x.lesson_date)])).sort().reverse().slice(0,30);
  setLessons(dates.map(d=>({date:d,report:rep.has(d)})));setLessonDate(d=>d||dates[0]||'')});return()=>{c=true}},[studentId]);
 useEffect(()=>{if(!busy)return;const i=setInterval(()=>setTick(x=>x+1),500);return()=>clearInterval(i)},[busy]);
 const plan=planBlocks(minutes,level,focus);
 const params={focus,level,minutes,lessonDate:focus==='last_lesson'?lessonDate||undefined:undefined,topic:focus==='topics'?topic.trim():undefined};
 const key=studentId+'|'+JSON.stringify(params);
 async function go(force=false){if(inFlight.current)return;setErr('');setReused(false);
  if(!force&&exCache.has(key)){setReused(true);onReady(exCache.get(key)!);return}
  inFlight.current=true;setBusy(true);setStarted(Date.now());try{const r=await authedPost<ExerciseSet>(supabase()!,'/api/ai/exercises',{studentId,...params});exCache.set(key,r);onReady(r)}catch(e){setErr(e instanceof Error?e.message:String(e))}inFlight.current=false;setBusy(false)}
 const secs=busy?Math.round((Date.now()-started)/1000):0;void tick;
 return <div className="hw-card hw64">
  <div className="hw-head"><b><Sparkles size={16}/> {teacher?tt("Genereer huiswerk"):tt("Maak mijn huiswerk")}</b></div>
  <div className="hw-row">
   <Select<Focus> label={tt("Focus")} value={focus} onChange={setFocus} options={(Object.keys(FOCUS_LABEL) as Focus[]).map(k=>({value:k,label:FOCUS_LABEL[k]}))} icon={<ListChecks size={15}/>}/>
   <Select<string> size="sm" label={tt("Niveau")} value={level} onChange={setLevel} options={LEVELS.map(l=>({value:l,label:l}))}/>
   <Select<number> size="sm" label={tt("Duur")} value={minutes} onChange={setMinutes} icon={<Clock3 size={14}/>} options={DURATIONS.map(m=>({value:m,label:`${m} ${tt("min")}`}))}/>
  </div>
  {focus==='last_lesson'&&(lessons&&!lessons.length?<span className="muted small">{tt("Nog geen lessen opgeslagen.")}</span>:
   <Select<string> label={tt("Les")} value={lessonDate||null} placeholder={tt("Les kiezen…")} onChange={setLessonDate} icon={<CalendarDays size={15}/>} options={(lessons||[]).map(x=>({value:x.date,label:niceDate(x.date),hint:x.report?tt("met lesverslag"):tt("alleen notities")}))}/>)}
  {focus==='topics'&&<input className="field compact" placeholder={tt("Onderwerp(en), bijv. perfectum; bijzinnen")} value={topic} onChange={e=>setTopic(e.target.value)} aria-label={tt("Onderwerp")}/>}
  <p className="hw-plan muted small">{tt("{0} oefenblok(ken)",plan.reduce((n,b)=>n+b.weight,0))}{plan.some(b=>b.type==='reading')?' · '+tt('met leestekst en open vragen'):''}{plan.some(b=>b.type==='write')?' · '+tt('met schrijfopdracht'):''}</p>
  <div className="hw-actions"><button className="button" disabled={busy||(focus==='topics'&&!topic.trim())||(focus==='last_lesson'&&lessons!==null&&!lessons.length)} onClick={()=>void go()}><Sparkles size={15}/> {busy?tt("Oefeningen maken…"):tt("Genereer oefeningen")}</button>
   {reused&&<button type="button" className="textlink" onClick={()=>void go(true)}>{tt("Opnieuw genereren")}</button>}
   <InfoTip text={tt("Gebaseerd op de eigen lessen, fouten, woordenlijst en leerlijn van de leerling (40% recente grammatica, 30% zwakke punten, 20% herhaling, 10% woordenschat). De tijd bepaalt de hoeveelheid, het niveau het soort oefening. Door AI gemaakt.")}/></div>
  {busy&&<div className="hw-progress" role="status"><div className="hw-progress-bar"><span style={{width:Math.min(95,secs*100/(8+plan.length*4))+'%'}}/></div><small className="muted">{tt("{0} oefenblokken worden tegelijk gemaakt en gecontroleerd… ({1} s)",plan.length,secs)}</small></div>}
  {reused&&<p className="muted small">{tt("Dezelfde keuzes als eerder: je ziet dezelfde oefeningen (geen nieuwe AI-aanvraag).")}</p>}
  {err&&<p className="notice">{err}</p>}
 </div>
}

/** Interactive player with feedback; stores the result as a practice session. v64: instruction + example per block,
 *  open answers checked by AI (several correct formulations accepted) with what went well / what to improve / a
 *  correct example / the rule. */
type Fb={index:number;ok:boolean;good:string;improve:string;example:string;rule:string};
export function ExercisePlayer({set,studentId,kind='exercise',assignmentId,onFinish}:{set:ExerciseSet;studentId:string;kind?:'exercise'|'homework';assignmentId?:string|null;onFinish:(score:number,total:number,answers:string[])=>void}){
 const [answers,setAnswers]=useState<string[]>(set.items.map(()=>''));const [checked,setChecked]=useState(false);const started=useRef(Date.now());
 const [fb,setFb]=useState<Record<number,Fb>>({});const [fbBusy,setFbBusy]=useState(false);
 const isOpen=(it:ExerciseItem)=>!!it.open||it.type==='write'||it.type==='make_sentence'||it.type==='reading';
 const results=set.items.map((it,i)=>!isOpen(it)?checkText(answers[i],[it.answer,...(it.accept||[])]):null);
 const openOk=Object.values(fb).filter(x=>x.ok).length,openN=Object.keys(fb).length;
 const score=results.filter(r=>r==='correct'||r==='accent').length+openOk,total=set.items.filter(it=>!isOpen(it)).length+openN;
 async function check(){setChecked(true);
  const open=set.items.map((it,i)=>({it,i})).filter(({it,i})=>isOpen(it)&&answers[i].trim());let fbs:Record<number,Fb>={};
  if(open.length){setFbBusy(true);try{const r=await authedPost<{feedback:Fb[]}>(supabase()!,'/api/ai/exercises',{studentId,action:'feedback',items:open.map(({it,i})=>({prompt:(set.sections?.[it.block??-1]?.passage?'['+tt('leestekst')+'] ':'')+it.prompt,answer:it.answer,given:answers[i]}))});
   for(const x of r.feedback||[]){const o=open[x.index];if(o)fbs[o.i]=x}setFb(fbs)}catch{/* model answers are still shown */}setFbBusy(false)}
  const ok=Object.values(fbs).filter(x=>x.ok).length;
  const sc=results.filter(r=>r==='correct'||r==='accent').length+ok,tot=set.items.filter(it=>!isOpen(it)).length+Object.keys(fbs).length;
  await saveSession(studentId,kind,sc,tot,started.current,{title:set.title,items:set.items.map((it,i)=>({prompt:it.prompt,given:answers[i],answer:it.answer,topic:it.topic||null,result:results[i]??(fbs[i]?(fbs[i].ok?'correct':'wrong'):null)}))},assignmentId);onFinish(sc,tot,answers)}
 return <div className="exercise-player"><h3>{set.title}</h3>
  {set.items.map((it,i)=>{const sec=it.block!=null&&set.sections?set.sections[it.block]:null;const first=sec&&set.sections!.findIndex(x=>x===sec)===it.block&&(i===0||set.items[i-1].block!==it.block);const f=fb[i];
   return <div key={i}>{first&&<div className="ex-section"><h4>{sec!.title}</h4><p>{sec!.instruction}</p>{sec!.example&&<p className="ex-example"><b>{tt("Voorbeeld:")}</b> {sec!.example}</p>}{sec!.passage&&<blockquote className="passage">{sec!.passage}</blockquote>}</div>}
   <div className={'ex-item'+(checked&&results[i]?' r-'+results[i]:'')+(f?' r-'+(f.ok?'correct':'wrong'):'')}>
   <div className="ex-num">{i+1}</div><div className="grow">
    {it.passage&&<blockquote className="passage">{it.passage}</blockquote>}
    <p className="ex-prompt">{it.prompt}</p>
    {it.type==='multiple_choice'&&it.options.length?<div className="quiz-opts small">{it.options.map(o=><button key={o} disabled={checked} className={'quiz-opt'+(answers[i]===o?' chosen':'')+(checked&&o===it.answer?' right':'')} onClick={()=>setAnswers(a=>a.map((x,j)=>j===i?o:x))}>{o}</button>)}</div>
     :(isOpen(it)||it.type==='correct_error')?<textarea className="field" rows={it.type==='write'?7:it.type==='reading'?3:2} disabled={checked} value={answers[i]} onChange={e=>setAnswers(a=>a.map((x,j)=>j===i?e.target.value:x))}/>
     :<input className="field" disabled={checked} value={answers[i]} onChange={e=>setAnswers(a=>a.map((x,j)=>j===i?e.target.value:x))}/>}
    {checked&&!isOpen(it)&&<p className="ex-feedback">{results[i]==='correct'?tt("✓ Goed"):results[i]==='accent'?tt("≈ Bijna (accenten)"):<>{tt("✗ Juist:")} <b>{it.answer}</b></>}{it.explanation&&<small className="block">{it.explanation}</small>}</p>}
    {checked&&isOpen(it)&&(f?<div className="ex-fb">{f.ok?<b className="ok">{tt("✓ Goed")}</b>:<b className="bad">{tt("Nog niet helemaal")}</b>}{f.good&&<p><b>{tt("Wat goed ging:")}</b> {f.good}</p>}{f.improve&&<p><b>{tt("Wat beter kan:")}</b> {f.improve}</p>}{f.example&&<p><b>{tt("Voorbeeld:")}</b> <i>{f.example}</i></p>}{f.rule&&<p className="muted small">{f.rule}</p>}</div>
     :<p className="ex-feedback">{fbBusy?tt("Feedback wordt gemaakt…"):<>{tt("Voorbeeldantwoord:")} <i>{it.answer}</i></>}{it.explanation&&<small className="block">{it.explanation}</small>}</p>)}
   </div></div></div>})}
  {!checked?<button className="button" onClick={()=>void check()}><Check size={16}/> {tt("Nakijken")}</button>:<div className="game-result"><Trophy size={18}/> {tt("{0} van {1} goed",score,total)}</div>}
 </div>
}

export function SelfPractice({studentId,level,topic}:{studentId:string;level?:string|null;topic?:string}){
 const [set,setSet]=useState<ExerciseSet|null>(null);
 return set?<div><ExercisePlayer set={set} studentId={studentId} onFinish={()=>{}}/><button className="button secondary" onClick={()=>setSet(null)}><Shuffle size={15}/> {tt("Nieuwe oefeningen")}</button></div>:<ExerciseForm studentId={studentId} defaultLevel={level} onReady={setSet} initialTopic={topic}/>
}
