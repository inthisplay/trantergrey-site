'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function VimeoImportButton({ hasLibrary = false }: { hasLibrary?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function importLibrary(mode: 'incremental' | 'full') {
    setState('working');
    setMessage(mode === 'full' ? 'Rescanning your full Vimeo library…' : 'Checking Vimeo for new uploads…');
    try {
      const response = await fetch('/api/vimeo/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
      const result = await response.json() as { imported?: number; total?: number; scanned?: number; mode?: 'incremental' | 'full'; error?: string };
      if (!response.ok) throw new Error(result.error || 'The import could not start.');
      setState('done');
      const imported = result.imported?.toLocaleString() ?? '0';
      const total = result.total?.toLocaleString() ?? '0';
      setMessage(result.mode === 'incremental' ? `${imported} new Vimeo videos found. ${total} videos are now in private review.` : `${imported} Vimeo videos refreshed for private review.`);
      router.refresh();
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'The import could not start.');
    }
  }

  return <div className="import-action"><div className="import-buttons"><button className="connect-button" onClick={() => importLibrary(hasLibrary ? 'incremental' : 'full')} disabled={state === 'working'}>{state === 'working' ? 'Scanning…' : hasLibrary ? 'Check for new Vimeo videos' : 'Import Vimeo library'}</button>{hasLibrary && <button className="full-import-button" onClick={() => importLibrary('full')} disabled={state === 'working'}>Full rescan</button>}</div>{message && <p className={`import-message ${state}`}>{message}</p>}</div>;
}
