'use client';

import { useEffect } from 'react';

const revealSelector = [
  '.intro .section-index',
  '.intro > div',
  '.work .section-index',
  '.work-summary',
  '.featured-rail-shell',
  '.client-roster .section-index',
  '.client-logo',
  '[data-statement-word]',
  '.capabilities > .section-index',
  '.capability-list details',
  '.contact-intro',
  '.project-inquiry',
].join(', ');

export function HomepageMotion() {
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) return;

    document.documentElement.classList.add('homepage-motion-ready');
    const items = Array.from(document.querySelectorAll<HTMLElement>(revealSelector));
    items.forEach((item) => item.dataset.reveal = '');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -9% 0px' });

    items.forEach((item) => observer.observe(item));
    return () => {
      observer.disconnect();
      items.forEach((item) => {
        delete item.dataset.reveal;
        item.classList.remove('is-revealed');
      });
      document.documentElement.classList.remove('homepage-motion-ready');
    };
  }, []);

  return null;
}
