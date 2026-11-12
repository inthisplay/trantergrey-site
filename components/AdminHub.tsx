'use client';

import { useEffect, useState } from 'react';

type Summary = { contacts: number; videos: number };

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
      const payload = await response.json() as Summary & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Unable to open the private control room.');
      setSummary(payload);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to open the private control room.'));
  }, []);

  return <section><div className="admin-hub-head"><div><p className="eyebrow">TranterGrey private control room</p><h1>Keep it<br /><em>moving.</em></h1></div><p>{summary ? `${summary.videos.toLocaleString()} Mux assets and ${summary.contacts.toLocaleString()} contact notes.` : 'Opening the private control room…'}</p></div>{error ? <p className="admin-empty">{error}</p> : <nav className="admin-hub-links">{links.map((item) => <a href={item.href} key={item.href}><span>{item.number}</span><span className="admin-hub-link-title">{item.title}</span><i>{item.description}</i><b>↗</b></a>)}</nav>}<form action="/api/admin/logout" method="post"><button className="admin-back" type="submit">Sign out</button></form></section>;
}
