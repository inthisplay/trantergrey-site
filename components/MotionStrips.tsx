'use client';

import { useEffect, useRef, useState } from 'react';
import { VideoModal } from '@/components/VideoModal';
import { useMuxShowcaseVideos } from '@/components/useMuxShowcaseVideos';
import type { Video } from '@/lib/videos';

export function MotionStrips({ videos }: { videos: Video[] }) {
  const resolvedVideos = useMuxShowcaseVideos(videos);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [active, setActive] = useState<Video | null>(null);
  const stripRefs = useRef<Array<HTMLElement | null>>([]);

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
    const requestUpdate = () => { if (!frame) frame = window.requestAnimationFrame(updateParallax); };
    updateParallax();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    return () => {
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [resolvedVideos.length]);

  return <section className="motion-strips" aria-label="Featured films">
    <div className="motion-strips-list">
      {resolvedVideos.map((video, index) => <article className={`motion-strip${hoveredId === video.id ? ' is-active' : ''}`} key={video.id} ref={(element) => { stripRefs.current[index] = element; }} onMouseEnter={() => setHoveredId(video.id)} onMouseLeave={() => setHoveredId(null)}>
        <button className="motion-strip-trigger" type="button" onClick={() => setActive(video)} aria-label={`Play ${video.title}`}>
          <img className="motion-strip-thumb" src={video.thumbnail} alt="" />
          <span className="motion-strip-wash" />
          <span className="motion-strip-vignette" />
          <span className="motion-strip-meta"><span>{String(index + 1).padStart(2, '0')} / {video.client || 'TranterGrey'}</span><i>Play film ↗</i></span>
        </button>
      </article>)}
    </div>
    <VideoModal video={active} onClose={() => setActive(null)} />
  </section>;
}
