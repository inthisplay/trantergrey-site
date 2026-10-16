import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { requireAdminPage } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export default async function ProposalsPage() {
  await requireAdminPage('/admin/proposals');
  return <main className="admin-detail"><SiteHeader /><section><p className="eyebrow">Private control room / proposals</p><h1>Make the<br /><em>pitch.</em></h1><p className="admin-empty">This is the proposal workspace. It is ready for the generator we discussed: client details, selected Vimeo work, images, and a shareable proposal page.</p><Link className="admin-back" href="/admin">← All management</Link></section></main>;
}
