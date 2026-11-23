'use client';
import { useState } from 'react';
import type { Descendant } from 'slate';
import { ProductionCommentEditor } from './ProductionCommentEditor';
import { clientNoteHtml, readClientNoteValue, type NoteContent } from '@/lib/client-note';
import styles from './ClientHQ.module.css';

function initialValue(note: NoteContent): Descendant[] {
  if (note.body_json) return readClientNoteValue(note.body_json) as Descendant[];
  if (note.body_format !== 'html') return (note.body || '').split('\n').map(text=>({type:'paragraph',children:[{text}]}));
  const doc = new DOMParser().parseFromString(clientNoteHtml(note),'text/html');
  const convert = (node: Node, marks: Record<string,boolean> = {}): Descendant[] => {
    if (node.nodeType === Node.TEXT_NODE) return [{text:node.textContent || '',...marks}];
    if (!(node instanceof HTMLElement)) return [];
    const name = node.tagName.toLowerCase();
    if (name === 'br') return [{text:'\n',...marks}];
    if (name === 'input') return [{text:node.hasAttribute('checked')?'[x] ':'[ ] ',...marks}];
    const mark = ({b:'bold',strong:'bold',i:'italic',em:'italic',u:'underline',code:'code'} as Record<string,string>)[name];
    const children = Array.from(node.childNodes).flatMap(child=>convert(child,mark?{...marks,[mark]:true}:marks));
    const type = ({p:'paragraph',div:'paragraph',h2:'heading-one',h3:'heading-two',blockquote:'block-quote',ul:'bulleted-list',ol:'numbered-list',li:'list-item'} as const)[name as 'p'];
    return type ? [{type,children:children.length?children:[{text:''}]}] : children;
  };
  const nodes=Array.from(doc.body.childNodes).flatMap(node=>convert(node));
  return nodes.length ? nodes.map(node=>'text' in node?{type:'paragraph',children:[node]}:node) : [{type:'paragraph',children:[{text:''}]}];
}

export function ClientNoteEditor({note,client,disabled,onChange}:{note:NoteContent;client:string;disabled:boolean;onChange:(json:string)=>void}) {
  const [value] = useState(()=>initialValue(note));
  return <div className={`production-comment-form ${styles.noteComposer}`} inert={disabled || undefined}><ProductionCommentEditor initialValue={value} client={client} onChange={next=>onChange(JSON.stringify(next))}/></div>;
}
