import type { AdminEnvironment } from '../../_lib/admin';
import { createMuxStaticRendition, getMuxLibraryAsset } from '../../_lib/mux';
import { readMuxMetadata } from '../../_lib/mux-state';

const qualities = ['highest', '1080p', '720p', '540p'] as const;
type Quality = typeof qualities[number];
const ranks = { '1080p': 1080, '720p': 720, '540p': 540 } as const;
const explicit: Array<Exclude<Quality, 'highest'>> = ['1080p', '720p', '540p'];
type Context = { request: Request; env: AdminEnvironment };

function maxRank(value: string | null) { const normalized = value?.toLowerCase() || ''; const match = normalized.match(/(2160|1440|1080|720|540|480|360|270)p?/); if (match) return Number(match[1]); if (normalized.includes('4k') || normalized.includes('uhd')) return 2160; if (normalized.includes('hd')) return 1080; if (normalized.includes('sd')) return 480; return null; }
function available(max: string | null) { const rank = maxRank(max); return rank ? ['highest', ...explicit.filter((quality) => ranks[quality] <= rank)] as Quality[] : ['highest'] as Quality[]; }
function effective(requested: Quality, max: string | null) { return requested === 'highest' ? available(max).find((quality) => quality !== 'highest') || 'highest' : requested; }
function nextQuality(requested: Quality, max: string | null) { const values = available(max).filter((quality): quality is Exclude<Quality, 'highest'> => quality !== 'highest'); return requested === 'highest' ? values[0] || null : values.find((quality) => ranks[quality] < ranks[requested]) || null; }
function parse(value: unknown): Quality { if (typeof value === 'string' && qualities.includes(value as Quality)) return value as Quality; throw new Error('That download quality is not available.'); }
function filename(title: string, quality: Quality) { return `${title.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'trantergrey-video'}-${quality}.mp4`; }

async function publicAsset(env: AdminEnvironment, id: string) {
  if (!/^[A-Za-z0-9]+$/.test(id)) throw new Error('A valid video ID is required.');
  const metadata = await readMuxMetadata(env); if (metadata[id]?.downloadsEnabled === false) throw new Error('Downloads are disabled for this video.');
  const asset = await getMuxLibraryAsset(env, id); if (asset.playbackPolicy !== 'public') throw new Error('This video is not publicly available.'); return asset;
}

export async function onRequestGet({ request, env }: Context) {
  try {
    const url = new URL(request.url); const asset = await publicAsset(env, url.searchParams.get('assetId') || ''); const quality = parse(url.searchParams.get('quality')); const target = effective(quality, asset.maxResolution);
    const rendition = asset.staticRenditions.find((item) => item.resolution === target || item.name === `${target}.mp4`);
    if (rendition?.status === 'ready' && rendition.url) return Response.json({ status: 'ready', quality, downloadUrl: `${rendition.url}?download=${encodeURIComponent(filename(asset.title, quality))}` });
    if (rendition && ['errored', 'skipped'].includes(rendition.status)) return Response.json({ status: rendition.status, quality, nextAvailableQuality: nextQuality(quality, asset.maxResolution) });
    return Response.json({ status: rendition?.status || 'missing', quality });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not check the download.' }, { status: 400 }); }
}

export async function onRequestPost({ request, env }: Context) {
  try {
    const body = await request.json() as { assetId?: unknown; quality?: unknown }; if (typeof body.assetId !== 'string') throw new Error('A valid video ID is required.');
    const quality = parse(body.quality); const asset = await publicAsset(env, body.assetId); const options = available(asset.maxResolution);
    if (!options.includes(quality)) { const next = nextQuality(quality, asset.maxResolution); return Response.json({ error: `${quality} is not available for this video.${next ? ` Try ${next} instead.` : ''}`, nextAvailableQuality: next }, { status: 409 }); }
    const target = effective(quality, asset.maxResolution); const existing = asset.staticRenditions.find((item) => item.resolution === target || item.name === `${target}.mp4`);
    if (!existing || !['ready', 'preparing', 'processing'].includes(existing.status)) await createMuxStaticRendition(env, body.assetId, target);
    return Response.json({ ok: true, quality });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not prepare the download.' }, { status: 400 }); }
}
