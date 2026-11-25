'use client';

import { UiIcon } from '@/components/UiIcon';

import styles from '@/app/app/team-app.module.css';
import deck from '@/app/app/team-deck.module.css';
import { ProductionCard } from './ProductionCard';

/**
 * Keep mobile Deck card details on the shared production implementation so
 * the rich Mux picker/editor and card tooling never become a separate subset.
 */
export function TeamAppCard({ id, focusTarget }: { id: string; focusTarget?: string }) {
  return (
    <section className={`${styles.page} ${styles.deckPage} ${deck.cardDetail}`}>
      <a className={styles.back} href="/app/deck"><UiIcon name="back" /> The Deck</a>
      <ProductionCard id={id} focusTarget={focusTarget} />
    </section>
  );
}
