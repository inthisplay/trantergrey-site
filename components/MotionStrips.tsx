'use client';

import { useEffect, useRef, useState } from 'react';
import type { Video } from '@/lib/videos';
import { vimeoPlayerUrl } from '@/lib/videos';

export function MotionStrips({ videos }: { videos: Video[] }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [preloadedIds, setPreloadedIds] = useState<Set<string>>(new Set());
  const [readyIds, setReadyIds] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState(true);
  const stripRefs = useRef<Array<HTMLElement | null>>([]);
  const playerRefs = useRef(new Map<string, HTMLIFrameElement>());

  useEffect(() => {
    let frame = 0;
    const updateParallax = () => {
      frame = 0;
      const viewportCenter = window.innerHeight / 2;
      stripRefs.current.forEach((strip) => {
        if (!strip) return;
        const rect = strip.getBoundingClientRect();
        const offset = Math.max(-1, Math.min(1, (rect.top + rect.height / 2 - viewportCenter) / window.innerHeight));
        strip.style.setProperty('--strip-parallax', `${Math.round(offset * -26)}px`);
      });
    };
    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateParallax);
    };
    updateParallax();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    return () => {
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [videos.length]);

  const activate = (id: string) => {
    setPreloadedIds((ids) => ids.has(id) ? ids : new Set(ids).add(id));
    setHoveredId(id);
  };

  const setPlayerMuted = (id: string, shouldMute: boolean) => {
    playerRefs.current.get(id)?.contentWindow?.postMessage({ method: 'setMuted', value: shouldMute }, 'https://player.vimeo.com');
    setMuted(shouldMute);
  };

  const openFilm = (id: string) => {
    setPreloadedIds((ids) => ids.has(id) ? ids : new Set(ids).add(id));
    setExpandedId(id);
    setMuted(true);
    window.requestAnimationFrame(() => setPlayerMuted(id, true));
  };

  return <section className="motion-strips" aria-label="Featured films">
    <div className="motion-strips-list">
      {videos.map((video, index) => {
        const expanded = expandedId === video.id;
        const active = expanded || hoveredId === video.id;
        const preloaded = preloadedIds.has(video.id);
        const ready = readyIds.has(video.id);
        return <article className={`motion-strip ${active ? 'is-active' : ''} ${expanded ? 'is-expanded' : ''} ${ready ? 'is-ready' : ''}`} key={video.id} ref={(element) => { stripRefs.current[index] = element; }} onMouseEnter={() => { if (!expandedId) activate(video.id); }} onMouseLeave={() => { if (!expandedId) setHoveredId(null); }}>
          <button className="motion-strip-trigger" type="button" onClick={() => openFilm(video.id)} aria-expanded={expanded} aria-label={`Play ${video.title}`}>
            <img className="motion-strip-thumb" src={video.thumbnail} alt="" />
            <span className="motion-strip-wash" />
            <span className="motion-strip-vignette" />
            <span className="motion-strip-meta"><span>{String(index + 1).padStart(2, '0')} / {video.client || 'TranterGrey'}</span><i>Play film ↗</i></span>
          </button>
          {preloaded && <div className={`motion-strip-player ${active ? 'is-visible' : ''}`} aria-hidden="true"><iframe ref={(frame) => { if (frame) playerRefs.current.set(video.id, frame); else playerRefs.current.delete(video.id); }} src={`${vimeoPlayerUrl(video, true)}&background=1&muted=1&loop=1&autopause=0`} title="" allow="autoplay" onLoad={() => { setReadyIds((ids) => ids.has(video.id) ? ids : new Set(ids).add(video.id)); setPlayerMuted(video.id, true); }} /></div>}
          {expanded && <div className="motion-strip-controls"><button type="button" onClick={() => { setExpandedId(null); setHoveredId(null); }} aria-label={`Close ${video.title}`}>×</button><button type="button" onClick={() => setPlayerMuted(video.id, !muted)}>{muted ? 'Unmute' : 'Mute'}</button></div>}
        </article>;
      })}
    </div>
  </section>;
}
