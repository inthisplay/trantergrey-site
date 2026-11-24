import { terminalUploadMessage, uploadFailureMessage } from './mux-upload-errors';
export type ProcessingProgress = { state: string; percent: number | null };
export type UploadStatus = { assetId: string | null; ready: boolean; status?: string; processing?: ProcessingProgress | null };

export function normalizeProcessing(value: { state?: unknown; progress?: unknown } | null | undefined): ProcessingProgress | null {
  if (!value || typeof value.state !== 'string') return null;
  const percent = value.state === 'transcoding' && typeof value.progress === 'number' && Number.isFinite(value.progress) && value.progress >= 0 && value.progress <= 100 ? Math.floor(value.progress) : null;
  return { state: value.state, percent };
}

export function processingLabel(processing?: ProcessingProgress | null) {
  return processing?.state === 'transcoding' && processing.percent != null ? `Processing · ${processing.percent}%` : 'Preparing playback';
}

export class UploadStatusError extends Error {}
export async function readUploadStatus(uploadId: string, signal?: AbortSignal): Promise<UploadStatus> {
  const response = await fetch(`/api/admin/mux-uploads?uploadId=${encodeURIComponent(uploadId)}`, { cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
  if (!response.ok) {
    if ([400, 401, 403, 404].includes(response.status)) throw new UploadStatusError(response.status === 401 || response.status === 403 ? 'Sign in again to check this upload. Your uploaded file has not been removed.' : 'This upload could not be found. Check the library before uploading again.');
    throw new Error('Status temporarily unavailable');
  }
  return response.json();
}

// A long encode or temporary outage is not an upload failure. Only explicit
// terminal states stop this wait. Callers abort when their component unmounts.
export async function waitForUpload(uploadId: string, signal: AbortSignal, onStatus: (status: UploadStatus) => void, readyOnly = true, onNotice?: (notice: string | undefined) => void) {
  while (!signal.aborted) {
    try {
      const status = await readUploadStatus(uploadId, signal);
      onNotice?.(undefined);
      onStatus(status);
      const terminalMessage = terminalUploadMessage(status.status);
      if (terminalMessage) throw new UploadStatusError(terminalMessage);
      if (status.assetId && (!readyOnly || status.ready)) return status.assetId;
    } catch (error) {
      if (signal.aborted || error instanceof UploadStatusError) throw error;
      onNotice?.(uploadFailureMessage('status'));
    }
    await new Promise<void>((resolve) => {
      const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
      const timer = setTimeout(done, 5000);
      signal.addEventListener('abort', done, { once: true });
    });
  }
  throw new DOMException('Stopped checking upload', 'AbortError');
}


/** A missing PUT response is ambiguous; only an asset ID confirms receipt. */
export async function confirmInterruptedTransfer(uploadId: string, transferError: unknown, signal?: AbortSignal): Promise<UploadStatus> {
  const status = await readUploadStatus(uploadId, signal).catch(() => null);
  const terminalMessage = terminalUploadMessage(status?.status);
  if (terminalMessage) throw new UploadStatusError(terminalMessage);
  if (!status?.assetId) throw transferError;
  return status;
}
