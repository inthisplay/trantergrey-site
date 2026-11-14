'use client';

import { useState } from 'react';

export function MuxCacheRefreshButton() {
  const [status, setStatus] = useState<'idle' | 'refreshing' | 'error'>('idle');

  async function refreshCache() {
    setStatus('refreshing');
    try {
      const response = await fetch('/api/admin/mux-refresh', { method: 'POST', cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || 'Could not refresh the Mux cache.');
      }
      window.location.reload();
    } catch {
      setStatus('error');
    }
  }

  return <button className="admin-cache-refresh" type="button" onClick={refreshCache} disabled={status === 'refreshing'}>
    {status === 'refreshing' ? 'Refreshing cache…' : status === 'error' ? 'Retry cache refresh' : 'Refresh cache'}
  </button>;
}
