'use client';

import { useEffect, useRef, useState } from 'react';
import { prepareDownload } from '@/lib/watch-download';
import styles from './CollectionDownloads.module.css';

type Item = { assetId: string; label: string };
type Download = Item & { status: 'waiting' | 'preparing' | 'ready' | 'error' | 'cancelled'; url?: string; error?: string };

export function CollectionDownloads({ items }: { items: Item[] }) {
  const [downloads, setDownloads] = useState<Download[]>(() => items.map(item => ({ ...item, status: 'waiting' })));
  const active = useRef(new Map<string, AbortController>());
  useEffect(() => {
    setDownloads(current => current.map(row => row.status === 'preparing' ? { ...row, status: 'waiting' } : row));
    return () => { for (const controller of active.current.values()) controller.abort(); active.current.clear(); };
  }, []);
  useEffect(() => {
    for (const item of downloads.filter(item => item.status === 'waiting')) {
      if (active.current.size >= 2) break;
      if (active.current.has(item.assetId)) continue;
      const controller = new AbortController();
      active.current.set(item.assetId, controller);
      setDownloads(current => current.map(row => row.assetId === item.assetId ? { ...row, status: 'preparing', error: undefined } : row));
      void prepareDownload(item, 'highest', controller.signal).then(url => {
        if (active.current.get(item.assetId) === controller) active.current.delete(item.assetId);
        if (!controller.signal.aborted) setDownloads(current => current.map(row => row.assetId === item.assetId ? { ...row, status: 'ready', url } : row));
      }).catch(error => {
        if (active.current.get(item.assetId) === controller) active.current.delete(item.assetId);
        if (!controller.signal.aborted) setDownloads(current => current.map(row => row.assetId === item.assetId ? { ...row, status: 'error', error: error instanceof Error ? error.message : 'Could not prepare this video.' } : row));
      }).finally(() => { if (active.current.get(item.assetId) === controller) active.current.delete(item.assetId); });
    }
  }, [downloads]);

  function cancel() {
    for (const controller of active.current.values()) controller.abort();
    active.current.clear();
    setDownloads(current => current.map(row => ['waiting', 'preparing'].includes(row.status) ? { ...row, status: 'cancelled' } : row));
  }
  const pending = downloads.some(item => ['waiting', 'preparing'].includes(item.status));
  return <section className={styles.panel} aria-label="Video downloads">
    <h2>Download videos</h2>
    <p>Highest available quality. Save each MP4 separately using its download link.</p>
    <p role="status">{downloads.filter(item => item.status === 'ready').length} of {downloads.length} ready. {pending && <button type="button" onClick={cancel}>Cancel preparation</button>}</p>
    <ul>{downloads.map(item => <li key={item.assetId}>
      <span>{item.label}<small>{item.status === 'preparing' ? 'Preparing…' : item.status === 'waiting' ? 'Waiting…' : item.error || (item.status === 'cancelled' ? 'Preparation cancelled' : 'Ready')}</small></span>
      {item.status === 'ready' ? <a href={item.url} download>Download MP4</a> : ['error', 'cancelled'].includes(item.status) ? <button type="button" onClick={() => setDownloads(current => current.map(row => row.assetId === item.assetId ? { ...row, status: 'waiting', error: undefined } : row))}>Retry</button> : null}
    </li>)}</ul>
  </section>;
}
