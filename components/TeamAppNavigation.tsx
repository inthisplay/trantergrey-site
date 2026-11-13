'use client';

import { usePathname } from 'next/navigation';
import styles from '@/app/app/team-app.module.css';
import navigation from '@/app/app/team-navigation.module.css';

export function TeamAppNavigation() {
  const pathname = usePathname();
  const active = pathname.startsWith('/app/deck') ? 'deck' : 'mux';
  return <nav className={`${styles.nav} ${navigation.aboveContent}`} aria-label="Team app"><a href="/app/mux" aria-current={active === 'mux' ? 'page' : undefined}>Mux</a><a href="/app/deck" aria-current={active === 'deck' ? 'page' : undefined}>Deck</a></nav>;
}
