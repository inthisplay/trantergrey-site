'use client';

import { useEffect } from 'react';

export function TeamAppServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || window.location.protocol !== 'https:') return;
    void navigator.serviceWorker.register('/sw.js', { scope: '/app/' }).catch(() => undefined);
  }, []);

  return null;
}
