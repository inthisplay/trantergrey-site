/** Touch hold recognizer; movement and scrolling must never become menu actions. */
export function createPressHold<T>(activate: (target: T, x: number, y: number) => void) {
  let pending: { target: T; x: number; y: number; pointerId: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let suppressed: { target: T; until: number } | null = null;
  const cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; pending = null; };
  const fire = () => {
    if (!pending) return false;
    const hold = pending; cancel();
    suppressed = { target: hold.target, until: Date.now() + 1500 };
    activate(hold.target, hold.x, hold.y); return true;
  };
  return {
    start(target: T, x: number, y: number, pointerId: number) { cancel(); suppressed = null; pending = { target, x, y, pointerId }; timer = setTimeout(fire, 500); },
    move(x: number, y: number, pointerId: number) { if (pending?.pointerId === pointerId && Math.hypot(x - pending.x, y - pending.y) > 10) cancel(); },
    end(pointerId: number) { if (pending?.pointerId === pointerId) cancel(); if (suppressed) suppressed.until = Date.now() + 800; },
    cancel,
    fire,
    suppresses(target: T) { return suppressed?.target === target && Date.now() < suppressed.until; },
  };
}
