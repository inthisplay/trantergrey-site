import { AdminTeamDirectory } from '@/components/AdminTeamDirectory';
import { SiteHeader } from '@/components/SiteHeader';

export default function AdminAccessPage() {
  return <main className="admin-detail"><SiteHeader adminArea /><section><p className="eyebrow">Private control room / admin access</p><h1>Team<br /><em>directory.</em></h1><a className="admin-back" href="/admin">← All management</a><AdminTeamDirectory /></section></main>;
}
