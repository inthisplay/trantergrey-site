'use client';

import { MuxLibraryPanel } from './MuxLibraryPanel';
import { MuxCacheRefreshButton } from './MuxCacheRefreshButton';
import styles from '@/app/app/mux-workspace.module.css';

/** Keeps /app/mux on the exact same library and mobile interactions as /admin/mux. */
export function TeamAppVideos() {
  return <section className={`${styles.workspace} mux-admin mux-theme-workspace`} data-theme="dark">
    <section className={styles.content}>
      <p className="eyebrow">Private control room / video source</p>
      <h1>Mux.</h1>
      <div className="mux-admin-links"><MuxCacheRefreshButton /></div>
      <MuxLibraryPanel combinedSearch loginDestination="/app/mux" publicPageBase="/app/watch" publicLinksOpenInNewTab={false} compactPreviews />
    </section>
  </section>;
}
