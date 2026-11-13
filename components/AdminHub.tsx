'use client';

import { useEffect, useState } from 'react';

type Summary = { contacts: number | null; videos: number | null; warning?: string };

const links = [
  { href: '/admin/mux', number: '01', title: 'Mux library', description: 'Build solo pages, ratio sets, and campaign collections.' },
  { href: '/admin/production', number: '02', title: 'The Deck', description: 'Basecamp production archive and working board.' },
  { href: '/admin/contacts', number: '03', title: 'Contact notes', description: 'Review new-project submissions.' },
];

export function AdminHub() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/summary').then(async (response) => {
      if (response.status === 401) { window.location.replace('/login?next=/admin'); return; }
      const text = await response.text();
      let payload: Summary & { error?: string };
      try { payload = JSON.parse(text); }
      catch { throw new Error(`The control room summary is temporarily unavailable (${response.status}). You can still open the tools below.`); }
      if (!response.ok) throw new Error(payload.error || 'Unable to open the private control room.');
      setSummary(payload);
      setError(payload.warning || '');
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to open the private control room.'));
  }, []);

  return <section><div className="admin-hub-head"><div><p className="eyebrow">TranterGrey private control room</p><h1>Keep it<br /><em>moving.</em></h1></div><p>{summary ? `${summary.videos?.toLocaleString() ?? 'Unavailable'} Mux assets and ${summary.contacts?.toLocaleString() ?? 'unavailable'} contact notes.` : error ? 'Choose a tool below.' : 'Opening the private control room…'}</p></div>{error && <div className="admin-empty" role="alert"><p>{error}</p><a href="https://dash.cloudflare.com/?to=/:account/workers-and-pages" target="_blank" rel="noopener noreferrer">Open Cloudflare to view error logs ↗</a></div>}<nav className="admin-hub-links">{links.map((item) => <a href={item.href} key={item.href}><span>{item.number}</span><span className="admin-hub-link-title">{item.title}</span><i>{item.description}</i><b>↗</b></a>)}</nav><form action="/api/admin/logout" method="post"><button className="admin-back" type="submit">Sign out</button></form></section>;
}
