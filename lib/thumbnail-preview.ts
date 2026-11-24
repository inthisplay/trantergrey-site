/** Keep the previous frame visible until the newest request has loaded and decoded. */
export function createThumbnailPreviewLoader(onReady: (url: string) => void, onError: (url: string) => void) {
  let cancel: (() => void) | undefined;
  return {
    load(url: string) {
      cancel?.();
      let active = true;
      let image: HTMLImageElement | undefined;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const finish = (success: boolean) => {
        if (!active) return;
        active = false;
        clearTimeout(deadline);
        if (image) image.onload = image.onerror = null;
        (success ? onReady : onError)(url);
      };
      const debounce = setTimeout(() => {
        image = new Image();
        image.onload = () => {
          if (image?.decode) void image.decode().then(() => finish(true), () => finish(false));
          else finish(true);
        };
        image.onerror = () => finish(false);
        deadline = setTimeout(() => finish(false), 12000);
        image.src = url;
      }, 160);
      cancel = () => { active = false; clearTimeout(debounce); clearTimeout(deadline); if (image) image.onload = image.onerror = null; };
    },
    dispose() { cancel?.(); },
  };
}

export function thumbnailFrameTime(value: number, duration: number) {
  const max = Number.isFinite(duration) && duration > 0 ? Math.max(0, Math.floor((duration - .1) * 10) / 10) : 0;
  return Math.min(max, Math.max(0, Number.isFinite(value) ? Math.round(value * 10) / 10 : 0));
}
