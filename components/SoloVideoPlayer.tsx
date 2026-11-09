'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import '@videojs/react/video/skin.css';
import { VideoPlayer, VideoSkin } from '@videojs/react/video';
import { MuxVideo } from '@videojs/react/media/mux-video';
import { MuxData } from '@videojs/react/extensions/mux-data';
import { availableDownloadQualities, downloadQualities, prepareDownload, qualityLabel, startDownload, type DownloadQuality } from '@/lib/watch-download';

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

export function MuxVideoPlayer({ assetId, playbackId, poster, title, muted = false, autoPlay = false, keyboardShortcuts = true, onVideoElement }: { assetId: string; playbackId: string; poster: string | null; title: string; muted?: boolean; autoPlay?: boolean; keyboardShortcuts?: boolean; onVideoElement?: (assetId: string, video: HTMLVideoElement | null) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(muted);
  const [volume, setVolume] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [hoverPreview, setHoverPreview] = useState<{ time: number; percent: number } | null>(null);
  const controlsTimer = useRef<number | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let currentVideo: HTMLVideoElement | null = null;
    const connect = () => {
      const video = root.querySelector('video');
      if (video === currentVideo) return;
      if (currentVideo) onVideoElement?.(assetId, null);
      currentVideo = video;
      if (video) {
        video.defaultMuted = muted;
        video.muted = muted;
        setIsMuted(muted);
        onVideoElement?.(assetId, video);
        const onPlay = () => { setStarted(true); setPlaying(true); };
        const onPause = () => setPlaying(false);
        const onTimeUpdate = () => setCurrentTime(video.currentTime || 0);
        const onLoadedMetadata = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0);
        const onVolumeChange = () => { setIsMuted(video.muted); setVolume(video.volume); };
        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('volumechange', onVolumeChange);
        const keepMuted = () => { if (muted) video.muted = true; };
        video.addEventListener('volumechange', keepMuted);
        if (autoPlay) void video.play().catch(() => undefined);
      }
    };
    connect();
    const observer = new MutationObserver(connect);
    observer.observe(root, { childList: true, subtree: true });
    return () => { observer.disconnect(); if (currentVideo) onVideoElement?.(assetId, null); };
  }, [assetId, autoPlay, muted, onVideoElement]);

  const video = () => rootRef.current?.querySelector('video') ?? null;
  const wakeControls = () => {
    if (controlsTimer.current) window.clearTimeout(controlsTimer.current);
    setControlsVisible(true);
    if (!video()?.paused) controlsTimer.current = window.setTimeout(() => setControlsVisible(false), document.fullscreenElement === rootRef.current ? 500 : 1800);
  };
  useEffect(() => {
    if (playing) wakeControls();
    else {
      if (controlsTimer.current) window.clearTimeout(controlsTimer.current);
      setControlsVisible(true);
    }
    return () => { if (controlsTimer.current) window.clearTimeout(controlsTimer.current); };
  }, [playing]);
  useEffect(() => {
    const onFullscreenChange = () => wakeControls();
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);
  const togglePlayback = () => {
    const element = video(); if (!element) return;
    if (element.paused) void element.play(); else element.pause();
  };
  useEffect(() => {
    if (!keyboardShortcuts) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input,textarea,select,[contenteditable="true"]')) return;
      const element = video();
      const root = rootRef.current;
      if (!element || !root) return;
      const key = event.key.toLowerCase();
      if (event.repeat && [' ', 'k', 'm', 'f'].includes(key)) return;
      if (key === ' ' && target?.closest('button')) return;
      if (key === ' ' || key === 'k') {
        event.preventDefault();
        togglePlayback();
      } else if (key === 'm') {
        event.preventDefault();
        element.muted = !element.muted;
      } else if (key === 'f') {
        event.preventDefault();
        if (document.fullscreenElement) void document.exitFullscreen();
        else void root.requestFullscreen?.();
      } else if (key === 'arrowleft' || key === 'arrowright' || key === 'j' || key === 'l') {
        event.preventDefault();
        const amount = key === 'arrowleft' ? -5 : key === 'arrowright' ? 5 : key === 'j' ? -10 : 10;
        element.currentTime = Math.min(element.duration || Infinity, Math.max(0, element.currentTime + amount));
      } else if (/^[0-9]$/.test(key) && Number.isFinite(element.duration)) {
        event.preventDefault();
        element.currentTime = element.duration * (Number(key) / 10);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [keyboardShortcuts]);
  const formatTime = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const previewAtPointer = (event: MouseEvent<HTMLElement>) => {
    if (!duration) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const percent = Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100));
    setHoverPreview({ percent, time: Math.round(((percent / 100) * duration) * 2) / 2 });
  };
  const previewAtBottomPointer = (event: MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientY < bounds.bottom - 32) { setHoverPreview(null); return; }
    previewAtPointer(event);
  };
  const toggleFromSurface = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button,input,.tg-player-volume')) return;
    togglePlayback();
  };
  const setVolumeFromPointer = (event: MouseEvent<HTMLDivElement>) => {
    const element = video(); if (!element) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const next = Math.min(1, Math.max(0, 1 - ((event.clientY - bounds.top) / bounds.height)));
    element.muted = next === 0;
    element.volume = next;
    setIsMuted(next === 0);
    setVolume(next);
  };

  return <div ref={rootRef} className="solo-videojs-player">
    <VideoPlayer title={title} poster={poster ?? undefined}>
      <VideoSkin className="solo-videojs-skin">
        <MuxVideo source={{ playbackId }} playsInline crossOrigin="anonymous" autoPlay={autoPlay} />
        <MuxData metadata={{ video_id: assetId, video_title: title }} />
      </VideoSkin>
    </VideoPlayer>
    <div className={`tg-player-interface${started ? ' started' : ''}${controlsVisible ? '' : ' controls-hidden'}`} onClick={toggleFromSurface} onMouseMove={(event) => { wakeControls(); previewAtBottomPointer(event); }} onMouseLeave={() => setHoverPreview(null)}>
      <div className="tg-player-transport"><button className="tg-player-play" type="button" aria-keyshortcuts="Space k" aria-label={playing ? `Pause ${title}` : `Play ${title}`} onClick={togglePlayback}>{playing ? 'Ⅱ' : '▶'}</button></div>
<div className="tg-player-bottom" style={{ '--player-progress': `${progress}%` } as CSSProperties}>{hoverPreview && <div className="tg-player-scrub-preview" style={{ left: `${hoverPreview.percent}%` }}><img src={`https://image.mux.com/${playbackId}/thumbnail.jpg?time=${hoverPreview.time}&width=240`} alt="" /><span>{formatTime(hoverPreview.time)}</span></div>}<span>{formatTime(currentTime)} / {formatTime(duration)}</span><input aria-label="Seek" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onMouseMove={previewAtPointer} onMouseLeave={() => setHoverPreview(null)} onChange={(event) => { const element = video(); if (element) element.currentTime = Number(event.target.value); }} /><div><div className="tg-player-volume" style={{ '--volume-offset': `${Math.round((isMuted ? 0 : volume) * 64)}px` } as CSSProperties}><div className="tg-player-volume-hitarea" role="slider" aria-label="Volume" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((isMuted ? 0 : volume) * 100)} onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onClick={setVolumeFromPointer} onMouseMove={(event) => { if (event.buttons) setVolumeFromPointer(event); }} /><button type="button" aria-keyshortcuts="m" aria-label={isMuted ? 'Unmute' : 'Mute'} onClick={() => { const element = video(); if (!element) return; element.muted = !element.muted; setIsMuted(element.muted); }}><svg viewBox="0 0 256 256" aria-hidden="true"><path d="M163.51,24.81a8,8,0,0,0-8.42.88L85.25,80H40A16,16,0,0,0,24,96v64a16,16,0,0,0,16,16H85.25l69.84,54.31A8,8,0,0,0,168,224V32A8,8,0,0,0,163.51,24.81ZM152,207.64,92.91,161.69A7.94,7.94,0,0,0,88,160H40V96H88a7.94,7.94,0,0,0,4.91-1.69L152,48.36Z" />{!isMuted && volume > .66 && <><path d="M208,104v48a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z" /><path d="M240,88v80a8,8,0,0,1-16,0V88a8,8,0,0,1,16,0Z" /></>}{!isMuted && volume > .05 && volume <= .66 && <path d="M208,104v48a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z" />}</svg></button></div><button type="button" aria-keyshortcuts="f" aria-label="Enter fullscreen" onClick={() => void rootRef.current?.requestFullscreen?.()}>⛶</button></div></div>
    </div>
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

function variantFromRatioParam(variants: SoloVideoVariant[], value: string | null) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (normalized === 'all') return 'all';
  return variants.find((variant) => {
    const label = selectorLabel(variant).toLowerCase().replace(/[\s_-]+/g, '');
    const ratio = variant.aspectRatio?.toLowerCase().replace(/[\s/]+/g, '');
    const aliases = label === 'horiz' ? ['horizontal', '169'] : label === 'vert' ? ['vertical', '916'] : label === 'sqr' ? ['square', '11'] : [];
    return normalized === variant.assetId.toLowerCase() || normalized === label || normalized === ratio || aliases.includes(normalized);
  })?.assetId ?? null;
}

export function SoloVideoPlayer({ title, variants, standaloneHref }: { title: string; variants: SoloVideoVariant[]; standaloneHref?: string }) {
  const [selectedId, setSelectedId] = useState(variants.length > 1 ? 'all' : variants[0]?.assetId ?? '');
  const [downloadState, setDownloadState] = useState<'idle' | 'preparing'>('idle');
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [notice, setNotice] = useState('');
  const [noticeKind, setNoticeKind] = useState<'info' | 'success' | 'error'>('info');
  const syncedVideos = useRef(new Map<string, HTMLVideoElement>());
  const syncing = useRef(false);
  useEffect(() => {
    if (standaloneHref) return;
    const requested = variantFromRatioParam(variants, new URLSearchParams(window.location.search).get('ratio'));
    if (requested) setSelectedId(requested);
  }, [variants, standaloneHref]);
  const selected = useMemo(() => variants.find((variant) => variant.assetId === selectedId) ?? variants[0], [selectedId, variants]);
  useEffect(() => { setDownloadState('idle'); setDownloadMenuOpen(false); setCopyState('idle'); setNotice(''); }, [selectedId]);
  if (!selected) return <p className="solo-video-unavailable">This video is not ready for playback yet.</p>;

  const showingAll = selectedId === 'all' && variants.length > 1;
  const audioVariantId = variants.find((variant) => selectorLabel(variant).toLowerCase() === 'horiz')?.assetId ?? variants[0]?.assetId;
  const ratio = cssAspectRatio(selected.aspectRatio);
  const numericRatio = selected.aspectRatio?.match(/^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/);
  const isPortrait = numericRatio ? Number(numericRatio[1]) < Number(numericRatio[2]) : false;
  const downloadVariants = showingAll ? variants.filter((variant) => variant.downloadsEnabled) : selected.downloadsEnabled ? [selected] : [];
  const downloadAllQualities = downloadQualities.filter((quality) => downloadVariants.every((variant) => availableDownloadQualities(variant.maxResolution).includes(quality)));

  function showNotice(message: string, kind: 'info' | 'success' | 'error' = 'info') {
    setNotice(message);
    setNoticeKind(kind);
    if (kind !== 'info') window.setTimeout(() => setNotice((current) => current === message ? '' : current), 5000);
  }

  function selectRatio(nextId: string) {
    setSelectedId(nextId);
    if (standaloneHref) return;
    const url = new URL(window.location.href);
    if (nextId === 'all') url.searchParams.delete('ratio');
    else {
      const variant = variants.find((item) => item.assetId === nextId);
      url.searchParams.set('ratio', selectorLabel(variant ?? variants[0]).toLowerCase());
    }
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
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
    const url = standaloneHref ? new URL(standaloneHref, window.location.origin).href : window.location.href;
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

  async function getDownload(variant: SoloVideoVariant, quality: DownloadQuality) {
    setDownloadMenuOpen(false);
    setDownloadState('preparing');
    showNotice(`Preparing ${qualityLabel(quality)} download…`);
    try {
      startDownload(await prepareDownload(variant, quality));
      showNotice(`${qualityLabel(quality)} download started.`, 'success');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not prepare the download.', 'error');
    } finally {
      setDownloadState('idle');
    }
  }

  async function getAllDownloads(quality: DownloadQuality) {
    setDownloadMenuOpen(false);
    setDownloadState('preparing');
    showNotice(`Preparing all ${qualityLabel(quality)} downloads…`);
    try {
      const downloads = await Promise.all(downloadVariants.map(async (variant) => ({ variant, url: await prepareDownload(variant, quality) })));
      downloads.forEach(({ url }) => startDownload(url));
      showNotice(`${downloads.length} downloads started. Your browser may ask you to allow multiple downloads.`, 'success');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not prepare every download.', 'error');
    } finally {
      setDownloadState('idle');
    }
  }

  return <div className={`solo-video-player${!showingAll ? ' has-actions' : ''}`}>
    {notice && <div className={`solo-video-notification ${noticeKind}`} role="status" aria-live="polite">{notice}</div>}
    {variants.length > 1 && <div className="solo-video-ratios" aria-label="Choose a video ratio">
      <span>View ratio</span>
      <button type="button" className={showingAll ? 'active' : ''} onClick={() => selectRatio('all')}>All</button>
      {variants.map((variant) => <button type="button" className={variant.assetId === selected.assetId && !showingAll ? 'active' : ''} onClick={() => selectRatio(variant.assetId)} key={variant.assetId}>{selectorLabel(variant)}</button>)}
    </div>}
    {showingAll ? <div className="solo-video-all-stages">{variants.map((variant) => <div className={`solo-video-stage solo-video-all-stage-${selectorLabel(variant).toLowerCase()}${variant.assetId === audioVariantId ? ' solo-video-all-stage-primary' : ''}${cssAspectRatio(variant.aspectRatio) === '9 / 16' ? ' portrait' : ''}`} key={variant.assetId} style={{ '--variant-ratio': cssAspectRatio(variant.aspectRatio) } as CSSProperties}><div style={{ aspectRatio: cssAspectRatio(variant.aspectRatio) }}><MuxVideoPlayer assetId={variant.assetId} playbackId={variant.playbackId} poster={variant.thumbnailUrl} title={`${title} — ${selectorLabel(variant)}`} muted={variant.assetId !== audioVariantId} keyboardShortcuts={variant.assetId === audioVariantId} onVideoElement={registerSyncedVideo} /></div></div>)}</div> : <div className={`solo-video-stage${isPortrait ? ' portrait' : ''}`}><div style={{ aspectRatio: ratio }}><MuxVideoPlayer key={selected.playbackId} assetId={selected.assetId} playbackId={selected.playbackId} poster={selected.thumbnailUrl} title={`${title} — ${selectorLabel(selected)}`} autoPlay={Boolean(standaloneHref && variants.length === 1)} /></div></div>}
    <div className="solo-video-actions">
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
        {downloadVariants.length > 0 && <div className="solo-download-picker"><button type="button" disabled={downloadState === 'preparing'} aria-haspopup="menu" aria-expanded={downloadMenuOpen} onClick={() => setDownloadMenuOpen((open) => !open)}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M5 20h14" /></svg><span>{downloadState === 'preparing' ? 'Preparing…' : 'Download'}</span>
        </button>{downloadMenuOpen && <div className="solo-download-menu" role="menu" aria-label="Download quality">{downloadVariants.length > 1 && <div className="solo-download-menu-group solo-download-menu-all" role="group" aria-label="Download all ratios"><span>Download all</span>{downloadAllQualities.map((quality) => <button type="button" role="menuitem" key={quality} onClick={() => void getAllDownloads(quality)}>{quality === 'highest' ? 'Highest available' : quality}</button>)}</div>}{downloadVariants.map((variant) => <div className="solo-download-menu-group" role="group" aria-label={`${selectorLabel(variant)} quality`} key={variant.assetId}>{downloadVariants.length > 1 && <span>{selectorLabel(variant)}</span>}{availableDownloadQualities(variant.maxResolution).map((quality) => <button type="button" role="menuitem" key={quality} onClick={() => void getDownload(variant, quality)}>{quality === 'highest' ? 'Highest available' : quality}</button>)}</div>)}</div>}</div>}
      </div>
    </div>
  </div>;
}
