/** User-facing diagnostics use only known phases/status codes, never raw URLs or errors. */
export type UploadPhase = 'prepare' | 'transfer' | 'status' | 'metadata';
export class UploadRequestError extends Error {
  constructor(public phase: UploadPhase, public status?: number) { super(`${phase} request failed`); }
}

export function uploadFailureMessage(phase: UploadPhase, status?: number): string {
  if (phase === 'prepare') {
    if (status === 401 || status === 403) return 'Upload not started · sign in again, then choose the file again. No video data was sent.';
    return `Upload not started · ${status ? `the upload service returned HTTP ${status}` : 'the upload service could not be reached'}. Retry when your connection is stable. No video data was sent.`;
  }
  if (phase === 'transfer') {
    if (status) return `Transfer rejected · Mux returned HTTP ${status}. Check the library first; if the video is absent, choose the file again to retry with a fresh upload.`;
    return 'Transfer interrupted · the browser could not confirm delivery to Mux. This can be a connection or service issue. Check the library before retrying to avoid a duplicate; if the video is absent, retry on a stable connection.';
  }
  if (phase === 'metadata') return 'Video received · its details could not be saved. Do not upload it again. Retry Save upload details when your connection is stable.';
  return 'Wait · your file was received, but status is temporarily unavailable. We’ll check again automatically. Do not upload it again.';
}

export const isTerminalUploadStatus = (status?: string) => ['errored', 'error', 'cancelled', 'timed_out'].includes(status || '');
export function terminalUploadMessage(status?: string): string | undefined {
  if (status === 'errored' || status === 'error') return 'Mux processing failed · Mux could not process this file. Check that the source video plays correctly, then re-export or retry it. Waiting will not finish this attempt.';
  if (status === 'timed_out') return 'Upload expired · Mux stopped waiting for this file. Check the library; if the video is absent, choose the file again to retry.';
  if (status === 'cancelled') return 'Upload cancelled · this attempt will not continue. Choose the file again if you still want to upload it.';
}

export function transferMuxFile(file: File, url: string, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    request.onerror = request.onabort = request.ontimeout = () => reject(new UploadRequestError('transfer'));
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new UploadRequestError('transfer', request.status || undefined));
    request.open('PUT', url);
    request.send(file);
  });
}
