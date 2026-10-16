import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { requireAdminPage } from '@/lib/admin-auth';
import { getContactInquiries } from '@/lib/contact-inquiries';
import { getVimeoLibrarySummary } from '@/lib/vimeo-library';

export const dynamic = 'force-dynamic';

const panels = [
  { href: '/connect-vimeo', number: '01', title: 'Vimeo connection', description: 'Connect or check the Vimeo account.' },
  { href: '/library', number: '02', title: 'Work library', description: 'Review, tag, and publish films.' },
  { href: '/admin/collections', number: '03', title: 'Private collections', description: 'Make unlisted pages from the same library.' },
  { href: '/admin/proposals', number: '04', title: 'Proposals', description: 'Build the next version of client-ready pages.' },
] as const;

export default async function AdminPage() {
  await requireAdminPage('/admin');
  const [library, inquiries] = await Promise.all([getVimeoLibrarySummary(), getContactInquiries()]);
  const links = [...panels, { href: '/admin/contacts', number: '05', title: 'Contact notes', description: inquiries.length ? `${inquiries.length} form ${inquiries.length === 1 ? 'submission' : 'submissions'} waiting.` : 'No form submissions yet.' }];
  return <main className="admin-hub"><SiteHeader /><section><div className="admin-hub-head"><p className="eyebrow">TranterGrey private control room</p><h1>Keep it<br /><em>moving.</em></h1><p>{library ? `${library.count.toLocaleString()} Vimeo videos are in the library.` : 'Start by connecting the Vimeo account.'}</p></div><nav className="admin-hub-links">{links.map((item) => <Link href={item.href} key={item.href}><span>{item.number}</span><strong>{item.title}</strong><i>{item.description}</i><b>↗</b></Link>)}</nav></section></main>;
}
