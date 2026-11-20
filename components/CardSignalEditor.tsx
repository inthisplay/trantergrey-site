'use client';
import { filmingDates } from '@/lib/filming-dates';
import { useState } from 'react';
export function CardSignalEditor({ id, attention, filmingOn, onSaved }: { id: string; attention: string; filmingOn: string; onSaved: () => void }) {
 const [message, setMessage] = useState(attention), [dates, setDates] = useState(filmingDates(filmingOn)), [saving, setSaving] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
 async function save(clear = false, dismissRecent = false) {
  setSaving(true); setError(''); setSaved(false);
  try {
   const response = await fetch(`/api/admin/production-board/${encodeURIComponent(id)}/signal`, { method: 'PATCH', headers: { 'content-type':'application/json' }, body: JSON.stringify({ attention: clear ? '' : message, filmingDates: [...new Set(dates.filter(Boolean))].sort(), dismissRecent }) });
   const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to save update.');
   if (clear) setMessage(''); setSaved(true); onSaved();
  } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save update.'); } finally { setSaving(false); }
 }
 return <details id="card-update" className="card-signal-editor"><summary>Manage card tag{attention ? ` · ${attention}` : filmingDates(filmingOn).length ? ` · ${filmingDates(filmingOn).length} filming date${filmingDates(filmingOn).length === 1 ? '' : 's'}` : ''}</summary><label>Needs attention<input maxLength={80} value={message} onChange={e => setMessage(e.target.value)} placeholder="Casting options provided" disabled={saving} /></label><div className="filming-date-list">{dates.map((date,index) => <div key={index}><label>Filming date {index + 1}<input type="date" value={date} onChange={e => setDates(current => current.map((value,i) => i === index ? e.target.value : value))} disabled={saving} /></label><button type="button" disabled={saving} aria-label={`Remove filming date ${index + 1}`} onClick={() => setDates(current => current.filter((_,i) => i !== index))}>Remove</button></div>)}<button type="button" disabled={saving || dates.length >= 100} onClick={() => setDates(current => [...current, ''])}>Add filming date</button></div><div><button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save update'}</button><button disabled={saving || !attention} onClick={() => void save(true)}>Mark addressed</button><button disabled={saving} onClick={() => void save(false, true)}>Clear recent additions</button></div>{saved && <p role="status">Update saved.</p>}{error && <p role="alert">{error}</p>}</details>;
}
