'use client';

import { useEffect } from 'react';

export function TeamAppServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || window.location.protocol !== 'https:') return;
    void navigator.serviceWorker.register('/sw.js', { scope: '/app/' }).catch(() => undefined);
  }, []);

  useEffect(() => {
    document.body.dataset.teamApp = 'true';
    return () => { delete document.body.dataset.teamApp; };
  }, []);

  useEffect(() => {
    if (!window.location.pathname.startsWith('/app/watch/')) return;
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
    if (isInstalled) return;
    const target = new URL(window.location.href);
    target.pathname = target.pathname.replace(/^\/app/, '');
    window.location.replace(target.toString());
  }, []);

  return null;
}
