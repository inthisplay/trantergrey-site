'use client';

import { useEffect, useState } from 'react';
import { VimeoImportButton } from './VimeoImportButton';

type Status = { connected: boolean; videos: number; importedAt: string | null; error?: string };

export function VimeoConnectPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/vimeo/status').then(async (response) => {
      if (response.status === 401) { window.location.replace('/login?next=/connect-vimeo'); return; }
      const payload = await response.json() as Status;
      if (!response.ok) throw new Error(payload.error || 'Unable to check Vimeo.');
      setStatus(payload);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to check Vimeo.'));
  }, []);

  if (error) return <p className="admin-empty">{error}</p>;
  if (!status) return <p className="admin-empty">Checking the Vimeo connection…</p>;
  if (!status.connected) return <><p>Connect the TG Vimeo account to begin importing video metadata. This only grants this site access; it does not publish or modify any Vimeo videos.</p><a className="connect-button" href="/api/auth/vimeo">Connect Vimeo</a></>;
  return <><p>The Vimeo account is connected. Importing reads video metadata only; every new item lands in private review and nothing is published to the site until you choose it.</p><p className="library-summary"><strong>{status.videos.toLocaleString()}</strong> videos currently preserved in the private library{status.importedAt ? ` · last imported ${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(status.importedAt))}` : ''}.</p><div id="library-import"><VimeoImportButton hasLibrary={status.videos > 0} /></div><div className="vimeo-quick-links"><a className="secondary-link" href="/admin">Back to the control room</a><a className="secondary-link" href="/our-work">View Our Work</a></div></>;
}
