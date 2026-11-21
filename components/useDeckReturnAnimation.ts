'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

/** Animate the restored layout from the last on-screen drag positions. */
export function useDeckReturnAnimation() {
  const boardRef = useRef<HTMLDivElement>(null);
  const previousRects = useRef<DOMRect[] | null>(null);
  const animations = useRef<Animation[]>([]);
  const restoreOverflow = useRef<(() => void) | null>(null);
  const cancelAnimations = () => {
    animations.current.forEach(animation => animation.cancel());
    animations.current = [];
    restoreOverflow.current?.();
    restoreOverflow.current = null;
  };
  const prepareReturn = (enabled: boolean) => {
    cancelAnimations();
    previousRects.current = enabled && !matchMedia('(prefers-reduced-motion: reduce)').matches
      ? Array.from(boardRef.current?.children || [], column => column.getBoundingClientRect())
      : null;
  };
  useLayoutEffect(() => {
    const before = previousRects.current;
    if (!before || !boardRef.current) return;
    previousRects.current = null;
    const board = boardRef.current;
    const overflow = board.style.overflow;
    board.style.overflow = 'clip';
    const restore = () => { board.style.overflow = overflow; };
    restoreOverflow.current = restore;
    Array.from(boardRef.current.children).forEach((column, index) => {
      const from = before[index];
      const to = column.getBoundingClientRect();
      if (!from || !to.width || !to.height) return;
      const animation = column.animate([
        { transformOrigin: 'top left', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})` },
        { transformOrigin: 'top left', transform: 'translate(0, 0) scale(1, 1)' },
      ], { duration: 420, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      animations.current.push(animation);
    });
    void Promise.allSettled(animations.current.map(animation => animation.finished)).then(() => {
      if (restoreOverflow.current === restore) { restore(); restoreOverflow.current = null; }
    });
  });
  useEffect(() => () => cancelAnimations(), []);
  return { boardRef, prepareReturn };
}
