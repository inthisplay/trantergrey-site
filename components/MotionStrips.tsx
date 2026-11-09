'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { MuxVideo } from '@videojs/react/media/mux-video';
import { useMuxShowcaseVideos } from '@/components/useMuxShowcaseVideos';
import type { Video } from '@/lib/videos';

export function MotionStrips({ videos }: { videos: Video[] }) {
  const resolvedVideos = useMuxShowcaseVideos(videos);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [readyId, setReadyId] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
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

  function closeFilm() {
    videoRef.current?.pause();
    flushSync(() => {
      setExpandedId(null);
      setHoveredId(null);
      setReadyId(null);
      setMuted(true);
    });
    triggerRef.current?.focus({ preventScroll: true });
  }

  function openFilm(id: string, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    // Mount on a tap or keyboard activation before the browser's audio gesture expires.
    flushSync(() => {
      setExpandedId(id);
      setHoveredId(null);
      setMuted(false);
    });
    const element = videoRef.current;
    if (element) {
      element.muted = false;
      element.currentTime = 0;
      void element.play().catch(() => {
        if (videoRef.current !== element) return;
        element.muted = true;
        setMuted(true);
        void element.play().catch(() => undefined);
      });
    }
    closeRef.current?.focus({ preventScroll: true });
  }

  function toggleMute() {
    const element = videoRef.current;
    if (!element) return;
    const next = !element.muted;
    element.muted = next;
    setMuted(next);
    if (element.paused) void element.play().catch(() => undefined);
  }

  return <section className="motion-strips" aria-label="Featured films" onKeyDown={(event) => {
    if (event.key === 'Escape' && expandedId) closeFilm();
  }}>
    <div className="motion-strips-list">
      {resolvedVideos.map((video, index) => {
        const expanded = expandedId === video.id;
        const hovering = !expandedId && hoveredId === video.id;
        const playing = Boolean(video.muxPlaybackId && (hovering || expanded));
        const ready = readyId === video.id;
        return <article
          className={`motion-strip${hovering ? ' is-active' : ''}${expanded ? ' is-expanded' : ''}${ready ? ' is-ready' : ''}`}
          key={video.id}
          ref={(element) => { stripRefs.current[index] = element; }}
          onPointerEnter={(event) => {
            if (!expandedId && event.pointerType === 'mouse' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) setHoveredId(video.id);
          }}
          onPointerLeave={() => {
            if (!expandedId) {
              setHoveredId(null);
              setReadyId(null);
            }
          }}
        >
          <button className="motion-strip-trigger" type="button" disabled={!video.muxPlaybackId || expanded} onClick={(event) => openFilm(video.id, event.currentTarget)} aria-expanded={expanded} aria-label={`Play ${video.title}`}>
            <img className="motion-strip-thumb" src={video.thumbnail} alt="" />
            <span className="motion-strip-wash" />
            <span className="motion-strip-vignette" />
            <span className="motion-strip-meta"><span>{String(index + 1).padStart(2, '0')} / {video.client || 'TranterGrey'}</span><i>Play film ↗</i></span>
          </button>
          {playing && <div className={`motion-strip-player${ready || expanded ? ' is-visible' : ''}`} aria-hidden={!expanded}>
            <MuxVideo
              ref={videoRef}
              source={{ playbackId: video.muxPlaybackId! }}
              poster={video.thumbnail}
              autoPlay={hovering}
              loop={hovering}
              muted={!expanded || muted}
              playsInline
              aria-label={video.title}
              onPlaying={() => setReadyId(video.id)}
              onLoadedMetadata={(event) => {
                const element = event.currentTarget;
                if (element.videoWidth && element.videoHeight) {
                  stripRefs.current[index]?.style.setProperty('--strip-ratio', String(element.videoWidth / element.videoHeight));
                }
              }}
            />
          </div>}
          {expanded && <div className="motion-strip-controls">
            <button ref={closeRef} type="button" onClick={closeFilm} aria-label={`Close ${video.title}`}>×</button>
            <button type="button" onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
          </div>}
        </article>;
      })}
    </div>
  </section>;
}
