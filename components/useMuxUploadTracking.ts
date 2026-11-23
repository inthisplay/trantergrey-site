'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { readUploadStatus, UploadStatusError, type UploadStatus } from '@/lib/mux-upload-status';

export type TrackedUpload = { uploadId: string; name: string; receivedAt: number; status?: UploadStatus; notice?: string; stopped?: boolean };
export function useMuxUploadTracking(onStatus: (uploadId: string, status: UploadStatus) => void) {
  const [items, setItems] = useState<TrackedUpload[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const key = useRef<string | null>(null);
  const current = useRef(items); current.current = items;
  const callback = useRef(onStatus); callback.current = onStatus;
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/admin/session', { cache: 'no-store', signal: controller.signal });
        const session = await response.json() as { user?: { email?: string } };
        if (!response.ok || !session.user?.email) throw new Error('No session');
        key.current = `tg-mux-upload-status-v1:${session.user.email}`;
        const saved: unknown = JSON.parse(localStorage.getItem(key.current) || '[]');
        if (Array.isArray(saved)) setItems(saved.filter((item): item is TrackedUpload => Boolean(item && typeof item.uploadId === 'string' && /^[A-Za-z0-9]+$/.test(item.uploadId) && typeof item.name === 'string' && typeof item.receivedAt === 'number' && item.receivedAt > Date.now() - 7 * 86400000)).slice(-100).map(item => ({ uploadId: item.uploadId, name: item.name, receivedAt: item.receivedAt })));
      } catch { if (!controller.signal.aborted) setPersistent(false); }
      finally { if (!controller.signal.aborted) setLoaded(true); }
    })();
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!loaded || !key.current) return;
    try { localStorage.setItem(key.current, JSON.stringify(items.map(({ uploadId, name, receivedAt }) => ({ uploadId, name, receivedAt })))); }
    catch { setPersistent(false); }
  }, [items, loaded]);
  useEffect(() => {
    if (!loaded) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      for (const item of current.current) {
        if (controller.signal.aborted) return;
        if (item.stopped || item.status?.ready || ['errored', 'cancelled', 'timed_out'].includes(item.status?.status || '')) continue;
        try {
          const status = await readUploadStatus(item.uploadId, controller.signal);
          if (controller.signal.aborted) return;
          setItems(rows => rows.map(row => row.uploadId === item.uploadId ? { ...row, status, notice: undefined } : row));
          callback.current(item.uploadId, status);
        } catch (error) {
          if (controller.signal.aborted) return;
          setItems(rows => rows.map(row => row.uploadId === item.uploadId ? { ...row, stopped: error instanceof UploadStatusError, notice: error instanceof UploadStatusError ? error.message : 'Connection interrupted. Your upload was received; status will retry automatically.' } : row));
        }
      }
      timer = setTimeout(poll, 5000);
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [loaded]);
  const track = useCallback((uploadId: string, name: string) => setItems(rows => rows.some(row => row.uploadId === uploadId) ? rows : [...rows, { uploadId, name, receivedAt: Date.now() }]), []);
  const dismiss = useCallback((uploadId: string) => setItems(rows => rows.filter(row => row.uploadId !== uploadId)), []);
  return { items, loaded, persistent, track, dismiss };
}
