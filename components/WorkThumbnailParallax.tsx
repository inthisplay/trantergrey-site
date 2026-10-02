'use client';

import { useEffect } from 'react';

export function WorkThumbnailParallax() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      document.querySelectorAll<HTMLElement>('.library-card .project-media').forEach((media) => {
        const bounds = media.getBoundingClientRect();
        const centerOffset = (window.innerHeight * 0.5) - (bounds.top + bounds.height * 0.5);
        const shift = Math.max(-18, Math.min(18, centerOffset * 0.055));
        media.style.setProperty('--work-thumbnail-shift', `${shift.toFixed(2)}px`);
      });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
