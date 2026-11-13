import type { Metadata } from 'next';
import { TeamAppNavigation } from '@/components/TeamAppNavigation';
import { TeamAppServiceWorker } from '@/components/TeamAppServiceWorker';
import styles from './team-app.module.css';

export const metadata: Metadata = {
  title: 'TG Team',
  description: 'Private TranterGrey production workspace.',
  robots: { index: false, follow: false },
  icons: { apple: '/tg-team-icon.png' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'TG Team' },
};

export default function TeamAppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <main className={styles.shell}>{children}<TeamAppNavigation /><TeamAppServiceWorker /></main>;
}
