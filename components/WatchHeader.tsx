'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Home } from 'pixelarticons/react';

const HeaderTarget = createContext<HTMLDivElement | null>(null);

export function WatchHeaderLayout({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  return <HeaderTarget.Provider value={target}>
    <header className="watch-header">
      <div className="watch-header-brand"><a className="watch-wordmark" href="/"><img src="/assets/tg-logo-white-red.png" alt="TranterGrey" /></a></div>
      <div className="watch-header-controls"><div className="watch-header-actions" ref={setTarget} /><a className="watch-home" href="/" aria-label="Home"><Home aria-hidden="true" /><span className="watch-home-tooltip" aria-hidden="true">TG Homepage</span></a></div>
    </header>
    {children}
  </HeaderTarget.Provider>;
}

export function WatchHeaderActions({ children, enabled = false }: { children: ReactNode; enabled?: boolean }) {
  const target = useContext(HeaderTarget);
  return enabled && target ? createPortal(children, target) : children;
}
