'use client';

import { useEffect, useRef } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import { createPressHold } from '@/lib/press-hold';

export function useMediaPressHold(selector: string, onHold: (button: HTMLElement, x: number, y: number) => void, disabled = false) {
  const callback = useRef(onHold); callback.current = onHold;
  const gesture = useRef<ReturnType<typeof createPressHold<HTMLElement>> | null>(null);
  if (!gesture.current) gesture.current = createPressHold((target, x, y) => callback.current(target, x, y));
  const controller = gesture.current;
  useEffect(() => {
    const cancel = () => controller.cancel();
    window.addEventListener('scroll', cancel, true);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => { cancel(); window.removeEventListener('scroll', cancel, true); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', cancel); };
  }, [controller]);
  useEffect(() => { if (disabled) controller.cancel(); }, [controller, disabled]);
  const target = (event: { target: EventTarget }) => event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null;
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.pointerType === 'mouse') return;
      if (!event.isPrimary || disabled) { controller.cancel(); return; }
      const button = target(event); if (button) controller.start(button, event.clientX, event.clientY, event.pointerId);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) { controller.move(event.clientX, event.clientY, event.pointerId); },
    onPointerUp(event: PointerEvent<HTMLElement>) { controller.end(event.pointerId); },
    onPointerCancel() { controller.cancel(); },
    onPointerLeave() { controller.cancel(); },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      const button = target(event);
      if (button && controller.suppresses(button)) { event.preventDefault(); event.stopPropagation(); }
    },
    onContextMenuCapture(event: MouseEvent<HTMLElement>) {
      const button = target(event);
      if (button && (controller.suppresses(button) || controller.fire())) { event.preventDefault(); event.stopPropagation(); }
    },
  };
}
