'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { columnColorStyle, normalizeColumnColor } from '@/lib/deck-colors';
import { UiIcon } from './UiIcon';

const palette = [
  ['Gray', '#e6e6e6'], ['Lavender', '#e6d9e7'], ['Pale teal', '#c7dee1'],
  ['Pale yellow', '#f9f1d2'], ['Pale red', '#edd9db'], ['Pale green', '#d7eadb'],
] as const;

export function ColumnColorDialog({ columnId, name, color, onClose, onSaved }: { columnId: string; name: string; color?: string | null; onClose: () => void; onSaved: (color: string | null) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<string | null>(color || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const normalized = normalizeColumnColor(draft);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (normalized === undefined || saving) return;
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/admin/production-board/columns/${encodeURIComponent(columnId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'color', color: normalized }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save column color.');
      onSaved(payload.color); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save column color.'); }
    finally { setSaving(false); }
  };
  return <dialog ref={dialog} className="deck-color-dialog" aria-labelledby="deck-color-title" onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}>
    <form onSubmit={save}>
      <header><h2 id="deck-color-title">Column color</h2><button type="button" aria-label="Close color picker" disabled={saving} onClick={onClose}><UiIcon name="close" /></button></header>
      <p>Set the background for “{name}” for everyone using the Deck.</p>
      <div className="deck-color-preview" style={columnColorStyle(normalized) as CSSProperties}><strong>{name}</strong><span>Column preview</span></div>
      <div className="deck-color-swatches" role="group" aria-label="Column colors">{palette.map(([label, value]) => <button key={value} type="button" aria-label={label} aria-pressed={normalized === value} disabled={saving} onClick={() => setDraft(value)} style={columnColorStyle(value) as CSSProperties}>{normalized === value && <UiIcon name="check" />}</button>)}</div>
      <div className="deck-color-custom-row">
        <label className="deck-color-picker">Pick color<input type="color" value={normalized || '#eeeeee'} disabled={saving} onChange={(event) => setDraft(event.target.value)} /></label>
        <label className="deck-color-custom">Custom hex color<input value={draft ?? ''} placeholder="#eeeeee" maxLength={7} aria-invalid={normalized === undefined} disabled={saving} onChange={(event) => setDraft(event.target.value)} spellCheck={false} autoComplete="off" /></label>
      </div>
      {normalized === undefined && <p className="deck-color-error">Use six hex digits, for example #287b83.</p>}
      {error && <p className="deck-color-error" role="alert">{error}</p>}
      <button className="deck-color-reset" type="button" disabled={saving} onClick={() => setDraft(null)} aria-pressed={draft === null}>Use default background</button>
      <footer><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" disabled={saving || normalized === undefined}>{saving ? 'Saving…' : 'Save color'}</button></footer>
    </form>
  </dialog>;
}
