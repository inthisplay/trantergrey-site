'use client';
import { ColorPickerDialog } from './ColorPickerDialog';

export function ColumnColorDialog({ columnId, name, color, onClose, onSaved }: { columnId: string; name: string; color?: string | null; onClose: () => void; onSaved: (color: string | null) => void }) {
 return <ColorPickerDialog name={name} title="Column color" description={`Set the background for “${name}” for everyone using the Deck.`} color={color} onClose={onClose} onSave={async color=>{
  const response=await fetch(`/api/admin/production-board/columns/${encodeURIComponent(columnId)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'color',color})});
  const payload=await response.json();
  if(!response.ok)throw new Error(payload.error||'Unable to save column color.');
  onSaved(payload.color);
 }}/>;
}
