'use client';

import { createPortal } from 'react-dom';
import type { TrackedUpload } from './useMuxUploadTracking';
import { processingLabel } from '@/lib/mux-upload-status';
import styles from './MuxRecentUploadsBar.module.css';

export function MuxRecentUploadsBar({ items, dismiss }: { items: TrackedUpload[]; dismiss: (id: string) => void }) {
  if (!items.length || typeof document === 'undefined') return null;
  const failed = (item: TrackedUpload) => ['errored', 'cancelled', 'timed_out'].includes(item.status?.status || '');
  const pending = items.filter(item => !item.status?.ready && !failed(item));
  const readyCount = items.filter(item => item.status?.ready).length;
  const attentionCount = items.filter(item => failed(item) || item.notice).length;
  const single = items.length === 1 ? items[0] : null;
  const title = single ? single.name : `${items.length} recent uploads`;
  const status = single
    ? single.notice || (single.status?.ready ? 'Ready to play' : failed(single) ? 'Processing failed' : processingLabel(single.status?.processing))
    : [pending.length ? `${pending.length} processing` : '', readyCount ? `${readyCount} ready` : '', attentionCount ? `${attentionCount} need attention` : ''].filter(Boolean).join(' · ');
  const percent = pending.length === 1 ? pending[0].status?.processing?.percent ?? undefined : undefined;
  return createPortal(<div className={styles.bar} aria-label="Recent upload status">
    <div className={styles.copy} role="status" aria-live="polite"><span className={styles.name} title={title}>{title}</span><span className={styles.status} title={status}>{status}</span></div>
    <button className={styles.close} type="button" aria-label="Dismiss recent upload status" title="Dismiss status" onClick={() => items.forEach(item => dismiss(item.uploadId))}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></button>
    {pending.length > 0 && <progress className={styles.progress} max={100} value={percent} aria-label={pending.length === 1 ? 'Video processing' : 'Uploads processing'} />}
  </div>, document.body);
}
