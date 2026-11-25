import type { AdminEnvironment } from './admin';

declare const FixedLengthStream: { new(size: number): { readable: ReadableStream; writable: WritableStream } };
export class UploadError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Stream with backpressure; never allocate a buffer proportional to the file. */
export async function storePrivateUpload(env: AdminEnvironment, request: Request, key: string, size: number, contentType: string) {
  if (!request.body || !env.PRODUCTION_ARCHIVE) throw new UploadError('Upload storage is unavailable.', 503);
  const stream = new FixedLengthStream(size);
  const reader = request.body.getReader();
  const writer = stream.writable.getWriter();
  let bytes = 0;
  const transfer = (async () => {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > size) throw new UploadError('File exceeds the declared upload size.', 413);
        await writer.write(chunk.value);
      }
      if (bytes !== size) throw new UploadError('Upload was incomplete. Please retry.', 400);
      await writer.close();
    } catch (error) {
      await writer.abort(error).catch(() => {});
      await reader.cancel().catch(() => {});
      throw error;
    } finally { reader.releaseLock(); }
  })();
  const storage = env.PRODUCTION_ARCHIVE.put(key, stream.readable, { httpMetadata: { contentType } }).catch(async () => {
    await writer.abort().catch(() => {});
    await reader.cancel().catch(() => {});
    throw new UploadError('The file could not be stored. Please retry.', 503);
  });
  const results = await Promise.allSettled([transfer, storage]);
  for (const result of results) if (result.status === 'rejected') {
    if (result.reason instanceof UploadError) throw result.reason;
    throw new UploadError('The file could not be stored completely. Please retry.', 503);
  }
}
