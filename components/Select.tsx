'use client';
// v40: the one TeachyRooms dropdown (teacher, lesson language, level, duration, exercise type, lesson, word list).
// No dependency: a button + listbox following the WAI-ARIA "select-only combobox" pattern.
// Keyboard: ↑/↓/Home/End to move, Enter/Space to choose, Escape to close, typing a letter jumps to it.
// The list opens below the button, or above it when there is no room, and scrolls when long.
import {useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {Check,ChevronDown} from 'lucide-react';

export type SelectOption<T extends string|number>={value:T;label:string;icon?:ReactNode;hint?:string;disabled?:boolean};
type Props<T extends string|number>={value:T|null;options:SelectOption<T>[];onChange:(v:T)=>void;label:string;placeholder?:string;icon?:ReactNode;
 /** multi-select: value is ignored, `values` + `onToggle` are used and the list stays open */
 multi?:{values:T[];onToggle:(v:T)=>void};className?:string;disabled?:boolean;size?:'sm'|'md'};

export function Select<T extends string|number>({value,options,onChange,label,placeholder,icon,multi,className,disabled,size='md'}:Props<T>){
 const [open,setOpen]=useState(false);const [active,setActive]=useState(0);const [up,setUp]=useState(false);
 const id=useId();const btn=useRef<HTMLButtonElement>(null);const list=useRef<HTMLUListElement>(null);const wrap=useRef<HTMLDivElement>(null);const typed=useRef({s:'',t:0});
 const chosen=multi?options.filter(o=>multi.values.includes(o.value)):options.filter(o=>o.value===value);
 const shown=chosen.length===0?(placeholder||label):multi&&chosen.length>1?`${chosen[0].label} +${chosen.length-1}`:chosen[0].label;
 const enabled=(i:number)=>!!options[i]&&!options[i].disabled;
 const move=(from:number,step:number)=>{let i=from;for(let n=0;n<options.length;n++){i=(i+step+options.length)%options.length;if(enabled(i))return i}return from};
 function openList(){if(disabled)return;const i=options.findIndex(o=>multi?multi.values.includes(o.value):o.value===value);setActive(i>=0?i:move(-1,1));setOpen(true)}
 function choose(i:number){const o=options[i];if(!o||o.disabled)return;if(multi){multi.onToggle(o.value);return}onChange(o.value);setOpen(false);btn.current?.focus()}
 // close on outside click / Escape (Escape handled in onKey); place above when there is no room below
 useEffect(()=>{if(!open)return;const off=(e:MouseEvent|TouchEvent)=>{if(!wrap.current?.contains(e.target as Node))setOpen(false)};document.addEventListener('mousedown',off);document.addEventListener('touchstart',off);return()=>{document.removeEventListener('mousedown',off);document.removeEventListener('touchstart',off)}},[open]);
 useLayoutEffect(()=>{if(!open||!btn.current)return;const r=btn.current.getBoundingClientRect();const need=Math.min(300,options.length*38+12);setUp(window.innerHeight-r.bottom<need&&r.top>need)},[open,options.length]);
 useEffect(()=>{if(open)list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({block:'nearest'})},[open,active]);
 function onKey(e:React.KeyboardEvent){
  if(!open){if(['ArrowDown','ArrowUp','Enter',' '].includes(e.key)){e.preventDefault();openList()}return}
  if(e.key==='Escape'){e.preventDefault();setOpen(false);btn.current?.focus();return}
  if(e.key==='Tab'){setOpen(false);return}
  if(e.key==='ArrowDown'){e.preventDefault();setActive(a=>move(a,1))}
  else if(e.key==='ArrowUp'){e.preventDefault();setActive(a=>move(a,-1))}
  else if(e.key==='Home'){e.preventDefault();setActive(move(-1,1))}
  else if(e.key==='End'){e.preventDefault();setActive(move(options.length,-1))}
  else if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(active)}
  else if(e.key.length===1&&/\S/.test(e.key)){const now=Date.now();typed.current.s=(now-typed.current.t<700?typed.current.s:'')+e.key.toLowerCase();typed.current.t=now;
   const i=options.findIndex(o=>!o.disabled&&o.label.toLowerCase().startsWith(typed.current.s));if(i>=0)setActive(i)}
 }
 return <div className={'trs'+(size==='sm'?' trs-sm':'')+(className?' '+className:'')} ref={wrap}>
  <button ref={btn} type="button" className="trs-btn" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={id+'-list'} aria-label={label}
   aria-activedescendant={open?`${id}-o${active}`:undefined} disabled={disabled} onClick={()=>open?setOpen(false):openList()} onKeyDown={onKey} title={label}>
   {chosen.length===1&&chosen[0].icon?<span className="trs-ico">{chosen[0].icon}</span>:icon?<span className="trs-ico">{icon}</span>:null}
   <span className={'trs-val'+(chosen.length?'':' placeholder')}>{shown}</span><ChevronDown size={15} className="trs-chev" aria-hidden/></button>
  {open&&<ul ref={list} id={id+'-list'} role="listbox" aria-label={label} aria-multiselectable={multi?true:undefined} className={'trs-list'+(up?' up':'')} tabIndex={-1}>
   {options.map((o,i)=>{const sel=multi?multi.values.includes(o.value):o.value===value;return <li key={String(o.value)} id={`${id}-o${i}`} data-i={i} role="option" aria-selected={sel} aria-disabled={o.disabled||undefined}
    className={'trs-opt'+(i===active?' active':'')+(sel?' sel':'')} onMouseEnter={()=>setActive(i)} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(i)}>
    {o.icon&&<span className="trs-ico">{o.icon}</span>}<span className="trs-lbl">{o.label}{o.hint&&<small>{o.hint}</small>}</span>{sel&&<Check size={15} className="trs-check" aria-hidden/>}</li>})}
  </ul>}
 </div>
}

/** Initials avatar for people in dropdowns (no photo request needed). */
export function Initials({name}:{name:string}){const i=(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]!.toUpperCase()).join('')||'?';return <span className="trs-initials" aria-hidden>{i}</span>}
