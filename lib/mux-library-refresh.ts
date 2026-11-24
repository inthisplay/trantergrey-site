/** One fresh snapshot per mounted library, shared by concurrent/filter reads. */
export function createMuxLibraryRefresh() {
  let initial: Promise<void> | undefined;
  let inFlight: Promise<void> | undefined;
  function refresh() {
    if (!inFlight) {
      inFlight = (async () => {
        const response = await fetch('/api/admin/mux-refresh', { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw new Error('The Mux cache could not be refreshed. Displayed videos may be out of date.');
      })().finally(() => { inFlight = undefined; });
    }
    return inFlight;
  }
  return { ensure: () => initial ??= refresh(), retry: () => initial = refresh() };
}

/** Apply deletion confirmations even to an older response that arrives later. */
export function excludeDeletedMuxAssets<T extends { id: string }>(assets: T[], deleted: ReadonlySet<string>): T[] {
  return assets.filter(asset => !deleted.has(asset.id));
}
