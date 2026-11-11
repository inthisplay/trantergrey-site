'use client';

import { PlaybackIcon } from './PlaybackIcon';

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
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

type RatioGroupTile = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type RatioGroupLayout = {
  height: number;
  tiles: RatioGroupTile[];
  width: number;
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
  const enterFullscreen = () => {
    const root = rootRef.current;
    const element = video();
    const rootWithWebkit = root as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }) | null;
    const videoWithWebkit = element as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) { void document.exitFullscreen?.(); return; }
    if (root?.requestFullscreen) { void root.requestFullscreen().catch(() => undefined); return; }
    if (rootWithWebkit?.webkitRequestFullscreen) { void rootWithWebkit.webkitRequestFullscreen().catch(() => undefined); return; }
    videoWithWebkit?.webkitEnterFullscreen?.();
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
    <VideoPlayer poster={poster ?? undefined}>
      <VideoSkin className="solo-videojs-skin">
        <MuxVideo source={{ playbackId }} playsInline crossOrigin="anonymous" autoPlay={autoPlay} />
        <MuxData metadata={{ video_id: assetId, video_title: title }} />
      </VideoSkin>
    </VideoPlayer>
    <div className={`tg-player-interface${started ? ' started' : ''}${controlsVisible ? '' : ' controls-hidden'}`} onClick={toggleFromSurface} onMouseMove={(event) => { wakeControls(); previewAtBottomPointer(event); }} onMouseLeave={() => setHoverPreview(null)}>
      <div className="tg-player-transport"><button className="tg-player-play" type="button" aria-keyshortcuts="Space k" aria-label={playing ? `Pause ${title}` : `Play ${title}`} onClick={togglePlayback}><PlaybackIcon playing={playing} /></button></div>
<div className="tg-player-bottom" style={{ '--player-progress': `${progress}%` } as CSSProperties}>{hoverPreview && <div className="tg-player-scrub-preview" style={{ left: `${hoverPreview.percent}%` }}><img src={`https://image.mux.com/${playbackId}/thumbnail.jpg?time=${hoverPreview.time}&width=240`} alt="" /><span>{formatTime(hoverPreview.time)}</span></div>}<span>{formatTime(currentTime)} / {formatTime(duration)}</span><input aria-label="Seek" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onMouseMove={previewAtPointer} onMouseLeave={() => setHoverPreview(null)} onChange={(event) => { const element = video(); if (element) element.currentTime = Number(event.target.value); }} /><div className="tg-player-controls"><div className="tg-player-volume" style={{ '--volume-offset': `${Math.round((isMuted ? 0 : volume) * 64)}px` } as CSSProperties}><div className="tg-player-volume-hitarea" role="slider" aria-label="Volume" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((isMuted ? 0 : volume) * 100)} onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onClick={setVolumeFromPointer} onMouseMove={(event) => { if (event.buttons) setVolumeFromPointer(event); }} /><button type="button" aria-keyshortcuts="m" aria-label={isMuted ? 'Unmute' : 'Mute'} onClick={() => { const element = video(); if (!element) return; element.muted = !element.muted; setIsMuted(element.muted); }}><svg viewBox="0 0 256 256" aria-hidden="true"><path d="M163.51,24.81a8,8,0,0,0-8.42.88L85.25,80H40A16,16,0,0,0,24,96v64a16,16,0,0,0,16,16H85.25l69.84,54.31A8,8,0,0,0,168,224V32A8,8,0,0,0,163.51,24.81ZM152,207.64,92.91,161.69A7.94,7.94,0,0,0,88,160H40V96H88a7.94,7.94,0,0,0,4.91-1.69L152,48.36Z" />{!isMuted && volume > .66 && <><path d="M208,104v48a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z" /><path d="M240,88v80a8,8,0,0,1-16,0V88a8,8,0,0,1,16,0Z" /></>}{!isMuted && volume > .05 && volume <= .66 && <path d="M208,104v48a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z" />}</svg></button></div><button type="button" aria-keyshortcuts="f" aria-label="Enter fullscreen" onClick={enterFullscreen}>⛶</button></div></div>
    </div>
  </div>;
}

function cssAspectRatio(value: string | null) {
  const match = value?.match(/^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/);
  return match ? `${match[1]} / ${match[2]}` : '16 / 9';
}

function numericAspectRatio(value: string | null) {
  const match = value?.match(/^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/);
  if (!match) return 16 / 9;
  return Number(match[1]) / Number(match[2]);
}

type RatioKind = 'horiz' | 'sqr' | 'vert' | 'other';

function ratioKind(value: number): RatioKind {
  if (Math.abs(value - (16 / 9)) < .04) return 'horiz';
  if (Math.abs(value - 1) < .04) return 'sqr';
  if (Math.abs(value - (9 / 16)) < .04) return 'vert';
  return 'other';
}

function arrangeRatioGroup(ratios: number[], availableWidth: number, availableHeight: number): RatioGroupLayout {
  const empty = { width: 0, height: 0, tiles: [] as RatioGroupTile[] };
  if (availableWidth <= 0 || availableHeight <= 0) return empty;
  const gap = 10;

  const kinds = ratios.map(ratioKind);
  const byKind = (kind: RatioKind) => kinds.indexOf(kind);
  const horiz = byKind('horiz');
  const sqr = byKind('sqr');
  const vert = byKind('vert');
  const tiles: Array<RatioGroupTile | undefined> = Array.from({ length: ratios.length });
  const add = (index: number, left: number, top: number, width: number, height: number) => {
    if (index >= 0) tiles[index] = { left, top, width, height };
  };
  const containerRatio = availableWidth / availableHeight;

  // Group A: 16:9 + 1:1 + 9:16.
  if (horiz >= 0 && sqr >= 0 && vert >= 0 && ratios.length === 3) {
    if (containerRatio <= 1.405) {
      const width = Math.min(availableWidth, (availableHeight - gap) / (9 / 16 + (25 / 52) * (16 / 9)));
      const topHeight = width * 9 / 16;
      const lowerWidth = width - gap;
      const squareWidth = lowerWidth * 27 / 52;
      const verticalWidth = lowerWidth * 25 / 52;
      const bottomHeight = verticalWidth * 16 / 9;
      add(horiz, 0, 0, width, topHeight);
      add(sqr, 0, topHeight + gap, squareWidth, squareWidth);
      add(vert, squareWidth + gap, topHeight + gap, verticalWidth, bottomHeight);
      return { width, height: topHeight + gap + bottomHeight, tiles: tiles as RatioGroupTile[] };
    }
    const width = Math.min(availableWidth, availableHeight / (4 / 9) + gap * 2);
    const contentWidth = width - gap * 2;
    const leftHeight = contentWidth * .27;
    const verticalWidth = contentWidth * .25;
    const verticalHeight = verticalWidth * 16 / 9;
    add(horiz, 0, (verticalHeight - leftHeight) / 2, contentWidth * .48, leftHeight);
    add(sqr, contentWidth * .48 + gap, (verticalHeight - leftHeight) / 2, contentWidth * .27, leftHeight);
    add(vert, contentWidth * .75 + gap * 2, 0, verticalWidth, verticalHeight);
    return { width, height: verticalHeight, tiles: tiles as RatioGroupTile[] };
  }

  // Group B: 16:9 + 1:1.
  if (horiz >= 0 && sqr >= 0 && ratios.length === 2) {
    if (containerRatio <= 4 / 3) {
      const width = Math.min(availableWidth, .64 * (availableHeight - gap));
      add(horiz, 0, 0, width, width * 9 / 16);
      add(sqr, 0, width * 9 / 16 + gap, width, width);
      return { width, height: width * 25 / 16 + gap, tiles: tiles as RatioGroupTile[] };
    }
    const width = Math.min(availableWidth, availableHeight / .36 + gap);
    const contentWidth = width - gap;
    const tileHeight = contentWidth * .36;
    add(horiz, 0, 0, contentWidth * 16 / 25, tileHeight);
    add(sqr, contentWidth * 16 / 25 + gap, 0, contentWidth * 9 / 25, tileHeight);
    return { width, height: tileHeight, tiles: tiles as RatioGroupTile[] };
  }

  // Group C: 16:9 + 9:16. The container ratio replaces the prototype's viewport-width threshold.
  if (horiz >= 0 && vert >= 0 && ratios.length === 2) {
    if (containerRatio <= 1.5) {
      const horizontalWidth = Math.min(availableWidth, Math.max(0, availableHeight - gap) * 16 / 9);
      const horizontalHeight = horizontalWidth * 9 / 16;
      const remainingHeight = Math.max(0, availableHeight - horizontalHeight - gap);
      const preferredVerticalHeight = availableHeight * .6;
      const verticalHeight = Math.min(remainingHeight, preferredVerticalHeight, horizontalWidth * 16 / 9);
      const verticalWidth = verticalHeight * 9 / 16;
      add(horiz, 0, 0, horizontalWidth, horizontalHeight);
      add(vert, (horizontalWidth - verticalWidth) / 2, horizontalHeight + gap, verticalWidth, verticalHeight);
      return { width: horizontalWidth, height: horizontalHeight + gap + verticalHeight, tiles: tiles as RatioGroupTile[] };
    }
    const width = Math.min(availableWidth, availableHeight / (16 / 27) + gap);
    const contentWidth = width - gap;
    const horizontalWidth = contentWidth * 2 / 3;
    const horizontalHeight = horizontalWidth * 9 / 16;
    const verticalWidth = contentWidth / 3;
    const verticalHeight = verticalWidth * 16 / 9;
    add(horiz, 0, (verticalHeight - horizontalHeight) / 2, horizontalWidth, horizontalHeight);
    add(vert, horizontalWidth + gap, 0, verticalWidth, verticalHeight);
    return { width, height: verticalHeight, tiles: tiles as RatioGroupTile[] };
  }

  // Group D: 1:1 + 9:16.
  if (sqr >= 0 && vert >= 0 && ratios.length === 2) {
    if (containerRatio <= 18 / 25) {
      const width = Math.min(availableWidth, .36 * (availableHeight - gap));
      add(sqr, 0, 0, width, width);
      add(vert, 0, width + gap, width, width * 16 / 9);
      return { width, height: width * 25 / 9 + gap, tiles: tiles as RatioGroupTile[] };
    }
    const width = Math.min(availableWidth, availableHeight * 9 / 8 + gap);
    const tileWidth = (width - gap) / 2;
    const verticalHeight = tileWidth * 16 / 9;
    add(sqr, 0, (verticalHeight - tileWidth) / 2, tileWidth, tileWidth);
    add(vert, tileWidth + gap, 0, tileWidth, verticalHeight);
    return { width, height: verticalHeight, tiles: tiles as RatioGroupTile[] };
  }

  // A one-ratio or unsupported group retains its intrinsic ratio within the supplied box.
  const ratio = ratios[0] || 16 / 9;
  const height = Math.min(availableHeight, availableWidth / ratio);
  return { width: height * ratio, height, tiles: [{ left: 0, top: 0, width: height * ratio, height }] };
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
  const mediaRegionRef = useRef<HTMLDivElement>(null);
  const ratioGroupRef = useRef<HTMLDivElement>(null);
  const [ratioGroupLayout, setRatioGroupLayout] = useState<RatioGroupLayout>({ width: 0, height: 0, tiles: [] });
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

  useLayoutEffect(() => {
    if (!showingAll) return;
    const group = ratioGroupRef.current;
    const region = mediaRegionRef.current;
    if (!group || !region) return;
    const update = () => {
      const style = window.getComputedStyle(region);
      const horizontalPadding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      const verticalPadding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
      const availableWidth = Math.max(0, region.clientWidth - horizontalPadding);
      const availableHeight = Math.max(0, region.clientHeight - verticalPadding);
      setRatioGroupLayout(arrangeRatioGroup(variants.map((variant) => numericAspectRatio(variant.aspectRatio)), availableWidth, availableHeight));
    };
    const frame = window.requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(region);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [showingAll, variants]);

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
    <div className="solo-video-media-region" ref={mediaRegionRef}>{showingAll ? <div className="solo-video-all-stages" ref={ratioGroupRef} style={{ width: `${ratioGroupLayout.width}px`, height: `${ratioGroupLayout.height}px` }}>{variants.map((variant, index) => {
      const tile = ratioGroupLayout.tiles[index];
      return <Fragment key={variant.assetId}><div className={`solo-video-stage solo-video-all-stage-${selectorLabel(variant).toLowerCase()}${variant.assetId === audioVariantId ? ' solo-video-all-stage-primary' : ''}${cssAspectRatio(variant.aspectRatio) === '9 / 16' ? ' portrait' : ''}`} style={tile ? { left: `${tile.left}px`, top: `${tile.top}px`, width: `${tile.width}px`, height: `${tile.height}px` } : undefined}><div style={{ aspectRatio: cssAspectRatio(variant.aspectRatio) }}><MuxVideoPlayer assetId={variant.assetId} playbackId={variant.playbackId} poster={variant.thumbnailUrl} title={`${title} — ${selectorLabel(variant)}`} muted={variant.assetId !== audioVariantId} keyboardShortcuts={variant.assetId === audioVariantId} onVideoElement={registerSyncedVideo} /></div></div></Fragment>;
    })}</div> : <div className={`solo-video-stage${isPortrait ? ' portrait' : ''}`} style={{ aspectRatio: ratio }}><div style={{ aspectRatio: ratio }}><MuxVideoPlayer key={selected.playbackId} assetId={selected.assetId} playbackId={selected.playbackId} poster={selected.thumbnailUrl} title={`${title} — ${selectorLabel(selected)}`} autoPlay={Boolean(standaloneHref && variants.length === 1)} /></div></div>}</div>
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
