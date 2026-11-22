import { AdminMcpConnections } from '@/components/AdminMcpConnections';

import { UiIcon } from '@/components/UiIcon';
import { AdminTeamDirectory } from '@/components/AdminTeamDirectory';
import { SiteHeader } from '@/components/SiteHeader';

export default function AdminAccessPage() {
  return <main className="admin-detail"><SiteHeader adminArea /><section><p className="eyebrow">Private control room / admin access</p><h1>Team<br /><em>directory.</em></h1><a className="admin-back" href="/admin"><UiIcon name="back" /> All management</a><AdminTeamDirectory /><AdminMcpConnections /></section></main>;
}
