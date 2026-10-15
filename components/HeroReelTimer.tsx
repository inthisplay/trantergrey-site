'use client';

import Player from '@vimeo/player';
import { useEffect, useRef, useState } from 'react';

const formatTime = (seconds: number) => {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`;
};

export function HeroReelTimer() {
  const [elapsed, setElapsed] = useState(0);
  const [isAudible, setIsAudible] = useState(false);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    const iframe = document.getElementById('hero-reel');
    if (!(iframe instanceof HTMLIFrameElement)) return;

    const player = new Player(iframe);
    playerRef.current = player;
    const updateTime = ({ seconds }: { seconds: number }) => setElapsed(seconds);

    player.on('timeupdate', updateTime);
    void player.ready().then(() => player.getCurrentTime()).then(setElapsed).catch(() => undefined);

    return () => {
      player.off('timeupdate', updateTime);
      playerRef.current = null;
    };
  }, []);

  const toggleAudio = async () => {
    const player = playerRef.current;
    const hero = document.querySelector<HTMLElement>('.hero');
    if (!player || !hero) return;

    if (isAudible) {
      hero.classList.remove('is-reel-playing');
      setIsAudible(false);
      void player.setMuted(true);
      return;
    }

    // Update the site immediately; Vimeo's play promise can resolve a beat later.
    hero.classList.add('is-reel-playing');
    setIsAudible(true);
    try {
      await player.setMuted(false);
      await player.setVolume(1);
      await player.play();
    } catch {
      // Keep the regular, quiet treatment if Vimeo rejects the requested sound state.
      hero.classList.remove('is-reel-playing');
      setIsAudible(false);
    }
  };

  return <p className="video-label"><span /> TG Demo Reel / <time>{formatTime(elapsed)}</time><button type="button" onClick={() => void toggleAudio()} aria-pressed={isAudible}>{isAudible ? 'Exit reel' : 'Play'} <i aria-hidden="true">{isAudible ? 'Ⅱ' : '▶'}</i></button></p>;
}
