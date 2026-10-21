'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Video } from '@/lib/videos';
import { vimeoPlayerUrl } from '@/lib/videos';

type Props = { videos: Video[]; featured?: boolean };

export function VideoGallery({ videos, featured = false }: Props) {
  const [active, setActive] = useState<Video | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('All');
  const [industry, setIndustry] = useState('All');
  const [client, setClient] = useState('All');
  const [railScroll, setRailScroll] = useState({ size: 100, position: 0 });
  const gridRef = useRef<HTMLDivElement>(null);
  const kinds = ['All', ...Array.from(new Set(videos.map((video) => video.kind).filter(Boolean)))];
  const industries = ['All', ...Array.from(new Set(videos.map((video) => video.industry).filter(Boolean)))];
  const clients = ['All', ...Array.from(new Set(videos.map((video) => video.client).filter(Boolean))).sort()];
  const visible = useMemo(() => videos.filter((video) => {
    const haystack = `${video.title} ${video.client} ${video.kind} ${video.industry} ${video.searchTerms ?? ''}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (kind === 'All' || video.kind === kind) && (industry === 'All' || video.industry === industry) && (client === 'All' || video.client === client);
  }), [videos, query, kind, industry, client]);
  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get('play');
    const requestedVideo = videos.find((video) => video.id === requestedId);
    if (requestedVideo) setActive(requestedVideo);
  }, [videos]);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('.library-card'));
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cards.forEach((card) => card.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!featured) return;
    const rail = gridRef.current;
    if (!rail) return;
    const update = () => {
      const maxScroll = rail.scrollWidth - rail.clientWidth;
      const size = Math.max(12, (rail.clientWidth / rail.scrollWidth) * 56);
      const position = maxScroll > 0 ? (rail.scrollLeft / maxScroll) * (100 - size) : 0;
      setRailScroll({ size, position });
    };
    update();
    rail.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(rail);
    return () => { rail.removeEventListener('scroll', update); observer.disconnect(); };
  }, [featured, visible.length]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || featured || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const media = Array.from(grid.querySelectorAll<HTMLElement>('.project-media'));
    let frame = 0;
    const update = () => {
      frame = 0;
      const viewportCenter = window.innerHeight / 2;
      media.forEach((item) => {
        const bounds = item.getBoundingClientRect();
        const distance = (viewportCenter - (bounds.top + bounds.height / 2)) / window.innerHeight;
        const shift = Math.max(-34, Math.min(34, distance * 54));
        item.style.setProperty('--media-parallax-y', `${shift.toFixed(2)}px`);
      });
    };
    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    return () => {
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [featured, visible.length]);
  const cards = visible.map((video) => <button className={featured ? 'project' : 'library-card'} onClick={() => setActive(video)} key={video.id}><div className="project-media"><img src={video.thumbnail} alt="" /><span className="play">Play film ↗</span></div><div className="project-meta"><span>{video.kind || 'Selected work'}</span><h3>{video.client ? `${video.client} — ` : ''}{video.title}</h3><span>{video.year} / {video.duration}</span></div></button>);
  return <>
    {!featured && <div className="gallery-controls"><label><span>Search work</span><input value={query} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="Client, project, or keyword" /></label>{clients.length > 2 && <label className="filter-group client-work-filter"><span>Client</span><span className="work-select-wrap"><select aria-label="Filter work by client" value={client} onChange={(event) => setClient(event.target.value)}>{clients.map((item) => <option value={item} key={item}>{item === 'All' ? 'All clients' : item}</option>)}</select><i aria-hidden="true">⌄</i></span></label>}{kinds.length > 2 && <div className="filter-group"><span>Format</span><div>{kinds.map((item) => <button className={kind === item ? 'active' : ''} onClick={() => setKind(item)} key={item}>{item}</button>)}</div></div>}{industries.length > 2 && <div className="filter-group"><span>Industry</span><div>{industries.map((item) => <button className={industry === item ? 'active' : ''} onClick={() => setIndustry(item)} key={item}>{item}</button>)}</div></div>}<a className="work-collections-link" href="/our-work/collections">Collections <span aria-hidden="true">↗</span></a><p className="result-count" aria-live="polite">{visible.length} films</p></div>}
    {featured ? <div className="featured-rail-shell"><div ref={gridRef} className="work-grid featured-work-rail" aria-label="Selected work gallery">{cards}</div><div className="featured-scrollbar" aria-hidden="true"><span style={{ width: `${railScroll.size}%`, left: `${railScroll.position}%` }} /></div></div> : <div ref={gridRef} className="library-grid">{cards}</div>}
    {active && <div className="video-modal" role="dialog" aria-modal="true" aria-label={active.title} onMouseDown={(event) => { if (event.target === event.currentTarget) setActive(null); }}><div className="modal-shell"><div className="modal-bar"><p>{active.client} — {active.title}</p><button onClick={() => setActive(null)}>Close ×</button></div><div className="modal-player"><iframe src={vimeoPlayerUrl(active, true)} title={active.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen /></div></div></div>}
  </>;
}
