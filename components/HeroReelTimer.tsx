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

  return <p className="video-label">TG Demo Reel / <time>{formatTime(elapsed)}</time><button className={`hero-audio-toggle${isAudible ? ' is-audible' : ''}`} type="button" onClick={() => void toggleAudio()} aria-pressed={isAudible} aria-label={isAudible ? 'Mute TG Demo Reel' : 'Unmute TG Demo Reel'}><span className="hero-audio-bars" aria-hidden="true"><i /><i /><i /></span><svg className="hero-audio-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M4 10v4h4l5 4V6L8 10H4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />{isAudible ? <><path d="M16 9.5a4 4 0 0 1 0 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><path d="M18.8 6.7a8 8 0 0 1 0 10.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></> : <path d="m16 9 5 6m0-6-5 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}</svg></button></p>;
}
