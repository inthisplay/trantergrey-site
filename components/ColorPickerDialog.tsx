'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { columnColorStyle, normalizeColumnColor } from '@/lib/deck-colors';
import { createPortal } from 'react-dom';
import { UiIcon } from './UiIcon';

const palette = [
  ['Gray', '#e6e6e6'], ['Lavender', '#e6d9e7'], ['Pale teal', '#c7dee1'],
  ['Pale yellow', '#f9f1d2'], ['Pale red', '#edd9db'], ['Pale green', '#d7eadb'],
] as const;

export function ColorPickerDialog({ name, title, description, color, onClose, onSave }: { name: string; title: string; description: string; color?: string | null; onClose: () => void; onSave: (color: string | null) => Promise<void> }) {
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
      await onSave(normalized); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save color.'); }
    finally { setSaving(false); }
  };
  return createPortal(<dialog ref={dialog} className="deck-color-dialog" aria-labelledby="color-picker-title" onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}>
    <form onSubmit={save}>
      <header><h2 id="color-picker-title">{title}</h2><button type="button" aria-label="Close color picker" disabled={saving} onClick={onClose}><UiIcon name="close" /></button></header>
      <p>{description}</p>
      <div className="deck-color-preview" style={columnColorStyle(normalized) as CSSProperties}><strong>{name}</strong><span>Color preview</span></div>
      <div className="deck-color-swatches" role="group" aria-label="Preset colors">{palette.map(([label, value]) => <button key={value} type="button" aria-label={label} aria-pressed={normalized === value} disabled={saving} onClick={() => setDraft(value)} style={columnColorStyle(value) as CSSProperties}>{normalized === value && <UiIcon name="check" />}</button>)}</div>
      <div className="deck-color-custom-row">
        <label className="deck-color-picker">Pick color<input type="color" value={normalized || '#eeeeee'} disabled={saving} onChange={(event) => setDraft(event.target.value)} /></label>
        <label className="deck-color-custom">Custom hex color<input value={draft ?? ''} placeholder="#eeeeee" maxLength={7} aria-invalid={normalized === undefined} disabled={saving} onChange={(event) => setDraft(event.target.value)} spellCheck={false} autoComplete="off" /></label>
      </div>
      {normalized === undefined && <p className="deck-color-error">Use six hex digits, for example #287b83.</p>}
      {error && <p className="deck-color-error" role="alert">{error}</p>}
      <button className="deck-color-reset" type="button" disabled={saving} onClick={() => setDraft(null)} aria-pressed={draft === null}>Use default background</button>
      <footer><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" disabled={saving || normalized === undefined}>{saving ? 'Saving…' : 'Save color'}</button></footer>
    </form>
  </dialog>, document.body);
}
