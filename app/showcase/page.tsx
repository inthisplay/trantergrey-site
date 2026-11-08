import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { getMuxLibraryAssets, muxThumbnailUrl } from '@/lib/mux-api';
import { getMuxLibraryMetadata } from '@/lib/mux-library-metadata';
import { matchMuxAssetsToVimeo } from '@/lib/mux-matching';
import { getVimeoLibrary } from '@/lib/vimeo-library';
import styles from './showcase.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Video Showcase — TranterGrey',
  description: 'A curated video showcase from TranterGrey.',
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ videos?: string | string[] }>;
};

function parseAssetIds(raw: string | string[] | undefined) {
  const source = Array.isArray(raw) ? raw.join(',') : raw ?? '';
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const value of source.split(',')) {
    const id = value.trim();
    if (!/^[A-Za-z0-9]+$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= 100) break;
  }

  return ids;
}

async function getShowcaseAssets(ids: string[]) {
  if (!ids.length) return [];

  const [muxAssets, metadata, vimeoLibrary] = await Promise.all([
    getMuxLibraryAssets({
      tokenId: process.env.MUX_TOKEN_ID,
      tokenSecret: process.env.MUX_TOKEN_SECRET,
    }),
    getMuxLibraryMetadata(),
    getVimeoLibrary(),
  ]);
  const candidates = (vimeoLibrary?.videos ?? []).map((video) => ({
    id: video.id,
    title: video.title,
    customTitle: video.customTitle,
    client: video.client,
    duration: video.duration,
  }));
  const vimeoById = new Map((vimeoLibrary?.videos ?? []).map((video) => [video.id, video]));
  const enriched = matchMuxAssetsToVimeo(muxAssets, candidates).map((asset) => {
    const vimeoSource = asset.vimeoMatch ? vimeoById.get(asset.vimeoMatch.id) : undefined;
    const vimeoDisplayTitle = vimeoSource?.customTitle?.trim() || vimeoSource?.title?.trim();
    const thumbnailTime = metadata.thumbnailTimesByAssetId[asset.id];

    return {
      ...asset,
      title: metadata.titlesByAssetId[asset.id]?.trim() || vimeoDisplayTitle || asset.title,
      client: metadata.clientsByAssetId[asset.id]?.trim() || asset.client || '',
      thumbnailUrl:
        asset.playbackId && thumbnailTime !== undefined
          ? muxThumbnailUrl(asset.playbackId, thumbnailTime)
          : asset.thumbnailUrl,
    };
  });
  const byId = new Map(enriched.map((asset) => [asset.id, asset]));

  return ids.flatMap((id) => {
    const asset = byId.get(id);
    return asset?.playerUrl ? [asset] : [];
  });
}

export default async function ShowcasePage({ searchParams }: PageProps) {
  const ids = parseAssetIds((await searchParams).videos);
  const assets = await getShowcaseAssets(ids);

  return (
    <main className={styles.page}>
      <SiteHeader />
      <section className={styles.shell}>
        <header className={styles.intro}>
          <div>
            <p>TranterGrey showcase</p>
            <h1>Selected work.</h1>
          </div>
          {assets.length > 0 && (
            <span>
              {assets.length} {assets.length === 1 ? 'film' : 'films'}
            </span>
          )}
        </header>

        {assets.length ? (
          <div className={styles.grid}>
            {assets.map((asset) => (
              <article className={styles.card} key={asset.id}>
                <div className={styles.player}>
                  <iframe
                    src={asset.playerUrl!}
                    title={asset.title}
                    loading="lazy"
                    allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <div className={styles.copy}>
                  {asset.client && <p>{asset.client}</p>}
                  <h2>{asset.title}</h2>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <p>TranterGrey showcase</p>
            <h1>This showcase has no available videos.</h1>
          </div>
        )}

        <p className={styles.end}>TranterGrey · Marketing in motion.</p>
      </section>
    </main>
  );
}
