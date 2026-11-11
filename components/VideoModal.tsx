'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MuxVideoPlayer } from '@/components/SoloVideoPlayer';
import type { Video } from '@/lib/videos';

export type ModalVideo = Pick<Video, 'id' | 'title' | 'client' | 'thumbnail' | 'muxPlaybackId'>;

export function VideoModal({ video, onClose, children }: { video: ModalVideo | null; onClose: () => void; children?: ReactNode }) {
  useEffect(() => {
    if (!video) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); };
  }, [video, onClose]);

  if (!video?.muxPlaybackId || typeof document === 'undefined') return null;
  return createPortal(
    <div className="video-modal" role="dialog" aria-modal="true" aria-label={video.title} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-shell"><div className="modal-bar"><p>{video.client} — {video.title}</p><button autoFocus onClick={onClose}>Close ×</button></div>{children ? <div className="modal-body">{children}</div> : <div className="modal-player"><MuxVideoPlayer key={video.muxPlaybackId} assetId={video.id} playbackId={video.muxPlaybackId} poster={video.thumbnail} title={video.title} autoPlay /></div>}</div>
    </div>,
    document.body,
  );
}
