import { SiteHeader } from '@/components/SiteHeader';
import { VimeoConnectPanel } from '@/components/VimeoConnectPanel';

export default function ConnectVimeoPage() {
  return <main className="connect-page"><SiteHeader adminArea /><div><p className="eyebrow">TranterGrey internal setup</p><h1>Vimeo library<br /><em>connection.</em></h1><VimeoConnectPanel /></div></main>;
}
