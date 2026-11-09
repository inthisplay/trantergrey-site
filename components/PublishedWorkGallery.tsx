'use client';

import { useEffect, useState } from 'react';
import { VideoGallery } from '@/components/VideoGallery';
import type { Video } from '@/lib/videos';

type Props = { initialVideos: Video[] };

function shuffled(videos: Video[]) {
  const result = [...videos];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function PublishedWorkGallery({ initialVideos }: Props) {
  const [videos, setVideos] = useState(initialVideos);
  const [loading, setLoading] = useState(initialVideos.length === 0);

  useEffect(() => {
    const controller = new AbortController();

    void fetch('/api/work/library', {
      cache: 'no-store',
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Work library request failed with ${response.status}.`);
      const payload = await response.json() as { videos?: Video[] };
      if (!Array.isArray(payload.videos)) throw new Error('Work library response was invalid.');
      setVideos(shuffled(payload.videos));
      setLoading(false);
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLoading(false);
    });

    return () => controller.abort();
  }, []);

  return loading
    ? <p className="work-empty">Loading films…</p>
    : videos.length
    ? <VideoGallery videos={videos} />
    : <p className="work-empty">There are no published films yet.</p>;
}
