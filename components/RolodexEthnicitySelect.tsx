'use client';

import { ethnicityOptions } from '@/lib/rolodex-ethnicity';
import styles from './Rolodex.module.css';

export function RolodexEthnicitySelect({value,onChange}:{value:string[];onChange:(value:string[])=>void}) {
 return <div className={styles.ethnicityField}><span>Race / ethnicity</span><details className={styles.ethnicitySelect} onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}
 }}><summary aria-label={`Race / ethnicity: ${value.join(', ')||'Not provided'}`}>{value.join(', ')||'Not provided'}</summary><div className={styles.ethnicityChoices}>
  <p>Select all that apply.</p>
  {ethnicityOptions.map(option=><label key={option}><input type="checkbox" checked={value.includes(option)} onChange={event=>onChange(ethnicityOptions.filter(item=>item===option?event.target.checked:value.includes(item)))}/><span>{option}</span></label>)}
  <button type="button" disabled={!value.length} onClick={()=>onChange([])}>Clear · Not provided</button>
 </div></details></div>;
}
