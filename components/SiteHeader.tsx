'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type HeaderLinksProps = {
  showAdmin: boolean;
  open: boolean;
  onMenuToggle: () => void;
};

function AdminMenu() {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const visible = expanded || hovered;

  return <div className="header-admin-menu"
    onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true); }}
    onPointerLeave={() => setHovered(false)}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setExpanded(false);
        setHovered(false);
      }
    }}
    onKeyDown={(event) => {
      if (event.key === 'Escape' && visible) {
        event.stopPropagation();
        setExpanded(false);
        setHovered(false);
        trigger.current?.focus();
      }
    }}
  >
    <button ref={trigger} type="button" aria-label="Admin menu" aria-expanded={visible} aria-controls={id} onClick={() => {
      setHovered(false);
      setExpanded(!expanded);
    }}><span aria-hidden="true" /></button>
    <div id={id} className="header-admin-links" hidden={!visible}>
      <a href="/admin">Admin dashboard</a>
      <a href="/admin/mux">Mux library</a>
    </div>
  </div>;
}

function HeaderLinks({ showAdmin, open, onMenuToggle }: HeaderLinksProps) {
  return <>
    <div className="header-brand"><a className={`wordmark${open ? ' is-menu-open' : ''}`} href="/"><img src="/assets/tg-logo-white-red.png" alt="TranterGrey" /></a>{showAdmin && !open && <AdminMenu />}</div>
    <button className="menu-toggle" onClick={onMenuToggle} aria-expanded={open}>{open ? 'Close' : 'Menu'} <span aria-hidden="true" /></button>
    <nav className={open ? 'open' : ''}>
      <div className="nav-work-group"><a className="nav-work-trigger" href="/our-work">Our Work <span aria-hidden="true" /></a><div className="nav-work-dropdown"><a href="/our-work">Our Favs</a><a href="/our-work/collections">Collections</a></div></div>
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
    <a className="mobile-sub-link" href="/our-work">Our Favs</a>
    <a className="mobile-sub-link" href="/our-work/collections">Collections</a>
    <a href="/case-studies">Case Studies</a>
    <a href="/#capabilities">Capabilities</a>
    <a href="/#about">About</a>
    <a className="nav-cta" href="/#contact">Start a project</a>
    <p className="mobile-menu-note">Make something worth watching.</p>
  </nav>;
}

export function SiteHeader({ adminArea = false }: { adminArea?: boolean }) {
  const [heroMenuOpen, setHeroMenuOpen] = useState(false);
  const [returnMenuOpen, setReturnMenuOpen] = useState(false);
  const [returnOffset, setReturnOffset] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [hasAdminSession, setHasAdminSession] = useState(false);
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

  useEffect(() => {
    if (adminArea) return;
    const controller = new AbortController();
    fetch('/api/admin/session', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then((response) => setHasAdminSession(response.ok))
      .catch(() => setHasAdminSession(false));
    return () => controller.abort();
  }, [adminArea]);

  const showAdmin = adminArea || hasAdminSession;

  return <>
    <header ref={heroHeaderRef} className="site-header" aria-hidden={returnOffset === 0}>
      <HeaderLinks showAdmin={showAdmin} open={heroMenuOpen} onMenuToggle={() => setHeroMenuOpen((open) => !open)} />
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
      <HeaderLinks showAdmin={showAdmin} open={returnMenuOpen} onMenuToggle={() => setReturnMenuOpen((open) => !open)} />
    </header>, document.body)}
  </>;
}
