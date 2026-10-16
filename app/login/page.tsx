import { SiteHeader } from '@/components/SiteHeader';
import { safeAdminDestination } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const destination = safeAdminDestination(params.next || '/admin');
  return <main className="connect-page admin-login"><SiteHeader /><div><p className="eyebrow">TranterGrey private access</p><h1>Back<br /><em>stage.</em></h1><p>Sign in to connect Vimeo and curate the work library.</p>{params.error === '1' && <p className="admin-login-error">That password did not match.</p>}<form className="admin-login-form" action="/api/admin/login" method="post"><input type="hidden" name="next" value={destination} /><label>Password<input name="password" type="password" autoComplete="current-password" required /></label><button className="connect-button" type="submit">Enter library</button></form></div></main>;
}
