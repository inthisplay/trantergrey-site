'use client';
import { useState } from 'react';
import styles from './ClientHQ.module.css';

export function clientLogoUrl(id: string, key: string) {
  return `/api/admin/client-logo?client=${encodeURIComponent(id)}&v=${encodeURIComponent(key)}`;
}
export function ClientLogoSettings({ client, onSaved }: {
  client: { id: string; name: string; logo_key?: string | null };
  onSaved: (key: string | null) => void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  async function save(file?: File) {
    setError(''); setStatus('');
    if (file && (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      setError('Choose a PNG, JPG, or WebP image up to 5 MB.'); return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/client-logo?client=${encodeURIComponent(client.id)}`, file
        ? { method: 'POST', headers: { 'Content-Type': file.type }, body: file }
        : { method: 'DELETE' });
      if (response.status === 401) { location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); throw new Error('Please sign in.'); }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save the logo. Please try again.');
      onSaved(data.logo_key); setStatus(file ? 'Logo saved.' : 'Logo removed.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save the logo.'); }
    finally { setBusy(false); }
  }
  return <section className={styles.logoSettings} aria-label="Client logo" aria-busy={busy}>
    <h3>Client logo</h3>
    {client.logo_key ? <img className={styles.logoPreview} src={clientLogoUrl(client.id, client.logo_key)} alt={`${client.name} logo`}/> : <p>No logo added yet.</p>}
    <label>{client.logo_key ? 'Replace logo' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void save(file);}}/></label>
    <p>PNG, JPG, or WebP, up to 5 MB. Changes save immediately and are shared with everyone.</p>
    {client.logo_key && <button type="button" disabled={busy} onClick={()=>void save()}>Remove logo</button>}
    <p role="status">{busy ? 'Saving logo…' : status}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}
