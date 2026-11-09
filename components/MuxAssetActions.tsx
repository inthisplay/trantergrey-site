'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Rendition = { name: string | null; status: string; url: string | null };

async function postJson(url: string, body: object) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error || 'The Mux action did not complete.');
  return payload as unknown;
}

function triggerDownload(url: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = '';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function muxThumbnailUrl(playbackId: string, time: number) {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${time}&width=960`;
}

export function MuxAssetActions({ assetId, playbackId, playbackPolicy, staticRenditions, projectSlug, duration, thumbnailTime, thumbnailUrl }: {
  assetId: string;
  playbackId: string | null;
  playbackPolicy: string | null;
  staticRenditions: Rendition[];
  projectSlug: string | null;
  duration: number;
  thumbnailTime: number;
  thumbnailUrl: string | null;
}) {
  const replaceInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [downloadRequested, setDownloadRequested] = useState(false);
  const [renditions, setRenditions] = useState(staticRenditions);
  const [selectedThumbnailTime, setSelectedThumbnailTime] = useState(thumbnailTime);
  const [savedThumbnail, setSavedThumbnail] = useState(thumbnailUrl);
  const readyDownload = renditions.find((rendition) => rendition.status === 'ready' && rendition.url);
  const pendingDownload = renditions.some((rendition) => ['preparing', 'processing'].includes(rendition.status));
  const publicPlayback = playbackPolicy === 'public' && Boolean(playbackId);
  const sharePath = `/watch/${projectSlug || assetId}`;
  const [publicUrl, setPublicUrl] = useState(sharePath);
  const previewThumbnail = useMemo(() => playbackId ? muxThumbnailUrl(playbackId, selectedThumbnailTime) : savedThumbnail, [playbackId, savedThumbnail, selectedThumbnailTime]);

  useEffect(() => {
    setPublicUrl(new URL(sharePath, window.location.origin).toString());
  }, [sharePath]);

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
          triggerDownload(ready.url);
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
      triggerDownload(readyDownload.url);
      return;
    }
    if (!pendingDownload) {
      const started = await run('download', () => postJson('/api/admin/mux-assets/static-rendition', { assetId }), 'Mux is preparing your download.');
      if (!started) return;
    }
    setDownloadRequested(true);
  };
  const saveThumbnail = async () => {
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
  const copyPublicLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setMessage('Public link copied.');
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
  const replaceVideo = async (file: File | undefined) => {
    if (!file) return;
    if (!window.confirm('Replace this Mux video with the selected file? The shareable page will stay the same and the current Mux asset will be permanently deleted after the replacement is ready.')) return;
    setBusy('replace');
    setMessage(null);
    try {
      const uploadResponse = await postJson('/api/admin/mux-uploads', { filename: file.name, contentType: file.type || 'video/mp4' }) as { uploadUrl?: string; uploadId?: string };
      if (!uploadResponse.uploadUrl || !uploadResponse.uploadId) throw new Error('Mux did not create an upload destination.');
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('PUT', uploadResponse.uploadUrl!);
        request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error('The replacement file could not be uploaded.'));
        request.onerror = () => reject(new Error('The replacement file could not be uploaded.'));
        request.send(file);
      });
      let replacementAssetId: string | null = null;
      for (let attempt = 0; attempt < 45 && !replacementAssetId; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const response = await fetch(`/api/admin/mux-uploads?uploadId=${encodeURIComponent(uploadResponse.uploadId)}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => null) as { assetId?: string; error?: string } | null;
        if (!response.ok) throw new Error(payload?.error || 'Mux could not process the replacement file.');
        replacementAssetId = payload?.assetId ?? null;
      }
      if (!replacementAssetId) throw new Error('Mux is still preparing the replacement. Please try again in a moment.');
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
    }
  };

  return <div className="mux-asset-actions">
    <header><span>Video settings</span><strong>Mux controls</strong></header>
    <section className="mux-share-action"><small>Public link</small><p>Every video has a page ready to paste into an email or message.</p>
      <input aria-label="Public video URL" readOnly value={publicUrl} onFocus={(event) => event.currentTarget.select()} /><div className="mux-share-buttons"><button className="primary" type="button" onClick={copyPublicLink}>Copy URL</button><a href={sharePath} target="_blank" rel="noreferrer">Open ↗</a></div>
    </section>
    <section className="mux-replace-action"><small>Replace video</small><p>Upload a revision without changing the shareable page. The superseded Mux asset is deleted when the swap finishes.</p><input ref={replaceInput} className="visually-hidden" type="file" accept="video/*,.mov,.mp4,.m4v,.webm,.avi,.mkv" onChange={(event) => { void replaceVideo(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} /><button className="primary" type="button" onClick={() => replaceInput.current?.click()} disabled={Boolean(busy)}>{busy === 'replace' ? 'Replacing…' : 'Replace video'}</button></section>
    <section className="mux-thumbnail-action"><small>Thumbnail</small><p>Choose the frame used throughout the video library.</p>
      {previewThumbnail && <img src={previewThumbnail} alt="Selected thumbnail frame" />}
      <div className="mux-thumbnail-time"><input aria-label="Thumbnail frame time" type="range" min="0" max={Math.max(duration, 1)} step="0.1" value={selectedThumbnailTime} onChange={(event) => setSelectedThumbnailTime(Number(event.target.value))} /><label><input type="number" min="0" max={Math.max(duration, 1)} step="0.1" value={selectedThumbnailTime} onChange={(event) => setSelectedThumbnailTime(Number(event.target.value))} /> sec</label></div>
      <button type="button" onClick={saveThumbnail} disabled={Boolean(busy) || !playbackId}>{busy === 'thumbnail' ? 'Saving…' : 'Save thumbnail'}</button>
    </section>
    <section><small>Download</small><p>Mux prepares the MP4 only when someone asks for it.</p><button className="primary" type="button" onClick={download} disabled={Boolean(busy) || downloadRequested}>{downloadRequested || busy === 'download' ? 'Preparing…' : 'Download'}</button></section>
    <section><small>Playback</small><p>{publicPlayback ? 'This video has a public Mux playback ID.' : 'Its public page exists, but playback is currently unavailable.'}</p><button type="button" onClick={togglePlayback} disabled={Boolean(busy)}>{busy === 'playback' ? 'Updating…' : publicPlayback ? 'Disable public playback' : 'Enable public playback'}</button></section>
    <section className="danger"><small>Danger zone</small><p>Deletion permanently removes the asset from Mux.</p><button type="button" onClick={deleteVideo} disabled={Boolean(busy)}>{busy === 'delete' ? 'Deleting…' : 'Delete from Mux'}</button></section>
    {message && <p className="mux-action-message" role="status">{message}</p>}
  </div>;
}
