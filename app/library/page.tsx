import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { VimeoLibraryReview } from '@/components/VimeoLibraryReview';
import { VimeoPublishedRefreshButton } from '@/components/VimeoPublishedRefreshButton';
import { getVimeoLibrary } from '@/lib/vimeo-library';

export const dynamic = 'force-dynamic';

const pageSize = 48;
type Search = { q?: string; status?: string; client?: string; page?: string };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const library = await getVimeoLibrary();
  const query = params.q?.trim().toLowerCase() || '';
  const client = params.client?.trim() || '';
  const status = ['unreviewed', 'published', 'hidden'].includes(params.status || '') ? params.status! : 'unreviewed';
  const page = Math.max(1, Number(params.page) || 1);

  if (!library) return <main className="library-empty"><SiteHeader /><div><p className="eyebrow">TranterGrey internal</p><h1>No Vimeo library<br /><em>yet.</em></h1><p>Connect and import the account before opening the review room.</p><Link className="connect-button" href="/connect-vimeo">Open Vimeo setup</Link></div></main>;

  const clients = [...new Set([...(library.clients ?? []), ...library.videos.map((video) => video.client).filter((name): name is string => Boolean(name))])].sort((a, b) => a.localeCompare(b));
  const localTags = [...new Set(library.videos.flatMap((video) => video.localTags ?? []))].sort((a, b) => a.localeCompare(b));
  const matched = library.videos.filter((video) => video.libraryStatus === status && (!client || video.client === client) && (!query || [video.customTitle, video.title, video.description, ...video.tags, ...(video.localTags ?? [])].filter(Boolean).join(' ').toLowerCase().includes(query)));
  const pages = Math.max(1, Math.ceil(matched.length / pageSize));
  const currentPage = Math.min(page, pages);
  const shown = matched.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totals = { unreviewed: library.videos.filter((video) => video.libraryStatus === 'unreviewed').length, published: library.videos.filter((video) => video.libraryStatus === 'published').length, hidden: library.videos.filter((video) => video.libraryStatus === 'hidden').length };
  const route = (nextStatus: string, nextPage = 1) => `/library?${new URLSearchParams({ ...(query ? { q: params.q! } : {}), ...(client ? { client } : {}), status: nextStatus, page: String(nextPage) })}`;
  const clearRoute = `/library?${new URLSearchParams({ status, page: '1' })}`;

  return <main className="curation-page"><SiteHeader /><section className="curation-hero"><p className="eyebrow">TranterGrey internal · local-only review room</p><h1>Make the<br /><em>cut.</em></h1><p>{library.videos.length.toLocaleString()} Vimeo videos imported. Nothing appears publicly until you mark it Published.</p></section><section className="curation-content"><form className="curation-search" action="/library"><input type="hidden" name="status" value={status} /><label><span>Search title, description, Vimeo, or private tags</span><input name="q" defaultValue={params.q} placeholder="Search the library" /></label><label className="client-filter"><span>Client</span><select name="client" defaultValue={client}><option value="">All clients</option>{clients.map((name) => <option value={name} key={name}>{name}</option>)}</select></label><button>Search</button><Link className="clear-library-form" href={clearRoute}>Clear</Link></form><div className="curation-tabs">{(['unreviewed', 'published', 'hidden'] as const).map((item) => <Link className={status === item ? 'active' : ''} href={route(item)} key={item}>{item}<span>{totals[item].toLocaleString()}</span></Link>)}</div><div className="library-status-row"><p className="curation-count">{matched.length.toLocaleString()} matching videos · page {currentPage} of {pages} · {clients.length.toLocaleString()} saved clients · {localTags.length.toLocaleString()} private tags</p><div className="library-status-actions"><Link href="/connect-vimeo#library-import">Check Vimeo / full rescan</Link><VimeoPublishedRefreshButton /></div></div><VimeoLibraryReview videos={shown} clients={clients} localTags={localTags} /><nav className="curation-pagination">{currentPage > 1 && <Link href={route(status, currentPage - 1)}>← Previous</Link>}{currentPage < pages && <Link href={route(status, currentPage + 1)}>Next →</Link>}</nav></section></main>;
}
