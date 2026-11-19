import { SiteHeader } from '@/components/SiteHeader';
import { AdminLogin } from '@/components/AdminLogin';

export default function LoginPage() {
  return <main className="connect-page admin-login"><SiteHeader /><div><p className="eyebrow">TranterGrey private control room</p><h1>Behind<br /><em>the scenes.</em></h1><p>Sign in to access the video library, production board, client workspaces, and contact notes.</p><AdminLogin /></div></main>;
}
