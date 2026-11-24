'use client';

import { useEffect, useState } from 'react';
import { createThumbnailPreviewLoader } from '@/lib/thumbnail-preview';

export function useThumbnailPreview(url: string | null) {
  const [displayed, setDisplayed] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [loader] = useState(() => createThumbnailPreviewLoader(
    next => { setDisplayed(next); setFailed(null); },
    next => setFailed(next),
  ));
  useEffect(() => {
    setFailed(null);
    if (url) loader.load(url);
    else setDisplayed(null);
    return () => loader.dispose();
  }, [url, retry, loader]);
  const ready = Boolean(url && displayed === url && failed !== url);
  return { displayed, ready, error: Boolean(url && failed === url), retry: () => { setFailed(null); setRetry(value => value + 1); } };
}
