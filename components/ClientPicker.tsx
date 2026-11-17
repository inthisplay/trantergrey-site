'use client';

import { useEffect, useMemo, useState } from 'react';

export function ClientPicker({ value, clients, onChange, onBlur, onClientsChanged, placeholder = 'Search or add a client', disabled = false }: { value: string; clients: string[]; onChange: (value: string) => void; onBlur?: () => void; onClientsChanged?: (clients: string[]) => void; placeholder?: string; disabled?: boolean }) {
  const [options, setOptions] = useState(clients);
  const [open, setOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [editingName, setEditingName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setOptions(clients), [clients]);
  const matching = useMemo(() => options.filter((name) => name.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8), [options, value]);
  const hasExact = options.some((name) => name.toLowerCase() === value.trim().toLowerCase());
  const updateOptions = (next: string[]) => { const sorted = [...new Set(next)].sort((a, b) => a.localeCompare(b)); setOptions(sorted); onClientsChanged?.(sorted); };
  async function createClient() {
    const name = value.trim().replace(/\s+/g, ' ');
    if (!name) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/admin/clients', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create', newName: name }) });
      const payload = await response.json() as { name?: string; error?: string };
      if (!response.ok || !payload.name) throw new Error(payload.error || 'Could not add this client.');
      updateOptions([...options, payload.name]); onChange(payload.name); window.setTimeout(() => onBlur?.(), 0); setOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add this client.'); }
    finally { setSaving(false); }
  }
  async function renameClient(oldName: string) {
    const newName = draftName.trim().replace(/\s+/g, ' ');
    if (!newName || newName === oldName) { setEditingName(''); return; }
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/admin/clients', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ oldName, newName }) });
      const payload = await response.json() as { name?: string; error?: string };
      if (!response.ok || !payload.name) throw new Error(payload.error || 'Could not rename this client.');
      updateOptions(options.map((name) => name.toLowerCase() === oldName.toLowerCase() ? payload.name! : name));
      if (value.toLowerCase() === oldName.toLowerCase()) { onChange(payload.name); window.setTimeout(() => onBlur?.(), 0); }
      setEditingName('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not rename this client.'); }
    finally { setSaving(false); }
  }
  return <div className="shared-client-picker">
    <input value={value} maxLength={120} placeholder={placeholder} disabled={disabled} onFocus={() => setOpen(true)} onBlur={() => { window.setTimeout(() => setOpen(false), 150); onBlur?.(); }} onChange={(event) => { onChange(event.target.value); setOpen(true); }} />
    {open && <div className="client-picker-options" role="listbox">{matching.map((name) => <button type="button" role="option" key={name} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(name); window.setTimeout(() => onBlur?.(), 0); setOpen(false); }}>{name}</button>)}{value.trim() && !hasExact && <button type="button" role="option" disabled={saving} onMouseDown={(event) => event.preventDefault()} onClick={() => void createClient()}>{saving ? 'Adding…' : `Add “${value.trim()}” as a client`}</button>}<button className="client-picker-manage" type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => { setOpen(false); setManagerOpen(true); setError(''); }}>Manage clients…</button></div>}
    {managerOpen && <div className="client-manager-backdrop" role="presentation" onMouseDown={() => !saving && setManagerOpen(false)}><section className="client-manager-modal" role="dialog" aria-modal="true" aria-labelledby="client-manager-title" onMouseDown={(event) => event.stopPropagation()}><header><div><p>Shared directory</p><h2 id="client-manager-title">Manage clients</h2></div><button type="button" onClick={() => setManagerOpen(false)} aria-label="Close client manager">×</button></header>{error && <p className="client-manager-error" role="alert">{error}</p>}<ul>{options.map((name) => <li key={name}>{editingName === name ? <><input autoFocus maxLength={120} value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void renameClient(name); if (event.key === 'Escape') setEditingName(''); }} /><button type="button" disabled={saving} onClick={() => void renameClient(name)}>{saving ? 'Saving…' : 'Save'}</button><button type="button" disabled={saving} onClick={() => setEditingName('')}>Cancel</button></> : <><span>{name}</span><button type="button" onClick={() => { setEditingName(name); setDraftName(name); setError(''); }}>Edit</button></>}</li>)}</ul>{options.length === 0 && <p className="client-manager-empty">No clients yet. Add one from the client picker.</p>}</section></div>}
  </div>;
}
