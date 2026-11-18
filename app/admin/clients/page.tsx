import { SiteHeader } from '@/components/SiteHeader';
import { ClientHQ } from '@/components/ClientHQ';
import { MuxThemeToggle } from '@/components/MuxThemeToggle';
import styles from '@/components/ClientHQ.module.css';
export const metadata = { title: 'TranterGrey — Client HQ' };
export default function Page() { return <main className={`mux-theme-workspace client-hq-page ${styles.page}`}><SiteHeader adminArea /><MuxThemeToggle /><ClientHQ /></main>; }
