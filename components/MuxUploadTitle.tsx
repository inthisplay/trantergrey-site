'use client';

import { useState } from 'react';
import { UiIcon } from './UiIcon';

export function MuxUploadTitle({ title, onChange }: { title: string; onChange: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const finish = () => { if (draft.trim()) onChange(draft.trim()); setEditing(false); };
  return <div className="mux-upload-title">
    {editing ? <input aria-label="Video title" autoFocus value={draft} onChange={event => setDraft(event.target.value)} onBlur={finish} onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); finish(); }
      if (event.key === 'Escape') { event.preventDefault(); setEditing(false); }
    }} /> : <><h3>{title}</h3><button type="button" className="mux-title-pencil" aria-label={`Edit title for ${title}`} onClick={() => { setDraft(title); setEditing(true); }}><UiIcon name="edit" /></button></>}
  </div>;
}
