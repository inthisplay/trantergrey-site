import Link from 'next/link';
import { hasVimeoConnection } from '@/lib/vimeo-connection';
import { getVimeoLibrarySummary } from '@/lib/vimeo-library';
import { VimeoImportButton } from '@/components/VimeoImportButton';
import { requireAdminPage } from '@/lib/admin-auth';
import { SiteHeader } from '@/components/SiteHeader';

export const dynamic = 'force-dynamic';

export default async function ConnectVimeoPage({ searchParams }: { searchParams: Promise<{ connected?: string }> }) {
  await requireAdminPage('/connect-vimeo');
  const params = await searchParams;
  const connected = params.connected === '1' || await hasVimeoConnection();
  const summary = connected ? await getVimeoLibrarySummary() : null;
  return <main className="connect-page"><SiteHeader /><div><p className="eyebrow">TranterGrey internal setup</p><h1>Vimeo library<br /><em>{connected ? 'connected.' : 'connection.'}</em></h1>{connected ? <><p>The Vimeo account token is stored locally on this Node server. Importing reads video metadata only; every item lands in a private, unreviewed queue and nothing is published to the site.</p>{summary && <p className="library-summary"><strong>{summary.count.toLocaleString()}</strong> videos last imported {new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(summary.importedAt))}.</p>}<div id="library-import"><VimeoImportButton hasLibrary={Boolean(summary)} /></div><div className="vimeo-quick-links"><Link className="secondary-link" href="/library">Open private library</Link><Link className="secondary-link" href="/work">View current public work</Link></div></> : <><p>Connect the TG Vimeo account to begin importing video metadata. This only grants this local application access; it does not publish or modify any Vimeo videos.</p><a className="connect-button" href="/api/auth/vimeo">Connect Vimeo</a></>}</div></main>;
}
