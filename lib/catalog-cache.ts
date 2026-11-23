/** Memory-only cache. Revision checks prevent pre-edit responses from restoring stale data. */
export function createCatalogCache<T>(fetchCatalog: () => Promise<T>, ttlMs = 120_000, now = Date.now) {
  let revision = 0;
  let cached: { value: T; expires: number } | undefined;
  let pending: { revision: number; promise: Promise<T> } | undefined;
  let writes = 0;
  let writeBarrier: Promise<void> | undefined;
  let releaseWrites: (() => void) | undefined;
  function invalidate() { revision++; cached = undefined; pending = undefined; }
  async function read(): Promise<T> {
    if (writeBarrier) { await writeBarrier; return read(); }
    if (cached && cached.expires > now()) return cached.value;
    if (pending?.revision === revision) return pending.promise;
    const started = revision;
    const promise = (async () => {
      try {
        const value = await fetchCatalog();
        if (started !== revision) return read();
        cached = { value, expires: now() + ttlMs };
        return value;
      } catch (error) {
        if (started !== revision) return read();
        throw error;
      } finally {
        if (pending?.revision === started) pending = undefined;
      }
    })();
    pending = { revision: started, promise };
    return promise;
  }
  async function change<R>(save: () => Promise<R>): Promise<R> {
    if (writes++ === 0) writeBarrier = new Promise(resolve => { releaseWrites = resolve; });
    invalidate();
    let result: R;
    try { result = await save(); }
    finally {
      // Failed/network-interrupted saves also invalidate: the server may have committed.
      invalidate();
      if (--writes === 0) { writeBarrier = undefined; releaseWrites?.(); releaseWrites = undefined; }
    }
    // A failed refresh must not turn an already successful edit into a failed save.
    // The cache stays empty and the next consumer retries normally.
    await read().catch(() => undefined);
    return result;
  }
  return { read, change, invalidate };
}
