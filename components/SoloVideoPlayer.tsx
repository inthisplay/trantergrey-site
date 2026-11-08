'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import '@videojs/react/video/skin.css';
import { VideoPlayer, VideoSkin } from '@videojs/react/video';
import { MuxVideo } from '@videojs/react/media/mux-video';
import { MuxData } from '@videojs/react/extensions/mux-data';

export type SoloVideoVariant = {
  assetId: string;
  label: string;
  aspectRatio: string | null;
  playbackId: string;
  thumbnailUrl: string | null;
  duration: number;
  downloadsEnabled: boolean;
  maxResolution: string | null;
};

type DownloadQuality = 'highest' | '1080p' | '720p' | '540p';
const downloadQualities: DownloadQuality[] = ['highest', '1080p', '720p', '540p'];
const qualityRank: Record<Exclude<DownloadQuality, 'highest'>, number> = { '1080p': 1080, '720p': 720, '540p': 540 };
const explicitQualities: Array<Exclude<DownloadQuality, 'highest'>> = ['1080p', '720p', '540p'];

function maxResolutionRank(value: string | null) {
  const normalized = value?.toLowerCase() || '';
  const explicit = normalized.match(/(2160|1440|1080|720|540|480|360|270)p?/);
  if (explicit) return Number(explicit[1]);
  if (normalized.includes('uhd') || normalized.includes('4k')) return 2160;
  if (normalized.includes('hd')) return 1080;
  if (normalized.includes('sd')) return 480;
  return null;
}

function availableDownloadQualities(maxResolution: string | null) {
  const max = maxResolutionRank(maxResolution);
  return ['highest', ...explicitQualities.filter((quality) => max !== null && qualityRank[quality] <= max)] as DownloadQuality[];
}

function qualityLabel(quality: DownloadQuality) {
  return quality === 'highest' ? 'highest available' : quality;
}

function VideoJsPlayer({ assetId, playbackId, poster, title, muted = false, onVideoElement }: { assetId: string; playbackId: string; poster: string | null; title: string; muted?: boolean; onVideoElement?: (assetId: string, video: HTMLVideoElement | null) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !onVideoElement) return;
    let currentVideo: HTMLVideoElement | null = null;
    const connect = () => {
      const video = root.querySelector('video');
      if (video === currentVideo) return;
      if (currentVideo) onVideoElement(assetId, null);
      currentVideo = video;
      if (video) {
        video.defaultMuted = muted;
        video.muted = muted;
        onVideoElement(assetId, video);
        video.addEventListener('play', () => setStarted(true));
        const keepMuted = () => { if (muted) video.muted = true; };
        video.addEventListener('volumechange', keepMuted);
      }
    };
    connect();
    const observer = new MutationObserver(connect);
    observer.observe(root, { childList: true, subtree: true });
    return () => { observer.disconnect(); if (currentVideo) onVideoElement(assetId, null); };
  }, [assetId, muted, onVideoElement]);

  return <div ref={rootRef} className="solo-videojs-player">
    <VideoPlayer title={title} poster={poster ?? undefined}>
      <VideoSkin className="solo-videojs-skin">
        <MuxVideo source={{ playbackId }} playsInline crossOrigin="anonymous" />
        <MuxData metadata={{ video_id: assetId, video_title: title }} />
      </VideoSkin>
    </VideoPlayer>
    {!started && <button className="solo-video-start" type="button" aria-label={`Play ${title}`} onClick={() => {
      const video = rootRef.current?.querySelector('video');
      void video?.play();
      setStarted(true);
    }}><span /></button>}
  </div>;
}

function cssAspectRatio(value: string | null) {
  const match = value?.match(/^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/);
  return match ? `${match[1]} / ${match[2]}` : '16 / 9';
}

function selectorLabel(variant: SoloVideoVariant) {
  const value = variant.aspectRatio?.replace(/\s/g, '');
  if (value === '9:16' || value === '9/16' || value === '4:5' || value === '4/5') return 'Vert';
  if (value === '1:1' || value === '1/1') return 'Sqr';
  if (value === '16:9' || value === '16/9') return 'Horiz';
  return variant.label;
}

export function SoloVideoPlayer({ title, variants }: { title: string; variants: SoloVideoVariant[] }) {
  const [selectedId, setSelectedId] = useState(variants.length > 1 ? 'all' : variants[0]?.assetId ?? '');
  const [downloadState, setDownloadState] = useState<'idle' | 'preparing'>('idle');
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [notice, setNotice] = useState('');
  const [noticeKind, setNoticeKind] = useState<'info' | 'success' | 'error'>('info');
  const syncedVideos = useRef(new Map<string, HTMLVideoElement>());
  const syncing = useRef(false);
  const selected = useMemo(() => variants.find((variant) => variant.assetId === selectedId) ?? variants[0], [selectedId, variants]);
  useEffect(() => { setDownloadState('idle'); setDownloadMenuOpen(false); setCopyState('idle'); setNotice(''); }, [selectedId]);
  if (!selected) return <p className="solo-video-unavailable">This video is not ready for playback yet.</p>;

  const showingAll = selectedId === 'all' && variants.length > 1;
  const audioVariantId = variants.find((variant) => selectorLabel(variant).toLowerCase() === 'horiz')?.assetId ?? variants[0]?.assetId;
  const ratio = cssAspectRatio(selected.aspectRatio);
  const numericRatio = selected.aspectRatio?.match(/^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/);
  const isPortrait = numericRatio ? Number(numericRatio[1]) < Number(numericRatio[2]) : false;
  const availableQualities = availableDownloadQualities(selected.maxResolution);

  function showNotice(message: string, kind: 'info' | 'success' | 'error' = 'info') {
    setNotice(message);
    setNoticeKind(kind);
    if (kind !== 'info') window.setTimeout(() => setNotice((current) => current === message ? '' : current), 5000);
  }

  function registerSyncedVideo(assetId: string, video: HTMLVideoElement | null) {
    if (video) syncedVideos.current.set(assetId, video);
    else syncedVideos.current.delete(assetId);
  }

  useEffect(() => {
    if (!showingAll) return;
    const listeners: Array<() => void> = [];
    const sync = (source: HTMLVideoElement, action: 'play' | 'pause' | 'time') => {
      if (syncing.current) return;
      syncing.current = true;
      for (const video of syncedVideos.current.values()) {
        if (video === source) continue;
        if (action === 'time' || Math.abs(video.currentTime - source.currentTime) > 0.4) video.currentTime = source.currentTime;
        if (action === 'play') void video.play().catch(() => undefined);
        if (action === 'pause') video.pause();
      }
      window.setTimeout(() => { syncing.current = false; }, 180);
    };
    const bind = (video: HTMLVideoElement) => {
      const onPlay = () => sync(video, 'play');
      const onPause = () => sync(video, 'pause');
      const onSeek = () => sync(video, 'time');
      video.addEventListener('play', onPlay);
      video.addEventListener('pause', onPause);
      video.addEventListener('seeking', onSeek);
      listeners.push(() => { video.removeEventListener('play', onPlay); video.removeEventListener('pause', onPause); video.removeEventListener('seeking', onSeek); });
    };
    const boundVideos = new Set<HTMLVideoElement>();
    const timer = window.setInterval(() => {
      for (const video of syncedVideos.current.values()) {
        if (!boundVideos.has(video)) { bind(video); boundVideos.add(video); }
      }
    }, 100);
    const driftTimer = window.setInterval(() => {
      const leader = [...syncedVideos.current.values()].find((video) => !video.paused);
      if (!leader || syncing.current) return;
      for (const video of syncedVideos.current.values()) {
        if (video !== leader && Math.abs(video.currentTime - leader.currentTime) > 0.55) video.currentTime = leader.currentTime;
      }
    }, 1000);
    return () => { window.clearInterval(timer); window.clearInterval(driftTimer); listeners.forEach((remove) => remove()); };
  }, [showingAll]);

  async function copyUrl() {
    const url = window.location.href;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const field = document.createElement('textarea');
        field.value = url;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        if (!copied) throw new Error('Copy was unavailable.');
      }
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2200);
    } catch {
      showNotice('Could not copy this URL.', 'error');
    }
  }

  async function getDownload(quality: DownloadQuality) {
    setDownloadMenuOpen(false);
    setDownloadState('preparing');
    showNotice(`Preparing ${qualityLabel(quality)} download…`);
    try {
      const response = await fetch('/api/watch/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetId: selected.assetId, quality }) });
      const payload = await response.json() as { error?: string; nextAvailableQuality?: DownloadQuality };
      if (!response.ok) {
        setDownloadMenuOpen(Boolean(payload.nextAvailableQuality));
        throw new Error(payload.error || 'Could not prepare the download.');
      }
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const check = await fetch(`/api/watch/download?assetId=${encodeURIComponent(selected.assetId)}&quality=${quality}`, { cache: 'no-store' });
        const next = await check.json() as { status?: string; downloadUrl?: string; error?: string; nextAvailableQuality?: DownloadQuality };
        if (!check.ok) throw new Error(next.error || 'Could not check the download.');
        if (next.status === 'ready' && next.downloadUrl) {
          window.location.assign(next.downloadUrl);
          showNotice(`${qualityLabel(quality)} download started.`, 'success');
          return;
        }
        if (next.status === 'errored' || next.status === 'skipped') {
          setDownloadMenuOpen(Boolean(next.nextAvailableQuality));
          throw new Error(`${qualityLabel(quality)} is unavailable for this video.${next.nextAvailableQuality ? ` Choose ${next.nextAvailableQuality} instead.` : ''}`);
        }
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
      }
      throw new Error('The download is taking longer than expected. Please try again shortly.');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not prepare the download.', 'error');
    } finally {
      setDownloadState('idle');
    }
  }

  return <div className={`solo-video-player${!showingAll ? ' has-actions' : ''}`}>
    {notice && <div className={`solo-video-notification ${noticeKind}`} role="status" aria-live="polite">{notice}</div>}
    {variants.length > 1 && <div className="solo-video-ratios" aria-label="Choose a video ratio">
      <span>View ratio</span>
      <button type="button" className={showingAll ? 'active' : ''} onClick={() => setSelectedId('all')}>All</button>
      {variants.map((variant) => <button type="button" className={variant.assetId === selected.assetId && !showingAll ? 'active' : ''} onClick={() => setSelectedId(variant.assetId)} key={variant.assetId}>{selectorLabel(variant)}</button>)}
    </div>}
    {showingAll ? <div className="solo-video-all-stages">{variants.map((variant) => <div className={`solo-video-stage solo-video-all-stage-${selectorLabel(variant).toLowerCase()}${cssAspectRatio(variant.aspectRatio) === '9 / 16' ? ' portrait' : ''}`} key={variant.assetId}><div style={{ aspectRatio: cssAspectRatio(variant.aspectRatio) }}><VideoJsPlayer assetId={variant.assetId} playbackId={variant.playbackId} poster={variant.thumbnailUrl} title={`${title} — ${selectorLabel(variant)}`} muted={variant.assetId !== audioVariantId} onVideoElement={registerSyncedVideo} /></div></div>)}</div> : <div className={`solo-video-stage${isPortrait ? ' portrait' : ''}`}><div style={{ aspectRatio: ratio }}><VideoJsPlayer key={selected.playbackId} assetId={selected.assetId} playbackId={selected.playbackId} poster={selected.thumbnailUrl} title={`${title} — ${selectorLabel(selected)}`} /></div></div>}
    {!showingAll && <div className="solo-video-actions">
      <div className="solo-video-action-buttons">
        <button type="button" onClick={copyUrl}>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="18" cy="5" r="2.5" />
            <circle cx="6" cy="12" r="2.5" />
            <circle cx="18" cy="19" r="2.5" />
            <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
          </svg>
          <span>{copyState === 'copied' ? 'Copied!' : 'Copy URL'}</span>
        </button>
        {selected.downloadsEnabled && <div className="solo-download-picker"><button type="button" disabled={downloadState === 'preparing'} aria-haspopup="menu" aria-expanded={downloadMenuOpen} onClick={() => setDownloadMenuOpen((open) => !open)}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M5 20h14" /></svg><span>{downloadState === 'preparing' ? 'Preparing…' : 'Download'}</span>
        </button>{downloadMenuOpen && <div className="solo-download-menu" role="menu" aria-label="Download quality">{availableQualities.map((quality) => <button type="button" role="menuitem" key={quality} onClick={() => void getDownload(quality)}>{quality === 'highest' ? 'Highest available' : quality}</button>)}</div>}</div>}
      </div>
    </div>}
  </div>;
}
