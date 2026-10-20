'use client';

import { useState } from 'react';

type CaseStudyVimeoStripProps = {
  id: string;
  hash: string;
  thumbnail: string;
  title: string;
};

export function CaseStudyVimeoStrip({ id, hash, thumbnail, title }: CaseStudyVimeoStripProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const source = `https://player.vimeo.com/video/${id}?h=${hash}&title=0&byline=0&portrait=0&dnt=1&controls=1&autoplay=1`;

  return <div className={`case-study-vimeo-strip${isHovered ? ' is-active' : ''}${isExpanded ? ' is-expanded' : ''}`} onMouseEnter={() => !isExpanded && setIsHovered(true)} onMouseLeave={() => !isExpanded && setIsHovered(false)}>
    {!isExpanded && <button type="button" className="case-study-vimeo-strip-trigger" onClick={() => setIsExpanded(true)} aria-label={`Play ${title}`}>
      <img src={thumbnail} alt="" />
      <span className="case-study-vimeo-strip-wash" />
      <span className="case-study-vimeo-strip-vignette" />
      <span className="case-study-vimeo-strip-play" aria-hidden="true"><i /></span>
    </button>}
    {isExpanded && <><iframe src={source} title={title} allow="autoplay; fullscreen; picture-in-picture" /><button className="case-study-vimeo-strip-close" type="button" onClick={() => { setIsExpanded(false); setIsHovered(false); }} aria-label={`Close ${title}`}>×</button></>}
  </div>;
}
