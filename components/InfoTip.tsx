'use client';
// v39: extra explanation behind a small info icon instead of a permanent paragraph.
// Hover (title) on desktop; tap/focus toggles a small bubble so it also works on touch screens and with a keyboard.
import {useState} from 'react';
import {Info} from 'lucide-react';

export function InfoTip({text,label}:{text:string;label?:string}){
 const [open,setOpen]=useState(false);
 return <span className="infotip"><button type="button" className="infotip-btn" aria-label={label||text} aria-expanded={open} title={text} onClick={()=>setOpen(o=>!o)} onBlur={()=>setOpen(false)}><Info size={14}/></button>{open&&<span className="infotip-bubble" role="tooltip">{text}</span>}</span>
}
