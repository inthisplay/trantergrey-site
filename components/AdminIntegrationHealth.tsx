'use client';
import { useEffect, useState } from 'react';
import styles from './AdminMcpConnections.module.css';
type Event = { id: string; occurred_at: string; surface: string; operation: string; category: string; status: number };
type Health = { since: string; counts: { category: string; count: number }[]; events: Event[] };
const labels: Record<string,string> = { server_error: 'Service errors', rate_limited: 'Rate-limit events', auth_rejected: 'Rejected sign-ins' };
export function AdminIntegrationHealth() {
  const [data, setData] = useState<Health | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true); setError('');
    try { const response = await fetch('/api/admin/integration-health', { cache: 'no-store' }); if (!response.ok) throw new Error('Unable to load connection health. Please try again.'); setData(await response.json()); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to load connection health.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  return <section className={`admin-team-directory-panel ${styles.panel}`} aria-labelledby="integration-health-title">
    <header><div><p className="eyebrow">API & AI connections</p><h2 id="integration-health-title">Connection health</h2></div><button disabled={busy} onClick={() => void load()}>{busy ? 'Loading…' : 'Refresh'}</button></header>
    <p>Recent service errors, blocked bursts of requests, and rejected AI sign-ins. This view is restricted to your owner login.</p>
    {error && <p role="alert">{error}</p>}
    {data && <>
      <p><strong>Last 24 hours:</strong> {Object.entries(labels).map(([key,label]) => `${label}: ${data.counts.find(row => row.category === key)?.count || 0}`).join(' · ')}</p>
      <p className={styles.hint}>Rate limits pause unusually fast requests; they do not change anyone’s permissions. A rate-limit event represents the first blocked request in a one-minute window, not every blocked request.</p>
      <details><summary>Latest events (up to 50)</summary>
        {!data.events.length ? <p>No recorded events. This is an error history, not a continuous uptime test.</p> : <ul className={styles.list}>{data.events.map(event => <li key={event.id}><div><strong>{labels[event.category] || event.category} · {event.surface.toUpperCase()}</strong><span>{event.operation} · HTTP {event.status}</span><small>{new Date(event.occurred_at).toLocaleString()} · Reference: {event.id}</small></div></li>)}</ul>}
      </details>
      <p className={styles.hint}>History retains up to 30 days and 5,000 recent events after daily cleanup. Codes, tokens, message content, and client/card names are not recorded here. No emails or messages are sent.</p>
    </>}
  </section>;
}
