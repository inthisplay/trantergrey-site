'use client';

import { useEffect, useState } from 'react';
import { VideoGallery } from '@/components/VideoGallery';
import type { Video } from '@/lib/videos';

type Props = { initialVideos: Video[] };

export function PublishedWorkGallery({ initialVideos }: Props) {
  const [videos, setVideos] = useState(initialVideos);

  useEffect(() => {
    const controller = new AbortController();

    void fetch('/api/work/library', {
      cache: 'no-store',
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Work library request failed with ${response.status}.`);
      const payload = await response.json() as { videos?: Video[] };
      if (!Array.isArray(payload.videos)) throw new Error('Work library response was invalid.');
      setVideos(payload.videos);
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      // Keep the bundled public library visible if the live endpoint is unavailable.
    });

    return () => controller.abort();
  }, []);

  return videos.length
    ? <VideoGallery videos={videos} />
    : <p className="work-empty">There are no published films yet.</p>;
}
