export type DownloadQuality = 'highest' | '1080p' | '720p' | '540p';
export const downloadQualities: DownloadQuality[] = ['highest', '1080p', '720p', '540p'];
const qualityRank: Record<Exclude<DownloadQuality, 'highest'>, number> = { '1080p': 1080, '720p': 720, '540p': 540 };
const explicitQualities: Array<Exclude<DownloadQuality, 'highest'>> = ['1080p', '720p', '540p'];

function maxResolutionRank(value: string | null) {
  const normalized = value?.toLowerCase() || '';
  const explicit = normalized.match(/(2160|1440|1080|720|540|480|360|270)p?/);
  if (explicit) return Number(explicit[1]);
  if (normalized.includes('uhd') || normalized.includes('4k')) return 2160;
  if (normalized.includes('hd')) return 1080;
  if (normalized.includes('sd')) return 480;
  return null;
}

export function availableDownloadQualities(maxResolution: string | null) {
  const max = maxResolutionRank(maxResolution);
  return ['highest', ...explicitQualities.filter((quality) => max !== null && qualityRank[quality] <= max)] as DownloadQuality[];
}

export function qualityLabel(quality: DownloadQuality) {
  return quality === 'highest' ? 'highest available' : quality;
}

export async function prepareDownload(variant: { assetId: string }, quality: DownloadQuality) {
  const response = await fetch('/api/watch/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetId: variant.assetId, quality }) });
  const payload = await response.json() as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || 'Could not prepare the download.');
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const check = await fetch(`/api/watch/download?assetId=${encodeURIComponent(variant.assetId)}&quality=${quality}`, { cache: 'no-store' });
    const next = await check.json() as { status?: string; downloadUrl?: string; error?: string; nextAvailableQuality?: DownloadQuality };
    if (!check.ok) throw new Error(next.error || 'Could not check the download.');
    if (next.status === 'ready' && next.downloadUrl) {
      return next.downloadUrl;
    }
    if (next.status === 'errored' || next.status === 'skipped') {
      throw new Error(`${qualityLabel(quality)} is unavailable for this video.${next.nextAvailableQuality ? ` Choose ${next.nextAvailableQuality} instead.` : ''}`);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 3000));
  }
  throw new Error('The download is taking longer than expected. Please try again shortly.');
}

export function startDownload(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
