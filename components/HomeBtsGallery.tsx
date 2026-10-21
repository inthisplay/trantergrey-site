'use client';

import { useEffect, useRef, useState } from 'react';

type BtsFrame = {
  src: string;
  alt: string;
};

const frames: BtsFrame[] = [
  { src: '/assets/home-bts/golf-silhouette.jpg', alt: 'Camera operator filming on a hill at sunset' },
  { src: '/assets/home-bts/pilates-production.jpg', alt: 'Production crew filming in a Pilates studio' },
  { src: '/assets/home-bts/camera-kit.jpg', alt: 'Cinema camera equipment prepared for a shoot' },
  { src: '/assets/home-bts/sail-production.jpg', alt: 'Production team filming aboard a sailboat at sunset' },
  { src: '/assets/home-bts/office-production.jpg', alt: 'Camera and lighting setup in an office' },
  { src: '/assets/home-bts/water-production.jpg', alt: 'Camera operator filming from the water' },
  { src: '/assets/home-bts/restaurant-production.jpg', alt: 'Production crew filming a restaurant scene' },
  { src: '/assets/home-bts/construction-interview.jpg', alt: 'Interview production at a construction site' },
  { src: '/assets/home-bts/studio-production.jpg', alt: 'Crew filming in a studio' },
  { src: '/assets/home-bts/dune-production.jpg', alt: 'Camera operator filming among dunes' },
  { src: '/assets/home-bts/church-production.jpg', alt: 'Production crew filming in a church' },
  { src: '/assets/home-bts/holiday-production.jpg', alt: 'Camera filming a holiday performance' },
  { src: '/assets/home-bts/press-credential.jpg', alt: 'Press credential at a White House event' },
  { src: '/assets/home-bts/construction-site.jpg', alt: 'Production at a construction site' },
  { src: '/assets/home-bts/sail-film.jpg', alt: 'Camera crew filming aboard a sailboat' },
  { src: '/assets/home-bts/island-production.jpg', alt: 'Camera operator working by the sea' },
  { src: '/assets/home-bts/event-production.jpg', alt: 'Camera filming a live event' },
  { src: '/assets/home-bts/cathedral-production.jpg', alt: 'Camera operator filming in a cathedral' },
];

export function HomeBtsGallery() {
  const [galleryFrames, setGalleryFrames] = useState(frames);
  const [leavingIndex, setLeavingIndex] = useState<number | null>(null);
  const [entrySide, setEntrySide] = useState<'left' | 'right' | null>(null);
  const pendingTimers = useRef<number[]>([]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const rotateFrame = () => {
      const centralFrame = 4 + Math.floor(Math.random() * 4);
      const side = Math.random() > 0.5 ? 'left' : 'right';
      setLeavingIndex(centralFrame);

      pendingTimers.current.push(window.setTimeout(() => {
        setGalleryFrames((currentFrames) => {
          const nextFrames = [...currentFrames];
          const [departingFrame] = nextFrames.splice(centralFrame, 1);

          if (side === 'left') {
            const incomingFrame = nextFrames.pop();
            if (incomingFrame) nextFrames.unshift(incomingFrame);
          }

          nextFrames.push(departingFrame);
          return nextFrames;
        });
        setLeavingIndex(null);
        setEntrySide(side);
        pendingTimers.current.push(window.setTimeout(() => setEntrySide(null), 720));
      }, 720));
    };

    pendingTimers.current.push(window.setTimeout(rotateFrame, 4600));
    const interval = window.setInterval(rotateFrame, 7200);

    return () => {
      window.clearInterval(interval);
      pendingTimers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return <section className={`home-bts-gallery${entrySide ? ` is-entering-from-${entrySide}` : ''}`} aria-label="Behind the scenes at TranterGrey productions">
    <div className="home-bts-gallery-grid">
      {galleryFrames.map((frame, index) => <figure className={index === leavingIndex ? 'is-leaving' : ''} key={frame.src}>
        <img src={frame.src} alt={frame.alt} />
      </figure>)}
    </div>
  </section>;
}
