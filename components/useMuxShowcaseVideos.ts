'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Video } from '@/lib/videos';

type ShowcaseAsset = {
  id: string;
  assetId: string;
  muxPlaybackId: string;
  thumbnail: string | null;
  duration: number;
};

function formatDuration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function useMuxShowcaseVideos(videos: Video[]) {
  const projectSlugs = useMemo(() => videos.map((video) => video.muxProjectSlug).filter((slug): slug is string => Boolean(slug)), [videos]);
  const requestKey = projectSlugs.join(',');
  const [resolved, setResolved] = useState<Record<string, ShowcaseAsset>>({});

  useEffect(() => {
    if (!requestKey) return;
    const controller = new AbortController();
    void fetch(`/api/showcase?videos=${encodeURIComponent(requestKey)}&quality=source`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Showcase request failed with ${response.status}.`);
        const payload = await response.json() as { assets?: ShowcaseAsset[] };
        if (!Array.isArray(payload.assets)) throw new Error('Showcase response was invalid.');
        setResolved(Object.fromEntries(payload.assets.map((asset) => [asset.id, asset])));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      });
    return () => controller.abort();
  }, [requestKey]);

  return useMemo(() => videos.map((video) => {
    const asset = video.muxProjectSlug ? resolved[video.muxProjectSlug] : undefined;
    if (!asset) return video;
    return {
      ...video,
      id: asset.assetId,
      muxPlaybackId: asset.muxPlaybackId,
      thumbnail: asset.thumbnail || video.thumbnail,
      duration: formatDuration(asset.duration),
    };
  }), [resolved, videos]);
}
