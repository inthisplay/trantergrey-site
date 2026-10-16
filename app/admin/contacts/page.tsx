import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { requireAdminPage } from '@/lib/admin-auth';
import { getContactInquiries } from '@/lib/contact-inquiries';

export const dynamic = 'force-dynamic';

export default async function ContactNotesPage() {
  await requireAdminPage('/admin/contacts');
  const inquiries = await getContactInquiries();
  return <main className="admin-detail"><SiteHeader /><section><p className="eyebrow">Private control room / contact notes</p><h1>New<br /><em>business.</em></h1><Link className="admin-back" href="/admin">← All management</Link>{inquiries.length ? <div className="inquiry-list">{inquiries.map((inquiry) => <article key={inquiry.id}><p>{new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(inquiry.receivedAt))}</p><h2>{inquiry.name} <span>· {inquiry.business}</span></h2><a href={`mailto:${inquiry.email}`}>{inquiry.email}</a><dl><div><dt>Focus</dt><dd>{inquiry.focus}</dd></div><div><dt>Timeline</dt><dd>{inquiry.timeline}</dd></div></dl><p className="inquiry-message-copy">{inquiry.message}</p></article>)}</div> : <p className="admin-empty">No form submissions yet. They will appear here as soon as the contact form is used.</p>}</section></main>;
}
