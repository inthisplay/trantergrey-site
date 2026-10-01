'use client';

import Player from '@vimeo/player';
import { useEffect, useState } from 'react';

const formatTime = (seconds: number) => {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`;
};

export function HeroReelTimer() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const iframe = document.getElementById('hero-reel');
    if (!(iframe instanceof HTMLIFrameElement)) return;

    const player = new Player(iframe);
    const updateTime = ({ seconds }: { seconds: number }) => setElapsed(seconds);

    player.on('timeupdate', updateTime);
    void player.ready().then(() => player.getCurrentTime()).then(setElapsed).catch(() => undefined);

    return () => player.off('timeupdate', updateTime);
  }, []);

  return <p className="video-label"><span /> TG Demo Reel / <time>{formatTime(elapsed)}</time></p>;
}
