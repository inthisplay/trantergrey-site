'use client';

import { useEffect, useState } from 'react';

type Summary = { contacts: number; collections: number; videos: number };

const links = [
  { href: '/connect-vimeo', number: '01', title: 'Vimeo connection', description: 'Connect or check the Vimeo account.' },
  { href: '/library', number: '02', title: 'Work library', description: 'Review, tag, and publish films.' },
  { href: '/admin/collections', number: '03', title: 'Collections', description: 'Curate public or unlisted pages from the same library.' },
  { href: '/admin/contacts', number: '04', title: 'Contact notes', description: 'Review new-project submissions.' },
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

  return <section><div className="admin-hub-head"><div><p className="eyebrow">TranterGrey private control room</p><h1>Keep it<br /><em>moving.</em></h1></div><p>{summary ? `${summary.videos.toLocaleString()} Vimeo videos, ${summary.collections.toLocaleString()} private collections, and ${summary.contacts.toLocaleString()} contact notes.` : 'Opening the private control room…'}</p></div>{error ? <p className="admin-empty">{error}</p> : <nav className="admin-hub-links">{links.map((item) => <a href={item.href} key={item.href}><span>{item.number}</span><strong>{item.title}</strong><i>{item.description}</i><b>↗</b></a>)}</nav>}<form action="/api/admin/logout" method="post"><button className="admin-back" type="submit">Sign out</button></form></section>;
}
