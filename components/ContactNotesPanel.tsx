'use client';

import { useEffect, useState } from 'react';

type Inquiry = { id: string; receivedAt: string; name: string; email: string; business: string; focus: string; timeline: string; availabilityDates: string[]; availabilityTime: string; message: string };

const displayDate = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));

export function ContactNotesPanel() {
  const [inquiries, setInquiries] = useState<Inquiry[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { fetch('/api/admin/contacts').then(async (response) => {
    if (response.status === 401) { window.location.replace('/login?next=/admin/contacts'); return; }
    const payload = await response.json() as { inquiries?: Inquiry[]; error?: string };
    if (!response.ok) throw new Error(payload.error || 'Unable to load contact notes.');
    setInquiries(payload.inquiries ?? []);
  }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load contact notes.')); }, []);
  if (error) return <p className="admin-empty">{error}</p>;
  if (!inquiries) return <p className="admin-empty">Opening contact notes…</p>;
  if (!inquiries.length) return <p className="admin-empty">No form submissions yet. They will appear here as soon as the contact form is used.</p>;
  return <div className="inquiry-list">{inquiries.map((inquiry) => <article key={inquiry.id}><p>{new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(inquiry.receivedAt))}</p><h2>{inquiry.name} <span>· {inquiry.business}</span></h2><a href={`mailto:${inquiry.email}`}>{inquiry.email}</a><dl><div><dt>Focus</dt><dd>{inquiry.focus}</dd></div><div><dt>Timeline</dt><dd>{inquiry.timeline}</dd></div>{inquiry.availabilityDates.length > 0 && <div><dt>Good days</dt><dd>{inquiry.availabilityDates.map(displayDate).join(', ')}</dd></div>}{inquiry.availabilityTime && <div><dt>Best time</dt><dd>{inquiry.availabilityTime}</dd></div>}</dl><p className="inquiry-message-copy">{inquiry.message}</p></article>)}</div>;
}
