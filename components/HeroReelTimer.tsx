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

    try {
      if (isAudible) {
        await player.setMuted(true);
        hero.classList.remove('is-reel-playing');
        setIsAudible(false);
        return;
      }

      await player.setMuted(false);
      await player.setVolume(1);
      await player.play();
      hero.classList.add('is-reel-playing');
      setIsAudible(true);
    } catch {
      // Vimeo only permits sound after a direct visitor action; leave the quiet reel intact if unavailable.
    }
  };

  return <p className="video-label"><span /> TG Demo Reel / <time>{formatTime(elapsed)}</time><button type="button" onClick={() => void toggleAudio()} aria-pressed={isAudible}>{isAudible ? 'Mute' : 'Play'} <i aria-hidden="true">{isAudible ? 'Ⅱ' : '▶'}</i></button></p>;
}
