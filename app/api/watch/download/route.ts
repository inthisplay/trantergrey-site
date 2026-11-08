import { createMuxStaticRendition, getMuxLibraryAsset } from '@/lib/mux-api';
import { getMuxLibraryMetadata } from '@/lib/mux-library-metadata';

export const runtime = 'nodejs';

const downloadQualities = ['highest', '1080p', '720p', '540p'] as const;
type DownloadQuality = typeof downloadQualities[number];
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

function supportedQualities(maxResolution: string | null) {
  const max = maxResolutionRank(maxResolution);
  if (!max) return ['highest'] as DownloadQuality[];
  return ['highest', ...explicitQualities.filter((quality) => qualityRank[quality] <= max)] as DownloadQuality[];
}

function effectiveQuality(requested: DownloadQuality, maxResolution: string | null) {
  if (requested !== 'highest') return requested;
  const specific = supportedQualities(maxResolution).find((quality) => quality !== 'highest');
  return specific || 'highest';
}

function nextAvailableQuality(requested: DownloadQuality, maxResolution: string | null) {
  const available = supportedQualities(maxResolution).filter((quality) => quality !== 'highest');
  if (requested === 'highest') return available[0] ?? null;
  return available.find((quality) => qualityRank[quality] < qualityRank[requested]) ?? null;
}

function parseQuality(value: string | null): DownloadQuality {
  if (downloadQualities.includes(value as DownloadQuality)) return value as DownloadQuality;
  throw new Error('That download quality is not available.');
}

function downloadFilename(title: string, quality: DownloadQuality) {
  const base = title.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'trantergrey-video';
  return `${base}-${quality}.mp4`;
}

async function publicDownloadAsset(assetId: string) {
  if (!/^[A-Za-z0-9]+$/.test(assetId)) throw new Error('A valid video ID is required.');
  const metadata = await getMuxLibraryMetadata();
  if (metadata.downloadsEnabledByAssetId[assetId] === false) throw new Error('Downloads are disabled for this video.');
  const asset = await getMuxLibraryAsset(assetId, { tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET });
  if (asset.playbackPolicy !== 'public') throw new Error('This video is not publicly available.');
  return asset;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const asset = await publicDownloadAsset(url.searchParams.get('assetId') || '');
    const quality = parseQuality(url.searchParams.get('quality'));
    const effective = effectiveQuality(quality, asset.maxResolution);
    const rendition = asset.staticRenditions.find((item) => item.resolution === effective || item.name === `${effective}.mp4`);
    if (rendition?.status === 'ready' && rendition.url) {
      return Response.json({ status: 'ready', quality, downloadUrl: `${rendition.url}?download=${encodeURIComponent(downloadFilename(asset.title, quality))}` });
    }
    if (rendition && ['errored', 'skipped'].includes(rendition.status)) {
      return Response.json({ status: rendition.status, quality, nextAvailableQuality: nextAvailableQuality(quality, asset.maxResolution) });
    }
    return Response.json({ status: rendition?.status || 'missing', quality });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not check the download.' }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { assetId?: unknown; quality?: unknown };
    if (typeof body.assetId !== 'string') throw new Error('A valid video ID is required.');
    if (typeof body.quality !== 'string') throw new Error('A download quality is required.');
    const requested = parseQuality(body.quality);
    const asset = await publicDownloadAsset(body.assetId);
    const available = supportedQualities(asset.maxResolution);
    if (!available.includes(requested)) {
      const next = nextAvailableQuality(requested, asset.maxResolution);
      return Response.json({ error: `${requested} is not available for this video.${next ? ` Try ${next} instead.` : ''}`, nextAvailableQuality: next }, { status: 409 });
    }
    const effective = effectiveQuality(requested, asset.maxResolution);
    const existing = asset.staticRenditions.find((item) => item.resolution === effective || item.name === `${effective}.mp4`);
    if (!existing || !['ready', 'preparing', 'processing'].includes(existing.status)) {
      await createMuxStaticRendition(body.assetId, { tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET }, effective);
    }
    return Response.json({ ok: true, quality: requested });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not prepare the download.' }, { status: 400 });
  }
}
