import { SiteHeader } from '@/components/SiteHeader';
import { CollectionsPanel } from '@/components/CollectionsPanel';

export default function CollectionsPage() {
  return <main className="admin-detail"><SiteHeader /><section><p className="eyebrow">Private control room / unlisted pages</p><h1>Private<br /><em>collections.</em></h1><a className="admin-back" href="/admin">← All management</a><CollectionsPanel /></section></main>;
}
