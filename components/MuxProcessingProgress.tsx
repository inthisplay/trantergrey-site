import { processingLabel, type ProcessingProgress } from '@/lib/mux-upload-status';

export function MuxProcessingProgress({ processing, uploadPercent }: { processing?: ProcessingProgress | null; uploadPercent?: number }) {
  const percent = uploadPercent ?? processing?.percent ?? undefined;
  return <div className="mux-processing-progress" role="status"><span>{uploadPercent !== undefined ? `${uploadPercent}% uploaded` : processingLabel(processing)}</span><progress max={100} value={percent} aria-label={uploadPercent !== undefined ? 'File upload' : 'Video processing'} /></div>;
}
