import { SiteHeader } from '@/components/SiteHeader';
import { Rolodex } from '@/components/Rolodex';
import styles from '@/components/Rolodex.module.css';
export const metadata = { title: 'TranterGrey — The Rolodex', robots: { index: false, follow: false } };
export default function Page() { return <main className={styles.adminPage}><SiteHeader adminArea /><Rolodex /></main>; }
