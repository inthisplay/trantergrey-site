'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type HeaderLinksProps = {
  open: boolean;
  onMenuToggle: () => void;
};

function HeaderLinks({ open, onMenuToggle }: HeaderLinksProps) {
  return <>
    <a className={`wordmark${open ? ' is-menu-open' : ''}`} href="/"><img src="/assets/tg-logo-white-red.png" alt="TranterGrey" /></a>
    <button className="menu-toggle" onClick={onMenuToggle} aria-expanded={open}>{open ? 'Close' : 'Menu'} <span aria-hidden="true" /></button>
    <nav className={open ? 'open' : ''}>
      <div className="nav-work-group"><a className="nav-work-trigger" href="/our-work">Our Work <span aria-hidden="true">⌄</span></a><div className="nav-work-dropdown"><a href="/our-work/collections">Collections</a></div></div>
      <a href="/case-studies">Case Studies</a>
      <a href="/#capabilities">Capabilities</a>
      <a href="/#about">About</a>
      <a className="nav-cta" href="/#contact">Start a project</a>
      <p className="mobile-menu-note">Make something worth watching.</p>
    </nav>
  </>;
}

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <nav className={`mobile-menu-panel${open ? ' open' : ''}`} aria-label="Primary">
    <button className="mobile-menu-close" onClick={onClose} aria-label="Close menu">Close <span aria-hidden="true" /></button>
    <a href="/our-work">Our Work</a>
    <a className="mobile-sub-link" href="/our-work/collections">Collections</a>
    <a href="/case-studies">Case Studies</a>
    <a href="/#capabilities">Capabilities</a>
    <a href="/#about">About</a>
    <a className="nav-cta" href="/#contact">Start a project</a>
    <p className="mobile-menu-note">Make something worth watching.</p>
  </nav>;
}

export function SiteHeader() {
  const [heroMenuOpen, setHeroMenuOpen] = useState(false);
  const [returnMenuOpen, setReturnMenuOpen] = useState(false);
  const [returnOffset, setReturnOffset] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const heroHeaderRef = useRef<HTMLElement>(null);
  const returnHeaderRef = useRef<HTMLElement>(null);
  const previousScroll = useRef(0);
  const returnOffsetRef = useRef<number | null>(null);

  useEffect(() => {
    const onScroll = () => {
      const currentScroll = window.scrollY;
      const headerHeight = returnHeaderRef.current?.offsetHeight ?? heroHeaderRef.current?.offsetHeight ?? 92;
      const originalHeaderHasCleared = (heroHeaderRef.current?.getBoundingClientRect().bottom ?? 1) <= 0;
      const scrollDelta = currentScroll - previousScroll.current;
      const currentOffset = returnOffsetRef.current ?? -headerHeight;
      const returnNavIsAlreadyVisible = currentOffset > -headerHeight;

      if (currentScroll <= 0) {
        returnOffsetRef.current = -headerHeight;
        setReturnOffset(-headerHeight);
        setReturnMenuOpen(false);
      } else if (!originalHeaderHasCleared && !returnNavIsAlreadyVisible) {
        // The hero header is still on screen, so keep the return header parked.
        returnOffsetRef.current = -headerHeight;
        setReturnOffset(-headerHeight);
      } else {
        // Moving upward (a negative delta) brings the bar down by the same distance;
        // moving downward returns it above the viewport at the same pace.
        const nextOffset = Math.min(0, Math.max(-headerHeight, currentOffset - scrollDelta));
        returnOffsetRef.current = nextOffset;
        setReturnOffset(nextOffset);
        if (nextOffset < 0) setReturnMenuOpen(false);
      }
      previousScroll.current = currentScroll;
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setIsMounted(true), []);

  return <>
    <header ref={heroHeaderRef} className="site-header" aria-hidden={returnOffset === 0}>
      <HeaderLinks open={heroMenuOpen} onMenuToggle={() => setHeroMenuOpen((open) => !open)} />
    </header>
    {isMounted && createPortal(<MobileMenu open={heroMenuOpen || returnMenuOpen} onClose={() => {
      setHeroMenuOpen(false);
      setReturnMenuOpen(false);
    }} />, document.body)}
    {isMounted && createPortal(<header
      ref={returnHeaderRef}
      className={`site-header site-header--return ${returnOffset === 0 ? 'is-return-visible' : ''}`}
      style={returnOffset === null ? undefined : { transform: `translateY(${returnOffset}px)` }}
      aria-hidden={returnOffset !== 0}
    >
      <HeaderLinks open={returnMenuOpen} onMenuToggle={() => setReturnMenuOpen((open) => !open)} />
    </header>, document.body)}
  </>;
}
