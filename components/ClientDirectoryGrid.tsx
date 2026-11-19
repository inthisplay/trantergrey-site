'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, DragOverlay, MouseSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { reorderVisibleClients, type ClientPreference } from '@/lib/client-preferences';
import styles from './ClientHQ.module.css';

type Client={id:string;name:string;archived?:number};
function SortableCard({id,disabled,children}:{id:string;disabled:boolean;children:ReactNode}) {
 const {setNodeRef,attributes,listeners,transform,transition,isDragging}=useSortable({id,disabled});
 return <div ref={setNodeRef} className={styles.sortableClient} data-dragging={isDragging||undefined} style={{transform:CSS.Transform.toString(transform),transition}} {...(!disabled?attributes:{})} {...(!disabled?listeners:{})}
  onMouseDown={event=>{if(!disabled&&!(event.target as HTMLElement).closest('button,input,dialog,[role="group"]'))listeners?.onMouseDown?.(event);}}
  onKeyDown={event=>{if(!disabled&&event.target===event.currentTarget)listeners?.onKeyDown?.(event);}}
  aria-label={!disabled?'Reorder client: press Space, then arrow keys, then Space to drop':undefined}>
  <div className={styles.sortableClientContent}>{children}</div>
  {isDragging&&<span className={styles.clientDropTarget}>Drop here</span>}
 </div>;
}

export function ClientDirectoryGrid({clients,preferences,query,enabled,renderCard,onReorder}:{clients:Client[];preferences:Record<string,ClientPreference>;query:string;enabled:boolean;renderCard:(id:string)=>ReactNode;onReorder:(ids:string[])=>Promise<void>}) {
 const [desktop,setDesktop]=useState(false),[active,setActive]=useState<string|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const [draft,setDraft]=useState<string[]|null>(null);
 const suppressClick=useRef(false);
 const grid=useRef<HTMLDivElement>(null);
 useEffect(()=>{const media=window.matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)');const update=()=>setDesktop(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 const sensors=useSensors(useSensor(MouseSensor,{activationConstraint:{distance:8}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
 const byId=new Map(clients.map(client=>[client.id,client]));
 const ids=draft??clients.map(client=>client.id);
 const visible=ids.filter(id=>byId.get(id)?.name.toLowerCase().includes(query.toLowerCase()));
 const group=(id:string)=>byId.get(id)?.archived?'archived':preferences[id]?.pinned?'pinned':'active';
 const draggingEnabled=desktop&&enabled&&!saving;
 const stop=()=>{setActive(null);window.setTimeout(()=>{suppressClick.current=false;},0);};
 return <>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {saving&&<p role="status">Saving order…</p>}
  <DndContext sensors={sensors} collisionDetection={args=>{const bounds=grid.current?.getBoundingClientRect(),point=args.pointerCoordinates;if(bounds&&point&&(point.x<bounds.left||point.x>bounds.right||point.y<bounds.top||point.y>bounds.bottom))return [];return closestCenter({...args,droppableContainers:args.droppableContainers.filter(container=>group(String(container.id))===group(String(args.active.id)))});}}
   onDragStart={({active})=>{suppressClick.current=true;setError('');setActive(String(active.id));}}
   onDragCancel={stop}
   onDragEnd={({active,over})=>{
    stop();if(!over||active.id===over.id)return;
    const next=reorderVisibleClients(ids,visible,String(active.id),String(over.id));
    setDraft(next);setSaving(true);
    void onReorder(next).catch(e=>setError(e instanceof Error?e.message:'Could not save the order. Please try again.')).finally(()=>{setDraft(null);setSaving(false);});
   }}>
   <SortableContext items={visible} strategy={rectSortingStrategy}>
    <div ref={grid} className={styles.clients} onClickCapture={event=>{if(suppressClick.current){event.preventDefault();event.stopPropagation();}}} onDragStart={event=>event.preventDefault()}>
     {visible.map(id=><SortableCard key={id} id={id} disabled={!draggingEnabled}>{renderCard(id)}</SortableCard>)}
    </div>
   </SortableContext>
   {desktop&&createPortal(<DragOverlay dropAnimation={null}>{active&&<div className={styles.clientDragOverlay}>{byId.get(active)?.name}</div>}</DragOverlay>,document.body)}
  </DndContext>
 </>;
}
