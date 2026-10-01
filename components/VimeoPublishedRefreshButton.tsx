'use client';

import { useState } from 'react';

export function VimeoPublishedRefreshButton() {
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  async function refreshPublished() {
    setWorking(true); setMessage('Refreshing published work…');
    try {
      const response = await fetch('/api/vimeo/library/refresh-published', { method: 'POST' });
      const result = await response.json() as { refreshed?: number; failed?: number; total?: number; error?: string };
      if (!response.ok) throw new Error(result.error || 'Refresh failed.');
      setMessage(result.failed ? `${result.refreshed} refreshed; ${result.failed} could not be reached.` : `${result.refreshed} published video${result.refreshed === 1 ? '' : 's'} refreshed.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Refresh failed.'); } finally { setWorking(false); }
  }
  return <div className="published-refresh"><button onClick={refreshPublished} disabled={working}>{working ? 'Refreshing…' : 'Refresh published work'}</button>{message && <span>{message}</span>}</div>;
}
