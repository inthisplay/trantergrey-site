import { SiteHeader } from '@/components/SiteHeader';
import { ContactNotesPanel } from '@/components/ContactNotesPanel';

export default function ContactNotesPage() {
  return <main className="admin-detail"><SiteHeader /><section><p className="eyebrow">Private control room / contact notes</p><h1>New<br /><em>business.</em></h1><a className="admin-back" href="/admin">← All management</a><ContactNotesPanel /></section></main>;
}
