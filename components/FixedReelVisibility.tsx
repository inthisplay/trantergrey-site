'use client';

import { useEffect } from 'react';

export function FixedReelVisibility() {
  useEffect(() => {
    const hero = document.querySelector('.hero');
    const backdrop = document.querySelector<HTMLElement>('.site-video-backdrop');
    const player = backdrop?.querySelector<HTMLIFrameElement>('iframe');
    const filmTexture = document.querySelector<HTMLElement>('.film-texture-backdrop');
    const filmTextureVideo = filmTexture?.querySelector<HTMLVideoElement>('video');
    const page = document.querySelector<HTMLElement>('main#top');
    const motionStrips = document.querySelector<HTMLElement>('.motion-strips');
    if (!hero || !backdrop || !player || !filmTexture || !filmTextureVideo || !page || !motionStrips) return;

    const sendPlayerCommand = (method: 'pause' | 'play') => {
      player.contentWindow?.postMessage({ method }, 'https://player.vimeo.com');
    };

    const showFilmTexture = () => {
      filmTexture.classList.add('is-visible');
      page.classList.add('has-film-texture');
      void filmTextureVideo.play().catch(() => undefined);
    };

    const hideFilmTexture = () => {
      filmTexture.classList.remove('is-visible');
      page.classList.remove('has-film-texture');
      filmTextureVideo.pause();
    };

    let wasCovered = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        backdrop.classList.remove('is-covered');
        hideFilmTexture();
        if (wasCovered) sendPlayerCommand('play');
        wasCovered = false;
        return;
      }

      backdrop.classList.add('is-covered');
      sendPlayerCommand('pause');
      wasCovered = true;
    }, { threshold: 0 });

    const textureObserver = new IntersectionObserver(() => {
      // The first callback happens while the strip rail is still below the fold.
      // Only reveal the texture after the rail's bottom has crossed above the viewport.
      if (motionStrips.getBoundingClientRect().bottom <= 0) {
        showFilmTexture();
      } else {
        hideFilmTexture();
      }
    }, { threshold: 0 });

    observer.observe(hero);
    textureObserver.observe(motionStrips);
    return () => {
      observer.disconnect();
      textureObserver.disconnect();
      hideFilmTexture();
    };
  }, []);

  return null;
}
