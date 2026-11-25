'use client';
import { useEffect, useRef } from 'react';

// Visible tabs only, one request at a time, with cancellation on edits/unmount.
export function useLiveRefresh(refresh: (signal: AbortSignal) => Promise<void>, enabled = true) {
  const callback = useRef(refresh);
  callback.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    let active: AbortController | null = null;
    const run = async () => {
      if (document.hidden || active) return;
      const controller = new AbortController();
      active = controller;
      try { await callback.current(controller.signal); } catch { /* Keep the current view during transient network failures. */ }
      finally { if (active === controller) active = null; }
    };
    const timer = window.setInterval(run, 15000);
    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', run);
    return () => { clearInterval(timer); active?.abort(); window.removeEventListener('focus', run); document.removeEventListener('visibilitychange', run); };
  }, [enabled]);
}
