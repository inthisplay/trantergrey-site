'use client';

import styles from '@/app/app/team-app.module.css';
import deck from '@/app/app/team-deck.module.css';
import { ProductionCard } from './ProductionCard';

/**
 * Keep mobile Deck card details on the shared production implementation so
 * the rich Mux picker/editor and card tooling never become a separate subset.
 */
export function TeamAppCard({ id }: { id: string }) {
  return (
    <section className={`${styles.page} ${styles.deckPage} ${deck.cardDetail}`}>
      <a className={styles.back} href="/app/deck">← The Deck</a>
      <ProductionCard id={id} />
    </section>
  );
}
