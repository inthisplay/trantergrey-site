'use client';

import { useState } from 'react';

type VimeoPlayGateProps = {
  id: string;
  hash: string;
  title: string;
};

export function VimeoPlayGate({ id, hash, title }: VimeoPlayGateProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const source = `https://player.vimeo.com/video/${id}?h=${hash}&title=0&byline=0&portrait=0&dnt=1&controls=${isPlaying ? '1&autoplay=1' : '0'}`;

  return (
    <div className={`vimeo-play-gate${isPlaying ? ' is-playing' : ''}`}>
      <iframe
        key={isPlaying ? 'playing' : 'idle'}
        src={source}
        allow="autoplay; fullscreen; picture-in-picture"
        title={title}
      />
      {!isPlaying && <button className="vimeo-play-gate-button" type="button" onClick={() => setIsPlaying(true)} aria-label={`Play ${title}`}><span /></button>}
    </div>
  );
}
