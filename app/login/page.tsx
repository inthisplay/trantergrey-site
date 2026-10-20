import { SiteHeader } from '@/components/SiteHeader';
import { AdminLogin } from '@/components/AdminLogin';

export default function LoginPage() {
  return <main className="connect-page admin-login"><SiteHeader /><div><p className="eyebrow">TranterGrey private access</p><h1>Back<br /><em>stage.</em></h1><p>Sign in to connect Vimeo and curate the work library.</p><AdminLogin /></div></main>;
}
