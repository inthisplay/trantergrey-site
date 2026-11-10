'use client';

import { useState, type FormEvent } from 'react';
import type { VideoProject } from '@/lib/video-projects-shared';
import type { MatchedMuxLibraryAsset } from '@/lib/mux-matching';

type Entry = { project: VideoProject; assets: Array<{ asset: MatchedMuxLibraryAsset; variant: VideoProject['variants'][number] }> };

export function CollectionRatioManager({ collectionId, entries, videoCount, onDelete, onSaved }: {
  collectionId: string;
  entries: Entry[];
  videoCount: number;
  onDelete: () => void;
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/video-projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionId, assetIds: selected, title }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not save the ratio group.');
      await onSaved();
      setSelected([]);
      setTitle('');
      setOpen(false);
      setMessage('Ratio group saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the ratio group.');
    } finally {
      setSaving(false);
    }
  }

  return <>
    <header className="mux-collection-manager-head">
      <div><p>Collection manager</p><span>{videoCount} videos</span></div>
      <div className="mux-collection-manager-buttons">
        <button className="mux-collection-manage-ratios" type="button" aria-expanded={open} disabled={saving} onClick={() => { setOpen(!open); setMessage(''); }}>Manage ratios</button>
        <button className="mux-collection-delete-button" type="button" disabled={saving} onClick={onDelete}>Delete collection</button>
      </div>
    </header>
    {(open || message) && <section className="mux-collection-ratio-manager">
      {open && <form className="mux-bulk-simple-form" onSubmit={save}>
        <p>Choose two or more videos to group. Unselected ratios stay in their current groups.</p>
        <label><span>Group title</span><input required maxLength={160} value={title} disabled={saving} onChange={(event) => setTitle(event.target.value)} /></label>
        <div className="mux-collection-ratio-options">{entries.map(({ project, assets }) => <fieldset key={project.id} disabled={saving}>
          <legend>{project.title}</legend>
          {assets.map(({ asset, variant }) => <label key={asset.id}>
            <input type="checkbox" checked={selected.includes(asset.id)} onChange={(event) => {
              setSelected(event.target.checked ? [...selected, asset.id] : selected.filter((id) => id !== asset.id));
              if (event.target.checked && !title.trim()) setTitle(project.title);
            }} />
            {asset.title} · {asset.aspectRatio || variant.label}
          </label>)}
        </fieldset>)}</div>
        <button type="submit" disabled={saving || selected.length < 2 || !title.trim()}>{saving ? 'Saving…' : 'Save ratio group'}</button>
      </form>}
      {message && <p role="status">{message}</p>}
    </section>}
  </>;
}
