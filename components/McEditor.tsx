'use client';
// v77: multiple choice in homework — four SEPARATE answer fields and a radio to mark the one correct answer. The correct
// answer follows its option when that option is edited (so it always matches exactly). Used by both homework editors.
import {useId} from 'react';
import {t} from '../lib/i18n';
import {fourOptions} from '../lib/homeworkCheck';

export function McEditor({options,answer,onChange}:{options:string[];answer:string;onChange:(p:{options:string[];answer:string})=>void}){
 const gid=useId();const o=fourOptions(options);const right=o.findIndex(x=>x.trim()&&x.trim()===String(answer||'').trim());
 const set=(i:number,v:string)=>{const next=o.map((x,j)=>j===i?v:x);onChange({options:next,answer:i===right?v:answer})};
 return <fieldset className="mc-edit"><legend className="sr-only">{t('Antwoordmogelijkheden')}</legend>
  {o.map((x,i)=><label key={i} className={'mc-opt'+(i===right?' right':'')}>
   <input type="radio" name={'mc-'+gid} checked={i===right} disabled={!x.trim()} onChange={()=>onChange({options:o,answer:x})} aria-label={t('Dit is het juiste antwoord')} title={t('Dit is het juiste antwoord')}/>
   <span className="mc-letter" aria-hidden>{'ABCD'[i]}</span>
   <input className="field" value={x} placeholder={t('Antwoord {0}','ABCD'[i])} onChange={e=>set(i,e.target.value)} aria-label={t('Antwoord {0}','ABCD'[i])}/>
  </label>)}
  {right<0&&<small className="muted">{t('Kies met het rondje welk antwoord juist is.')}</small>}
 </fieldset>
}
