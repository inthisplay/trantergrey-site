'use client';

import { useState } from 'react';
import { Download } from 'pixelarticons/react';
import { availableDownloadQualities, prepareDownload, qualityLabel, startDownload, type DownloadQuality } from '@/lib/watch-download';
import type { SoloVideoVariant } from './SoloVideoPlayer';

export function CollectionDownload({ slug, title }: { slug: string; title: string }) {
  const [variants, setVariants] = useState<SoloVideoVariant[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function loadOptions() {
    if (variants || loading) return;
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`/api/watch/${encodeURIComponent(slug)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load download options.');
      const { video } = await response.json() as { video: { variants: SoloVideoVariant[] } };
      setVariants(video.variants.filter((variant) => variant.downloadsEnabled));
    } catch {
      setMessage('Could not load download options. Close and reopen to retry.');
    } finally {
      setLoading(false);
    }
  }

  async function download(variant: SoloVideoVariant, quality: DownloadQuality) {
    setBusy(true);
    setMessage(`Preparing ${qualityLabel(quality)} download…`);
    try {
      startDownload(await prepareDownload(variant, quality));
      setMessage('Download started.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not prepare the download.');
    } finally {
      setBusy(false);
    }
  }

  return <details className="solo-collection-download" onToggle={(event) => { if (event.currentTarget.open) void loadOptions(); }}>
    <summary className="solo-collection-open" aria-label={`Download ${title}`}><Download aria-hidden="true" /><span aria-hidden="true">Download video</span></summary>
    <div className="solo-download-menu" aria-label={`Download options for ${title}`}>
      <div role="status">{loading ? 'Loading download options…' : message || (variants?.length === 0 ? 'Downloads are unavailable.' : '')}</div>
      {variants?.map((variant) => <div className="solo-download-menu-group" key={variant.assetId}>
        {variants.length > 1 && <span>{variant.label}</span>}
        {availableDownloadQualities(variant.maxResolution).map((quality) => <button type="button" key={quality} disabled={busy} onClick={() => void download(variant, quality)}>{quality === 'highest' ? 'Highest available' : quality}</button>)}
      </div>)}
    </div>
  </details>;
}
