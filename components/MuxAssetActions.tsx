'use client';

import { waitForUpload, processingLabel, type ProcessingProgress } from '@/lib/mux-upload-status';
import { useThumbnailPreview } from './useThumbnailPreview';
import { thumbnailFrameTime } from '@/lib/thumbnail-preview';
import { MuxProcessingProgress } from './MuxProcessingProgress';

import { UiIcon } from '@/components/UiIcon';

import { useEffect, useMemo, useRef, useState } from 'react';

type Rendition = { name: string | null; status: string; url: string | null };
type ReplacementProgress = { fileName: string; progress: number; stage: 'uploading' | 'processing' | 'swapping'; processing?: ProcessingProgress | null };

async function postJson(url: string, body: object) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error || 'The Mux action did not complete.');
  return payload as unknown;
}

function triggerDownload(url: string, title: string) {
  const target = new URL(url);
  const filename = title.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'trantergrey-video';
  target.searchParams.set('download', `${filename}.mp4`);
  const anchor = document.createElement('a');
  anchor.href = target.toString();
  anchor.download = '';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function muxThumbnailUrl(playbackId: string, time: number) {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${time}&width=960`;
}

export function MuxAssetActions({ assetId, title, playbackId, playbackPolicy, staticRenditions, projectId, projectSlug, unbrandedPublicPage, duration, thumbnailTime, thumbnailUrl, downloadsEnabled }: {
  assetId: string;
  title: string;
  playbackId: string | null;
  playbackPolicy: string | null;
  staticRenditions: Rendition[];
  projectId: string | null;
  projectSlug: string | null;
  unbrandedPublicPage: boolean;
  duration: number;
  thumbnailTime: number;
  thumbnailUrl: string | null;
  downloadsEnabled: boolean;
}) {
  const replaceInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [replacementProgress, setReplacementProgress] = useState<ReplacementProgress | null>(null);
  const [downloadRequested, setDownloadRequested] = useState(false);
  const [renditions, setRenditions] = useState(staticRenditions);
  const [selectedThumbnailTime, setSelectedThumbnailTime] = useState(thumbnailFrameTime(thumbnailTime, duration));
  const [savedThumbnail, setSavedThumbnail] = useState(thumbnailUrl);
  const [publicDownloadsEnabled, setPublicDownloadsEnabled] = useState(downloadsEnabled);
  const pageSlug = projectSlug;
  const unbrandedPage = Boolean(playbackId && playbackPolicy === 'public');
  const readyDownload = renditions.find((rendition) => rendition.status === 'ready' && rendition.url);
  const pendingDownload = renditions.some((rendition) => ['preparing', 'processing'].includes(rendition.status));
  const publicPlayback = playbackPolicy === 'public' && Boolean(playbackId);
  const sharePath = `/watch/${pageSlug || assetId}`;
  const unbrandedPath = `/watch/u/${pageSlug || assetId}`;
  const [publicUrl, setPublicUrl] = useState(sharePath);
  const [unbrandedUrl, setUnbrandedUrl] = useState(unbrandedPath);
  const requestedThumbnail = useMemo(() => playbackId ? muxThumbnailUrl(playbackId, selectedThumbnailTime) : savedThumbnail, [playbackId, savedThumbnail, selectedThumbnailTime]);

  const thumbnailPreview = useThumbnailPreview(requestedThumbnail);

  useEffect(() => {
    setPublicUrl(new URL(sharePath, window.location.origin).toString());
  }, [sharePath]);
  useEffect(() => {
    setUnbrandedUrl(new URL(unbrandedPath, window.location.origin).toString());
  }, [unbrandedPath]);

  useEffect(() => {
    if (!downloadRequested) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const response = await fetch(`/api/admin/mux-assets/static-rendition?assetId=${encodeURIComponent(assetId)}`, { cache: 'no-store' });
        const payload = await response.json() as { staticRenditions?: Rendition[]; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Could not check the download.');
        if (cancelled) return;
        const next = payload.staticRenditions ?? [];
        setRenditions(next);
        const ready = next.find((rendition) => rendition.status === 'ready' && rendition.url);
        if (ready?.url) {
          setDownloadRequested(false);
          setMessage('Download ready.');
          triggerDownload(ready.url, title);
          window.location.reload();
          return;
        }
        timer = setTimeout(check, 3000);
      } catch (error) {
        if (cancelled) return;
        setDownloadRequested(false);
        setMessage(error instanceof Error ? error.message : 'Could not prepare the download.');
      }
    };
    void check();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [assetId, downloadRequested]);

  async function run(name: string, work: () => Promise<unknown>, success: string) {
    setBusy(name);
    setMessage(null);
    try {
      await work();
      setMessage(success);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The action did not complete.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  const download = async () => {
    if (readyDownload?.url) {
      triggerDownload(readyDownload.url, title);
      return;
    }
    if (!pendingDownload) {
      const started = await run('download', () => postJson('/api/admin/mux-assets/static-rendition', { assetId }), 'Mux is preparing your download.');
      if (!started) return;
    }
    setDownloadRequested(true);
  };
  const saveThumbnail = async () => {
    if (!thumbnailPreview.ready) return;
    setBusy('thumbnail');
    setMessage(null);
    try {
      const payload = await postJson('/api/admin/mux-assets/thumbnail', { assetId, time: selectedThumbnailTime }) as { thumbnailUrl?: string };
      if (payload.thumbnailUrl) setSavedThumbnail(payload.thumbnailUrl);
      setMessage('Thumbnail saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The thumbnail could not be saved.');
    } finally {
      setBusy(null);
    }
  };
  const copyLink = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setMessage(`${label} copied.`);
    } catch {
      setMessage('Select the URL below and copy it.');
    }
  };
  const togglePlayback = () => {
    if (publicPlayback && !window.confirm('This removes the public playback ID. The public page will remain, but its video will stop playing. Continue?')) return;
    void run('playback', () => postJson('/api/admin/mux-assets/playback', {
      assetId,
      action: publicPlayback ? 'disable-public' : 'enable-public',
      playbackId,
    }), publicPlayback ? 'Public playback has been disabled.' : 'Public playback has been enabled.');
  };
  const deleteVideo = () => {
    if (!window.confirm('Permanently delete this video from Mux? This cannot be undone.')) return;
    void run('delete', () => postJson('/api/admin/mux-assets/delete', { assetIds: [assetId] }), 'Video deleted.').then((deleted) => {
      if (deleted) {
        window.location.assign('/admin/mux');
      }
    });
  };
  const togglePublicDownloads = async () => {
    const next = !publicDownloadsEnabled;
    const updated = await run('public-downloads', () => postJson('/api/admin/mux-assets/metadata', { assetId, downloadsEnabled: next }), next ? 'Public downloads enabled.' : 'Public downloads disabled.');
    if (updated) setPublicDownloadsEnabled(next);
  };
  const replacementController = useRef<AbortController | null>(null);
  useEffect(() => () => replacementController.current?.abort(), []);
  useEffect(() => {
    if (!replacementProgress) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [replacementProgress]);
  const replaceVideo = async (file: File | undefined) => {
    if (!file) return;
    if (!window.confirm('Replace this Mux video with the selected file? The shareable page will stay the same and the original video will be kept in the library for recovery. You can delete it separately.')) return;
    setBusy('replace');
    setMessage(null);
    setReplacementProgress({ fileName: file.name, progress: 0, stage: 'uploading' });
    try {
      const uploadResponse = await postJson('/api/admin/mux-uploads', { title: file.name.replace(/\.[^.]+$/, '') }) as { url?: string; id?: string };
      if (!uploadResponse.url || !uploadResponse.id) throw new Error('Mux did not create an upload destination.');
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('PUT', uploadResponse.url!);
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) setReplacementProgress((current) => current ? { ...current, progress: Math.round((event.loaded / event.total) * 100) } : current);
        };
        request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error('The replacement file could not be uploaded.'));
        request.onerror = () => reject(new Error('The replacement file could not be uploaded.'));
        request.send(file);
      });
      setReplacementProgress((current) => current ? { ...current, progress: 100, stage: 'processing' } : current);
      replacementController.current = new AbortController();
      const replacementAssetId = await waitForUpload(uploadResponse.id, replacementController.current.signal, status => setReplacementProgress(current => current ? { ...current, processing: status.processing } : current));
      setReplacementProgress((current) => current ? { ...current, stage: 'swapping' } : current);
      for (let attempt = 0; attempt < 45; attempt += 1) {
        try {
          await postJson('/api/admin/mux-assets/replace', { assetId, replacementAssetId });
          window.location.assign(`/admin/mux/${replacementAssetId}`);
          return;
        } catch (error) {
          if (attempt === 44) throw error;
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The video could not be replaced.');
    } finally {
      setBusy(null);
      setReplacementProgress(null);
    }
  };

  return <div className="mux-asset-actions">
    <header><span>Video settings</span><strong>Mux controls</strong></header>
    <section className="mux-share-action"><small>Public link</small><p>Every video has a page ready to paste into an email or message.</p>
      <input aria-label="Public video URL" readOnly value={publicUrl} onFocus={(event) => event.currentTarget.select()} /><div className="mux-share-buttons"><button className="primary" type="button" onClick={() => void copyLink(publicUrl, 'Public link')}>Copy URL</button><a href={sharePath} target="_blank" rel="noreferrer">Open <UiIcon name="external" /></a></div>
    </section>
    <section className="mux-replace-action"><small>Replace video</small><p>Upload a revision without changing the shareable page. The original video stays in the library for recovery. Delete it separately when you no longer need it.</p><input ref={replaceInput} className="visually-hidden" type="file" accept="video/*,.mov,.mp4,.m4v,.webm,.avi,.mkv" onChange={(event) => { void replaceVideo(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} /><button className="primary" type="button" onClick={() => replaceInput.current?.click()} disabled={Boolean(busy)}>{busy === 'replace' ? 'Replacing…' : 'Replace video'}</button>{replacementProgress && <div className="mux-replacement-progress" role="status" aria-live="polite"><div><span>Replacing</span><strong>{replacementProgress.stage === 'uploading' ? `${replacementProgress.progress}% uploaded` : replacementProgress.stage === 'processing' ? `Upload received · ${processingLabel(replacementProgress.processing)}` : 'Updating video page'}</strong></div><p title={replacementProgress.fileName}>{replacementProgress.fileName}</p><MuxProcessingProgress uploadPercent={replacementProgress.stage === 'uploading' ? replacementProgress.progress : undefined} processing={replacementProgress.processing} /><small>Keep this tab open until the replacement is applied.</small>{replacementProgress.stage !== 'uploading' && <span className="mux-replacement-spinner" aria-hidden="true" />}</div>}</section>
    <section className="mux-thumbnail-action"><small>Thumbnail</small><p>Choose the frame used throughout the video library.</p>
      <div className="mux-thumbnail-preview" aria-busy={!thumbnailPreview.ready && !thumbnailPreview.error}>
        {thumbnailPreview.displayed ? <img src={thumbnailPreview.displayed} alt={thumbnailPreview.ready ? 'Selected thumbnail frame' : 'Previous thumbnail frame while the selected frame loads'} /> : <div className="mux-thumbnail-placeholder">{thumbnailPreview.error ? 'Preview unavailable' : 'Loading preview…'}</div>}
      </div>
      {!thumbnailPreview.ready && <p className="mux-thumbnail-preview-status" role="status">{thumbnailPreview.error ? 'This frame could not load. Try again or choose another spot.' : 'Loading selected frame…'}{thumbnailPreview.error && <button type="button" onClick={thumbnailPreview.retry}>Retry preview</button>}</p>}
      <div className="mux-thumbnail-time"><input aria-label="Thumbnail frame time" type="range" min="0" max={thumbnailFrameTime(duration, duration)} step="0.1" value={selectedThumbnailTime} onChange={(event) => setSelectedThumbnailTime(thumbnailFrameTime(Number(event.target.value), duration))} /><label><input type="number" min="0" max={thumbnailFrameTime(duration, duration)} step="0.1" value={selectedThumbnailTime} onChange={(event) => setSelectedThumbnailTime(thumbnailFrameTime(Number(event.target.value), duration))} /> sec</label></div>
      <button type="button" onClick={saveThumbnail} disabled={Boolean(busy) || !playbackId || !thumbnailPreview.ready}>{busy === 'thumbnail' ? 'Saving…' : 'Save thumbnail'}</button>
    </section>
    <section><small>Download</small><p>Mux prepares the MP4 only when someone asks for it.</p><button className="primary" type="button" onClick={download} disabled={Boolean(busy) || downloadRequested}>{downloadRequested || busy === 'download' ? 'Preparing…' : 'Download'}</button></section>
    <section><small>Public download</small><p>{publicDownloadsEnabled ? 'Visitors can request an MP4 from the public video page.' : 'The download button is hidden on the public video page.'}</p><button type="button" onClick={togglePublicDownloads} disabled={Boolean(busy)}>{busy === 'public-downloads' ? 'Updating…' : publicDownloadsEnabled ? 'Disable downloads' : 'Enable downloads'}</button></section>
    <section className="mux-share-action"><small>Unbranded page</small><p>{unbrandedPage ? 'Available automatically for public videos. The regular URL stays branded.' : 'An unbranded URL becomes available when this video has public playback access.'}</p>{unbrandedPage && <><input aria-label="Unbranded video URL" readOnly value={unbrandedUrl} onFocus={(event) => event.currentTarget.select()} /><div className="mux-share-buttons"><button className="primary" type="button" onClick={() => void copyLink(unbrandedUrl, 'Unbranded link')}>Copy unbranded link</button><a href={unbrandedPath} target="_blank" rel="noreferrer">Open <UiIcon name="external" /></a></div></>}</section>
    <section><small>Playback</small><p>{publicPlayback ? 'This video has a public Mux playback ID.' : 'Its public page exists, but playback is currently unavailable.'}</p><button type="button" onClick={togglePlayback} disabled={Boolean(busy)}>{busy === 'playback' ? 'Updating…' : publicPlayback ? 'Disable public playback' : 'Enable public playback'}</button></section>
    <section className="danger"><small>Danger zone</small><p>Deletion permanently removes the asset from Mux.</p><button type="button" onClick={deleteVideo} disabled={Boolean(busy)}>{busy === 'delete' ? 'Deleting…' : 'Delete from Mux'}</button></section>
    {message && <p className="mux-action-message" role="status">{message}</p>}
  </div>;
}
