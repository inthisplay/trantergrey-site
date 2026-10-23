import { SiteHeader } from '@/components/SiteHeader';
import { LibraryPanel } from '@/components/LibraryPanel';

export default function LibraryPage() {
  return <main className="curation-page"><SiteHeader adminArea /><section className="curation-hero"><p className="eyebrow">TranterGrey internal · private review room</p><h1>Make the<br /><em>cut.</em></h1><p>Review the Vimeo archive before anything appears on the public work page.</p></section><section className="curation-content"><LibraryPanel /></section></main>;
}
