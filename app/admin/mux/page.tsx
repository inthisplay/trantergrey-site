import { SiteHeader } from '@/components/SiteHeader';
import { MuxCacheRefreshButton } from '@/components/MuxCacheRefreshButton';
import { MuxLibraryPanel } from '@/components/MuxLibraryPanel';

export const metadata = { title: 'TranterGrey - MUX' };

export default function MuxLibraryPage() {
  return <main className="admin-detail mux-admin mux-theme-workspace"><SiteHeader adminArea /><section><p className="eyebrow">Private control room / video source</p><h1>Mux.</h1><div className="mux-admin-links"><a className="admin-back" href="/admin">← All management</a><MuxCacheRefreshButton /></div><MuxLibraryPanel /></section></main>;
}
