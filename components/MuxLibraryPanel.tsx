'use client';

import { UiIcon } from '@/components/UiIcon';

import { uiIconMarkup } from '@/lib/ui-icons';
import { PlaybackIcon } from './PlaybackIcon';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Check, ChevronDown, Copy, ExternalLink, EyeOff, Label, Refresh, Server, SettingsCog, Trash, Upload, UserPlus } from 'pixelarticons/react';
import { MuxDateFilter, type MuxDateRange } from './MuxDateFilter';
import type { MatchedMuxLibraryAsset } from '@/lib/mux-matching';
import { hasDistinctRatios, ratioLabel, videoProjectSlug, type VideoProject, type VideoProjectCollection } from '@/lib/video-projects-shared';
import { CollectionRatioManager } from './CollectionRatioManager';
import { ClientPicker } from './ClientPicker';
import { MuxThemeToggle } from './MuxThemeToggle';
import { MuxVideoPlayer, SoloVideoPlayer, type SoloVideoVariant } from './SoloVideoPlayer';
import { VideoModal } from './VideoModal';

type LibraryStatus = MatchedMuxLibraryAsset['libraryStatus'];
type StatusFilter = LibraryStatus | 'all';
type ThumbnailFilter = 'all' | 'needs-thumbnail' | 'custom-thumbnail';
type GroupMode = 'date' | 'client';
type BulkAction = 'ratio' | 'project' | 'collection' | 'add-to-collection' | 'client' | 'detach' | 'delete' | 'remove-collection' | null;
type LibraryDisplayItem =
  | { kind: 'asset'; asset: MatchedMuxLibraryAsset }
  | { kind: 'collection'; collection: VideoProjectCollection; assets: MatchedMuxLibraryAsset[]; representative: MatchedMuxLibraryAsset }
  | { kind: 'project'; project: VideoProject; assets: MatchedMuxLibraryAsset[]; representative: MatchedMuxLibraryAsset };
type LibraryDropTarget = { kind: 'asset' | 'collection' | 'project'; id: string };
type PendingLibraryDrop = { sources: MatchedMuxLibraryAsset[]; target: MatchedMuxLibraryAsset };
type UploadState = { id: string; name: string; title: string; client: string; tags: string; variantLabel: string; assetId?: string; progress: number; state: 'uploading' | 'processing' | 'complete' | 'error'; error?: string; saving?: boolean; thumbnailFailed?: boolean };
type UploadDestination = 'solo' | 'collection';
type UploadRatioGroup = { id: string; title: string; uploadIds: string[] };
type DuplicateRatioWarning = { title: string; uploadIds: string[] } | null;
type UploadPlan = { client: string; tags: string[]; grouping: 'none'; name: string; collectionId: string };
type ReplacementProgress = { fileName: string; progress: number; stage: 'uploading' | 'processing' | 'swapping'; current: number; total: number };
type LibraryFacets = { clients: string[]; directoryClients?: string[]; years: number[]; statusCounts: Record<StatusFilter, number>; thumbnailCounts: { needsThumbnail: number; customThumbnail: number } };
type DeckCardMatch = { id: string; title: string; client: string };

const quickActionIcons = { view: PlaybackIcon, manage: SettingsCog, deck: Server, public: ExternalLink, select: Check, replace: Refresh, copy: Copy, client: UserPlus, tags: Label, publish: Upload, hide: EyeOff, delete: Trash };
type QuickActionIcon = keyof typeof quickActionIcons;

function QuickActionLabel({ icon, children }: { icon: QuickActionIcon; children: ReactNode }) {
  const Icon = quickActionIcons[children === 'Add to Deck' ? 'deck' : icon];
  return <><Icon className="mux-quick-action-icon" aria-hidden="true" /><span>{icon === 'view' ? 'Play' : children}</span></>;
}

function MobileActionsToggle({ title, expanded, onClick }: { title: string; expanded: boolean; onClick: () => void }) {
  return <><button className="mux-mobile-actions-toggle" type="button" aria-expanded={expanded} aria-label={`${expanded ? 'Close' : 'Open'} quick actions for ${title}`} onClick={(event) => { event.stopPropagation(); onClick(); }}><span aria-hidden="true"><span className="mux-mobile-menu-bar" /><span className="mux-mobile-menu-bar" /><span className="mux-mobile-menu-bar" /></span></button></>;
}

function MuxLibraryDndCard({ children, className, draggableAssets, dragLabel, dragEnabled = true, dropTarget }: { children: ReactNode; className?: string; draggableAssets?: MatchedMuxLibraryAsset[]; dragLabel?: string; dragEnabled?: boolean; dropTarget: LibraryDropTarget }) {
  const draggable = useDraggable({ id: `mux-drag:${dropTarget.kind}:${dropTarget.id}`, data: draggableAssets?.length ? { assetIds: draggableAssets.map((asset) => asset.id), previewAssetId: draggableAssets[0].id, dragLabel: dragLabel || draggableAssets[0].title, sourceTarget: dropTarget } : undefined, disabled: !draggableAssets?.length || !dragEnabled });
  const droppable = useDroppable({ id: `mux-drop:${dropTarget.kind}:${dropTarget.id}`, data: dropTarget });
  const setNodeRef = useCallback((node: HTMLElement | null) => { draggable.setNodeRef(node); droppable.setNodeRef(node); }, [draggable, droppable]);
  return <article ref={setNodeRef} className={`${className ?? ''} mux-library-dnd-card${draggableAssets?.length && dragEnabled ? ' mux-library-dnd-card--draggable' : ''}${draggable.isDragging ? ' is-library-dragging' : ''}${droppable.isOver ? ' is-library-drop-target' : ''}`.trim()} style={{ transform: CSS.Translate.toString(draggable.transform) }} {...(draggableAssets?.length && dragEnabled ? draggable.attributes : {})} {...(draggableAssets?.length && dragEnabled ? draggable.listeners : {})}>{children}</article>;
}

function duration(value: number) {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function clientName(asset: MatchedMuxLibraryAsset) {
  return asset.client?.trim() || 'Unassigned';
}

function friendlyAssetRatio(asset: MatchedMuxLibraryAsset) {
  if (asset.aspectRatio) return ratioLabel(asset.aspectRatio);
  const dimensions = `${asset.resolution ?? ''} ${asset.maxResolution ?? ''}`.match(/(\d+)\s*[x×]\s*(\d+)/i);
  return dimensions ? ratioLabel(`${dimensions[1]}:${dimensions[2]}`) : 'Ratio unavailable';
}

function publicationLabel(status: LibraryStatus) {
  return status === 'published' ? 'Published' : 'Unpublished';
}

function hasMuxError(asset: MatchedMuxLibraryAsset) {
  return /(?:error|fail)/i.test(asset.status);
}

function canPreviewAsset(asset: MatchedMuxLibraryAsset): asset is MatchedMuxLibraryAsset & { playbackId: string } {
  return asset.status === 'ready' && asset.duration > 0 && asset.playbackPolicy === 'public' && Boolean(asset.playbackId);
}

function isProcessingAsset(asset: MatchedMuxLibraryAsset) {
  return asset.status !== 'ready' || asset.duration <= 0;
}

function ProcessingOverlay({ asset }: { asset: MatchedMuxLibraryAsset }) {
  if (!isProcessingAsset(asset)) return null;
  return <span className="mux-processing-overlay" role="status"><i aria-hidden="true" /><strong>Processing</strong></span>;
}

function ThumbnailFallback() {
  return <span className="mux-thumbnail-fallback" aria-label="Thumbnail unavailable" />;
}

type ThumbnailFrameKind = 'landscape' | 'square' | 'portrait';

function thumbnailFrame(asset: MatchedMuxLibraryAsset): { kind: ThumbnailFrameKind; label: string | null } {
  const match = asset.aspectRatio?.match(/(\d+(?:\.\d+)?)\s*[:x×/]\s*(\d+(?:\.\d+)?)/i);
  if (!match) return { kind: 'landscape', label: null };
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return { kind: 'landscape', label: null };
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.08) return { kind: 'square', label: '1:1' };
  if (ratio < 0.85) return { kind: 'portrait', label: ratioLabel(asset.aspectRatio) };
  return { kind: 'landscape', label: null };
}

function LibraryThumbnail({ asset }: { asset: MatchedMuxLibraryAsset }) {
  if (!asset.thumbnailUrl) return <span>Preview unavailable</span>;
  const source = asset.thumbnailUrl.includes('image.mux.com/') ? asset.thumbnailUrl.replace(/([?&])width=\d+/, '$1width=800') : asset.thumbnailUrl;
  const frame = thumbnailFrame(asset);
  if (frame.kind === 'landscape') return <img src={source} alt="" loading="lazy" decoding="async" />;
  return <span className={`mux-library-thumbnail-frame mux-library-thumbnail-frame--${frame.kind}`}>
    <img className="mux-library-thumbnail-backdrop" src={source} alt="" loading="lazy" decoding="async" />
    <img className="mux-library-thumbnail-artwork" src={source} alt="" loading="lazy" decoding="async" />
    <span className="mux-library-thumbnail-ratio">{frame.label}</span>
  </span>;
}

function dateParts(createdAt: string | null) {
  if (!createdAt) return { key: 'undated', eyebrow: 'Date unavailable', title: 'Undated' };
  const dateOnly = createdAt.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month] = dateOnly;
    return {
      key: `${year}-${month}`,
      eyebrow: year,
      title: new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(new Date(`${year}-${month}-15T12:00:00Z`)),
    };
  }
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return { key: 'undated', eyebrow: 'Date unavailable', title: 'Undated' };
  return {
    key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    eyebrow: String(date.getFullYear()),
    title: new Intl.DateTimeFormat('en', { month: 'short' }).format(date),
  };
}

function libraryDate(asset: MatchedMuxLibraryAsset) {
  return asset.historicCreatedAt || asset.createdAt;
}

function libraryDateTimestamp(asset: MatchedMuxLibraryAsset) {
  const value = libraryDate(asset);
  if (!value) return Number.NEGATIVE_INFINITY;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? Number.NEGATIVE_INFINITY : date.getTime();
}

function parseTags(value: string) {
  return Array.from(new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean)));
}

function currentTagNeedle(value: string) {
  return value.split(',').at(-1)?.trim().toLowerCase() ?? '';
}

function acceptTag(value: string, tag: string) {
  const parts = value.split(',');
  parts.pop();
  const completed = parts.map((part) => part.trim()).filter(Boolean);
  if (!completed.some((part) => part.toLowerCase() === tag.toLowerCase())) completed.push(tag);
  return `${completed.join(', ')}, `;
}

function uploadBaseTitle(value: string) {
  return value.replace(/\.[^.]+$/, '').replace(/\s*[-_–—]\s*(?:horiz(?:ontal)?|horizontal|sqr|square|vert(?:ical)?|vertical)\b/i, '').trim();
}

function uploadVariantLabel(value: string) {
  if (/\b(?:horiz(?:ontal)?|horizontal)\b/i.test(value)) return 'Horiz';
  if (/\b(?:sqr|square)\b/i.test(value)) return 'Sqr';
  if (/\b(?:vert(?:ical)?|vertical)\b/i.test(value)) return 'Vert';
  return 'Main';
}

async function jsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(response.ok ? 'The Mux library returned an unreadable response.' : `The Mux library request failed (${response.status}).`);
  }
}

export function MuxLibraryPanel({ combinedSearch = false, loginDestination = '/admin/mux', publicPageBase = '/watch', publicLinksOpenInNewTab = true, compactPreviews = false }: { combinedSearch?: boolean; loginDestination?: string; publicPageBase?: string; publicLinksOpenInNewTab?: boolean; compactPreviews?: boolean }) {
  const uploadInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const groupReplaceInput = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<MatchedMuxLibraryAsset[] | null>(null);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [collections, setCollections] = useState<VideoProjectCollection[]>([]);
  const [query, setQuery] = useState('');
  const [client, setClient] = useState('All');
  const [combinedSearchValue, setCombinedSearchValue] = useState('');
  const [dateRange, setDateRange] = useState<MuxDateRange | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [thumbnailFilter, setThumbnailFilter] = useState<ThumbnailFilter>('all');
  const [groupMode, setGroupMode] = useState<GroupMode>('date');
  const [selectionMove, setSelectionMove] = useState<{ ids: string[]; destination: string; sourceCollectionId?: string } | null>(null);
  const [moveName, setMoveName] = useState('');
  const [moveError, setMoveError] = useState('');
  const [movingSelection, setMovingSelection] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdsRef = useRef<string[]>([]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  const [bulkAction, setBulkAction] = useState<BulkAction>(null);
  const [variantLabels, setVariantLabels] = useState<Record<string, string>>({});
  const [projectTitle, setProjectTitle] = useState('');
  const [projectClient, setProjectClient] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectCollectionIds, setProjectCollectionIds] = useState<string[]>([]);
  const [collectionName, setCollectionName] = useState('');
  const [existingCollectionId, setExistingCollectionId] = useState('');
  const [clientAssignment, setClientAssignment] = useState('');
  const [saving, setSaving] = useState<'project' | 'collection' | 'client' | 'detach' | 'delete' | ''>('');
  const [workspaceMessage, setWorkspaceMessage] = useState('');
  const [copiedAssetId, setCopiedAssetId] = useState('');
  const [copiedCollectionId, setCopiedCollectionId] = useState('');
  const [previewAssetId, setPreviewAssetId] = useState('');
  const [previewProjectId, setPreviewProjectId] = useState('');
  const [openMobileActions, setOpenMobileActions] = useState('');
  // Keep card dragging off until the device capability check has run.
  const [mobileViewport, setMobileViewport] = useState(true);
  const [hoveredQuickActionsCard, setHoveredQuickActionsCard] = useState('');
  const [activeLibraryDrag, setActiveLibraryDrag] = useState<{ assetId: string; label: string } | null>(null);
  const libraryDragX = useRef<number | null>(null);
  const libraryDragY = useRef<number | null>(null);
  const libraryDragStartX = useRef<number | null>(null);
  const libraryDragStartY = useRef<number | null>(null);
  const libraryDragOriginBounds = useRef<DOMRect | null>(null);
  const [pendingLibraryDrop, setPendingLibraryDrop] = useState<PendingLibraryDrop | null>(null);
  const [droppedGroupTitle, setDroppedGroupTitle] = useState('');
  const [libraryDropSaving, setLibraryDropSaving] = useState<'collection' | 'ratio' | 'add' | ''>('');
  const [selectingProjectId, setSelectingProjectId] = useState('');
  const [selectingCollectionId, setSelectingCollectionId] = useState('');
  const [showcaseCopied, setShowcaseCopied] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [editingProjectTitleId, setEditingProjectTitleId] = useState('');
  const [projectTitleDraft, setProjectTitleDraft] = useState('');
  const [tagsAssetId, setTagsAssetId] = useState('');
  const [tagsDraft, setTagsDraft] = useState('');
  const [tagsProjectId, setTagsProjectId] = useState('');
  const [managingCollectionId, setManagingCollectionId] = useState('');
  const [deleteCollectionId, setDeleteCollectionId] = useState('');
  const [collectionNameDraft, setCollectionNameDraft] = useState('');
  const [collectionTagsDraft, setCollectionTagsDraft] = useState('');
  const [collectionTagsFocused, setCollectionTagsFocused] = useState(false);
  const [savingCollection, setSavingCollection] = useState(false);
  const [deleteAssetId, setDeleteAssetId] = useState('');
  const [deleteProjectId, setDeleteProjectId] = useState('');
  const [savingAssetId, setSavingAssetId] = useState('');
  const [savingProjectId, setSavingProjectId] = useState('');
  const [error, setError] = useState('');
  const [matchedAssetIds, setMatchedAssetIds] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [resultTotal, setResultTotal] = useState(0);
  const [facets, setFacets] = useState<LibraryFacets | null>(null);
  const loadMoreSentinel = useRef<HTMLDivElement>(null);
  const libraryRequestSequence = useRef(0);
  const [refreshingLibrary, setRefreshingLibrary] = useState(false);
  const [locallyProcessingAssetIds, setLocallyProcessingAssetIds] = useState<string[]>([]);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [uploadDrawerOpen, setUploadDrawerOpen] = useState(false);
  const [uploadClient, setUploadClient] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadDestination, setUploadDestination] = useState<UploadDestination>('solo');
  const [uploadCollectionName, setUploadCollectionName] = useState('');
  const [uploadCollectionId, setUploadCollectionId] = useState('');
  const [uploadRatiosIncluded, setUploadRatiosIncluded] = useState(false);
  const [selectedUploadIds, setSelectedUploadIds] = useState<string[]>([]);
  const [uploadRatioGroups, setUploadRatioGroups] = useState<UploadRatioGroup[]>([]);
  const [ratioGroupTitle, setRatioGroupTitle] = useState('');
  const [duplicateRatioWarning, setDuplicateRatioWarning] = useState<DuplicateRatioWarning>(null);
  const [startingUploads, setStartingUploads] = useState(false);
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const [tagPickerUploadId, setTagPickerUploadId] = useState('');
  const [savingUploadDetails, setSavingUploadDetails] = useState(false);
  const [clientReminderOpen, setClientReminderOpen] = useState(false);
  const [replaceTargetId, setReplaceTargetId] = useState('');
  const [replaceProjectId, setReplaceProjectId] = useState('');
  const [replacingProjectId, setReplacingProjectId] = useState('');
  const [replacingAssetId, setReplacingAssetId] = useState('');
  const [replacementProgress, setReplacementProgress] = useState<ReplacementProgress | null>(null);
  const [deckVideo, setDeckVideo] = useState<MatchedMuxLibraryAsset | null>(null);
  const [deckCards, setDeckCards] = useState<DeckCardMatch[]>([]);
  const [selectedDeckCardId, setSelectedDeckCardId] = useState('');
  const [loadingDeckCards, setLoadingDeckCards] = useState(false);
  const [postingToDeck, setPostingToDeck] = useState(false);
  const [deckPostError, setDeckPostError] = useState('');

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px), (pointer: coarse)');
    const update = () => setMobileViewport(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (publicLinksOpenInNewTab) return;
    const openInsideTeamApp = (event: MouseEvent) => {
      const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>(`a[href^="${publicPageBase}/"]`);
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      window.location.assign(link.href);
    };
    document.addEventListener('click', openInsideTeamApp);
    return () => document.removeEventListener('click', openInsideTeamApp);
  }, [publicLinksOpenInNewTab, publicPageBase]);

  async function refreshLibrary(cursor: number | null = null) {
    const requestSequence = ++libraryRequestSequence.current;
    setRefreshingLibrary(true);
    try {
      let response: Response | undefined;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const params = new URLSearchParams({ limit: '48', query, client, status: statusFilter, thumbnail: thumbnailFilter });
          if (dateRange) { params.set('dateStart', dateRange.start); params.set('dateEnd', dateRange.end); }
          if (cursor !== null) params.set('cursor', String(cursor));
          response = await fetch(`/api/mux/library?${params}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
        } catch (reason) {
          if (attempt === 2) throw reason;
        }
        if (response && ![502, 503, 504].includes(response.status)) break;
        if (attempt < 2) {
          await response?.body?.cancel();
          response = undefined;
          await new Promise((resolve) => window.setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
      if (!response) throw new Error('The library could not be reached. Please try again.');
      if (response.status === 401) { window.location.replace(`/login?next=${encodeURIComponent(loginDestination)}`); return; }
      const payload = await jsonResponse<{ assets?: MatchedMuxLibraryAsset[]; projects?: VideoProject[]; collections?: VideoProjectCollection[]; pageAssetIds?: string[]; total?: number; nextCursor?: number | null; facets?: LibraryFacets; error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || 'Unable to open the Mux library.');
      if (requestSequence !== libraryRequestSequence.current) return;
      if (cursor === null) {
        setAssets((current) => [...new Map([...(current ?? []).filter((asset) => selectedIdsRef.current.includes(asset.id)), ...(payload.assets ?? [])].map((asset) => [asset.id, asset])).values()]); setMatchedAssetIds(payload.pageAssetIds ?? []);
        setProjects(payload.projects ?? []); setCollections(payload.collections ?? []); setFacets(payload.facets ?? null);
      } else {
        setAssets((current) => [...new Map([...(current ?? []), ...(payload.assets ?? [])].map((asset) => [asset.id, asset])).values()]);
        setMatchedAssetIds((current) => [...new Set([...current, ...(payload.pageAssetIds ?? [])])]);
      }
      setResultTotal(payload.total ?? 0); setNextCursor(payload.nextCursor ?? null);
      setError('');
    } catch (reason) {
      if (requestSequence !== libraryRequestSequence.current) return;
      setError(reason instanceof Error ? reason.message : 'Unable to open the Mux library.');
    } finally {
      if (requestSequence === libraryRequestSequence.current) setRefreshingLibrary(false);
    }
  }


  useEffect(() => {
    const timeout = window.setTimeout(() => { void refreshLibrary(); }, query ? 220 : 0);
    return () => window.clearTimeout(timeout);
  }, [query, client, dateRange, statusFilter, thumbnailFilter]);

  useEffect(() => {
    if (!assets || !locallyProcessingAssetIds.length) return;
    const processingIds = locallyProcessingAssetIds.filter((id) => assets.some((asset) => asset.id === id && isProcessingAsset(asset)));
    if (processingIds.length !== locallyProcessingAssetIds.length) {
      setLocallyProcessingAssetIds(processingIds);
      return;
    }
    if (!processingIds.length) return;
    const interval = window.setInterval(() => { void refreshLibrary(); }, 15000);
    return () => window.clearInterval(interval);
  }, [assets, locallyProcessingAssetIds]);

  useEffect(() => {
    if (!workspaceMessage) return;
    const timeout = window.setTimeout(() => setWorkspaceMessage(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [workspaceMessage]);

  useEffect(() => {
    if (!activeLibraryDrag) return;
    let frame = 0;
    let secondaryPointerId: number | null = null;
    let lastSecondaryY = 0;
    const zoneWidth = Math.min(84, window.innerWidth * 0.2);
    const scrollAtEdge = () => {
      const x = libraryDragX.current;
      const y = libraryDragY.current;
      if (x == null || y == null) { frame = requestAnimationFrame(scrollAtEdge); return; }
      const origin = libraryDragOriginBounds.current;
      if (origin && x >= origin.left && x <= origin.right && y >= origin.top && y <= origin.bottom) {
        frame = requestAnimationFrame(scrollAtEdge);
        return;
      }
      libraryDragOriginBounds.current = null;
      const inGutter = x <= zoneWidth;
      const halfHeight = window.innerHeight / 2;
      const direction = inGutter ? (y < halfHeight ? -1 : 1) : y < 80 ? -1 : y > window.innerHeight - 110 ? 1 : 0;
      const zoneProgress = inGutter ? Math.min(1, (y < halfHeight ? halfHeight - y : y - halfHeight) / halfHeight) : 0;
      const amount = direction * (inGutter ? Math.round(30 + zoneProgress * 90) : 22);
      if (amount) window.scrollBy(0, amount);
      frame = requestAnimationFrame(scrollAtEdge);
    };
    const startSecondFingerScroll = (event: PointerEvent) => {
      if (event.isPrimary || secondaryPointerId !== null) return;
      secondaryPointerId = event.pointerId;
      lastSecondaryY = event.clientY;
    };
    const moveSecondFingerScroll = (event: PointerEvent) => {
      if (event.pointerId !== secondaryPointerId) return;
      const delta = lastSecondaryY - event.clientY;
      if (delta) window.scrollBy(0, delta);
      lastSecondaryY = event.clientY;
    };
    const endSecondFingerScroll = (event: PointerEvent) => {
      if (event.pointerId === secondaryPointerId) secondaryPointerId = null;
    };
    addEventListener('pointerdown', startSecondFingerScroll, true);
    addEventListener('pointermove', moveSecondFingerScroll, true);
    addEventListener('pointerup', endSecondFingerScroll, true);
    addEventListener('pointercancel', endSecondFingerScroll, true);
    frame = requestAnimationFrame(scrollAtEdge);
    return () => {
      removeEventListener('pointerdown', startSecondFingerScroll, true);
      removeEventListener('pointermove', moveSecondFingerScroll, true);
      removeEventListener('pointerup', endSecondFingerScroll, true);
      removeEventListener('pointercancel', endSecondFingerScroll, true);
      libraryDragX.current = null;
      libraryDragY.current = null;
      libraryDragStartX.current = null;
      libraryDragStartY.current = null;
      if (frame) cancelAnimationFrame(frame);
    };
  }, [activeLibraryDrag]);

  function beginLibraryDragPosition(event: DragStartEvent) {
    // The drawer sits at a viewport edge. Do not scroll until the drag leaves it.
    libraryDragOriginBounds.current = event.active.data.current?.selection
      ? document.querySelector('.mux-selection-drawer')?.getBoundingClientRect() ?? null
      : null;
    const pointer = event.activatorEvent as PointerEvent;
    libraryDragStartX.current = pointer.clientX;
    libraryDragStartY.current = pointer.clientY;
    libraryDragX.current = pointer.clientX;
    libraryDragY.current = pointer.clientY;
  }

  function updateLibraryDragPosition(event: DragMoveEvent) {
    if (libraryDragStartX.current != null) libraryDragX.current = libraryDragStartX.current + event.delta.x;
    if (libraryDragStartY.current != null) libraryDragY.current = libraryDragStartY.current + event.delta.y;
  }

  async function waitForMuxAsset(uploadId: string, readyOnly = true) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const response = await fetch(`/api/admin/mux-uploads?uploadId=${encodeURIComponent(uploadId)}`, { cache: 'no-store' });
      const payload = await jsonResponse<{ assetId?: string | null; ready?: boolean; status?: string; error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || 'Could not check the Mux upload.');
      if (payload.assetId && (!readyOnly || payload.ready)) return payload.assetId;
      if (payload.status && /(?:error|fail)/i.test(payload.status)) throw new Error('Mux could not process this video. Check its source file and try again.');
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }
    throw new Error('Mux is still preparing this upload.');
  }

  async function saveUploadMetadata(assetId: string, plan: UploadPlan) {
    const requests: Promise<Response>[] = [];
    if (plan.client.trim()) requests.push(fetch('/api/admin/mux-assets/client', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetIds: [assetId], client: plan.client }) }));
    if (plan.tags.length) requests.push(fetch('/api/admin/mux-assets/metadata', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId, tags: plan.tags }) }));
    const responses = await Promise.all(requests);
    const failed = responses.find((response) => !response.ok);
    if (failed) {
      const payload = await jsonResponse<{ error?: string }>(failed);
      throw new Error(payload.error || 'The video uploaded, but its client or tags could not be saved.');
    }
  }

  async function uploadFile(file: File, plan: UploadPlan) {
    const id = `${file.name}-${file.lastModified}-${file.size}-${crypto.randomUUID()}`;
    const initialTitle = file.name.replace(/\.[^.]+$/, '');
    setUploads((current) => [...current, { id, name: file.name, title: initialTitle, client: plan.client, tags: plan.tags.join(', '), variantLabel: uploadVariantLabel(file.name), progress: 0, state: 'uploading' }]);
    const update = (patch: Partial<UploadState>) => setUploads((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    try {
      const response = await fetch('/api/admin/mux-uploads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: file.name.replace(/\.[^.]+$/, '') }) });
      const payload = await jsonResponse<{ id?: string; url?: string; error?: string }>(response);
      if (!response.ok || !payload.url || !payload.id) throw new Error(payload.error || 'Could not prepare that upload.');
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.upload.onprogress = (event) => { if (event.lengthComputable) update({ progress: Math.round((event.loaded / event.total) * 100) }); };
        request.onerror = () => reject(new Error('The upload was interrupted. Please try again.'));
        request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`Mux rejected the upload (${request.status}).`));
        request.open('PUT', payload.url!);
        request.send(file);
      });
      // Once Mux assigns an asset ID, it can be saved into a project while
      // encoding continues. The ready wait below is only for UI completion.
      update({ progress: 100, state: 'processing' });
      const assetId = await waitForMuxAsset(payload.id, false);
      await saveUploadMetadata(assetId, plan);
      update({ assetId, progress: 100, state: 'processing' });
      setLocallyProcessingAssetIds((current) => current.includes(assetId) ? current : [...current, assetId]);
      window.setTimeout(() => void refreshLibrary(), 2500);
      await waitForMuxAsset(payload.id);
      update({ progress: 100, state: 'complete' });
      return assetId;
    } catch (reason) {
      update({ state: 'error', error: reason instanceof Error ? reason.message : 'Could not upload that file.' });
      return null;
    }
  }

  async function replaceVideo(file: File, previousAssetId: string, batch = { current: 1, total: 1 }) {
    setReplacingAssetId(previousAssetId);
    setReplacementProgress({ fileName: file.name, progress: 0, stage: 'uploading', ...batch });
    setWorkspaceMessage('Uploading replacement to Mux…');
    try {
      const response = await fetch('/api/admin/mux-uploads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: file.name.replace(/\.[^.]+$/, '') }) });
      const upload = await jsonResponse<{ id?: string; url?: string; error?: string }>(response);
      if (!response.ok || !upload.id || !upload.url) throw new Error(upload.error || 'Could not prepare the replacement upload.');
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) setReplacementProgress((current) => current ? { ...current, progress: Math.round((event.loaded / event.total) * 100) } : current);
        };
        request.onerror = () => reject(new Error('The replacement upload was interrupted. Please try again.'));
        request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`Mux rejected the replacement (${request.status}).`));
        request.open('PUT', upload.url!);
        request.send(file);
      });
      setReplacementProgress((current) => current ? { ...current, progress: 100, stage: 'processing' } : current);
      setWorkspaceMessage('Replacement uploaded. Waiting for Mux to process it…');
      const replacementAssetId = await waitForMuxAsset(upload.id);
      setReplacementProgress((current) => current ? { ...current, stage: 'swapping' } : current);
      let payload: { project?: VideoProject; error?: string } | undefined;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const swap = await fetch('/api/admin/mux-assets/replace', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: previousAssetId, replacementAssetId }) });
        payload = await jsonResponse<{ project?: VideoProject; error?: string }>(swap);
        if (swap.ok && payload.project) break;
        if (!payload.error?.includes('still processing')) throw new Error(payload.error || 'Could not swap the replacement video.');
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
      if (!payload?.project) throw new Error('Mux is still processing the replacement. Please try again in a moment.');
      await refreshLibrary();
      setWorkspaceMessage(`Replacement is live at /watch/${payload.project.slug}.`);
      return true;
    } catch (reason) {
      setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not replace this video.');
      return false;
    } finally {
      setReplacingAssetId('');
      setReplaceTargetId('');
      if (batch.total === 1) setReplacementProgress(null);
      if (replaceInput.current) replaceInput.current.value = '';
    }
  }

  async function replaceProjectVideos(files: File[], project: VideoProject, projectAssets: MatchedMuxLibraryAsset[]) {
    if (files.length !== projectAssets.length) {
      setWorkspaceMessage(`Choose exactly ${projectAssets.length} files to replace the ${projectAssets.length} ratios in “${project.title}.”`);
      return;
    }
    setReplacingProjectId(project.id);
    try {
      for (const [index, file] of files.entries()) {
        setWorkspaceMessage(`Replacing ${index + 1} of ${projectAssets.length} ratios in “${project.title}”…`);
        const replaced = await replaceVideo(file, projectAssets[index].id, { current: index + 1, total: projectAssets.length });
        if (!replaced) return;
      }
      setWorkspaceMessage(`All ${projectAssets.length} ratios in “${project.title}” were replaced. Its public URL is unchanged.`);
    } finally {
      setReplacingProjectId('');
      setReplaceProjectId('');
      setReplacementProgress(null);
      if (groupReplaceInput.current) groupReplaceInput.current.value = '';
    }
  }

  function addFiles(files: FileList | File[]) {
    const videos = Array.from(files).filter((file) => file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name));
    if (uploads.some((upload) => upload.state !== 'error') || savingUploadDetails) {
      setUploadDrawerOpen(true);
      setWorkspaceMessage('Save the current upload details before starting another batch.');
      return;
    }
    if (!videos.length) { setWorkspaceMessage('Choose a video file to upload.'); return; }
    setUploads([]);
    setPendingUploadFiles(videos);
    setUploadDestination('solo');
    setUploadCollectionName('');
    setUploadCollectionId('');
    setUploadRatiosIncluded(false);
    setSelectedUploadIds([]);
    setUploadRatioGroups([]);
    setRatioGroupTitle(uploadBaseTitle(videos[0].name));
    setDuplicateRatioWarning(null);
    setUploadClient('');
    setUploadTags('');
    setTagPickerUploadId('');
    setUploadDrawerOpen(true);
    const plan: UploadPlan = { client: '', tags: [], grouping: 'none', name: '', collectionId: '' };
    void Promise.all(videos.map((file) => uploadFile(file, plan))).then(() => void refreshLibrary());
  }

  function updateUpload(id: string, patch: Partial<UploadState>) {
    setUploads((current) => current.map((upload) => upload.id === id ? { ...upload, ...patch } : upload));
  }

  function toggleUploadForRatioGroup(uploadId: string) {
    setSelectedUploadIds((current) => current.includes(uploadId) ? current.filter((id) => id !== uploadId) : [...current, uploadId]);
  }

  function createRatioGroup(uploadIds: string[], title: string, allowDuplicateRatios = false) {
    const cleanTitle = title.trim();
    if (uploadIds.length < 2) { setWorkspaceMessage('Select at least two videos to make a ratio group.'); return; }
    if (!cleanTitle) { setWorkspaceMessage('Give the ratio group one shared title.'); return; }
    const labels = uploadIds.map((id) => {
      const upload = uploads.find((item) => item.id === id);
      const asset = upload?.assetId ? assetsById.get(upload.assetId) : undefined;
      return asset ? ratioLabel(asset.aspectRatio) : upload?.variantLabel || 'Main';
    });
    if (!allowDuplicateRatios && new Set(labels).size !== labels.length) {
      setDuplicateRatioWarning({ title: cleanTitle, uploadIds });
      return;
    }
    setUploadRatioGroups((current) => [...current, { id: crypto.randomUUID(), title: cleanTitle, uploadIds }]);
    setSelectedUploadIds([]);
    setRatioGroupTitle('');
    setDuplicateRatioWarning(null);
  }

  function removeRatioGroup(groupId: string) {
    setUploadRatioGroups((current) => current.filter((group) => group.id !== groupId));
  }

  async function saveUploadDetails() {
    if (uploads.some((upload) => upload.state === 'uploading')) return;
    const readyUploads = uploads.filter((upload): upload is UploadState & { assetId: string } => Boolean(upload.assetId));
    if (!readyUploads.length) {
      setWorkspaceMessage('Mux has not created an asset for this upload yet.');
      return;
    }
    if (uploadDestination === 'collection' && !uploadCollectionName.trim()) {
      setWorkspaceMessage('Choose or enter a collection name.');
      return;
    }
    setSavingUploadDetails(true);
    setUploads((current) => current.map((upload) => ({ ...upload, saving: true, error: undefined })));
    try {
      const readyUploadIds = new Set(readyUploads.map((upload) => upload.id));
      const effectiveRatioGroups = uploadRatioGroups.map((group) => ({ ...group, uploadIds: group.uploadIds.filter((uploadId) => readyUploadIds.has(uploadId)) })).filter((group) => group.uploadIds.length >= 2);
      const ratioGroupByUploadId = new Map(effectiveRatioGroups.flatMap((group) => group.uploadIds.map((uploadId) => [uploadId, group])));
      const responses = await Promise.all(readyUploads.map((upload) => {
        const ratioGroup = ratioGroupByUploadId.get(upload.id);
        const client = uploadClient.trim() || upload.client.trim();
        const tags = parseTags(uploadTags || upload.tags);
        return fetch('/api/admin/mux-assets/metadata', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ assetId: upload.assetId, title: ratioGroup?.title || upload.title.trim() || upload.name.replace(/\.[^.]+$/, ''), tags, client: client || undefined }),
        });
      }));
      const failed = responses.find((response) => !response.ok);
      if (failed) { const payload = await jsonResponse<{ error?: string }>(failed); throw new Error(payload.error || 'Could not save these video details.'); }
      // The upload-start refresh can still be finishing while an editor saves
      // a new client. Rebuild after metadata is persisted so that older refresh
      // cannot leave this newly saved video displayed as “Unassigned”.
      const catalogRefresh = await fetch('/api/admin/mux-refresh', { method: 'POST', cache: 'no-store' });
      const catalogPayload = await jsonResponse<{ error?: string }>(catalogRefresh);
      if (!catalogRefresh.ok) throw new Error(catalogPayload.error || 'Video details saved, but the Mux library could not refresh.');
      const groupedIds = new Set(effectiveRatioGroups.flatMap((group) => group.uploadIds));
      const soloAssetIds = readyUploads.filter((upload) => !groupedIds.has(upload.id)).map((upload) => upload.assetId);
      let collectionId = '';
      if (uploadDestination === 'collection') {
        const response = await fetch('/api/admin/video-collections', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ collectionId: uploadCollectionId || undefined, name: uploadCollectionName.trim(), assetIds: soloAssetIds, clientsByAssetId: Object.fromEntries(soloAssetIds.map((assetId) => [assetId, uploadClient.trim()])), allowEmpty: effectiveRatioGroups.length > 0 }) });
        const payload = await jsonResponse<{ collection?: VideoProjectCollection; error?: string }>(response);
        if (!response.ok || !payload.collection) throw new Error(payload.error || 'Could not add these videos to the collection.');
        collectionId = payload.collection.id;
      }
      for (const group of effectiveRatioGroups) {
        const variants = group.uploadIds.map((uploadId, order) => {
          const upload = readyUploads.find((item) => item.id === uploadId)!;
          const asset = assetsById.get(upload.assetId);
          return { assetId: upload.assetId, label: asset ? ratioLabel(asset.aspectRatio) : '', order };
        });
        const response = await fetch('/api/admin/video-projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: group.title, client: uploadClient.trim(), collectionIds: collectionId ? [collectionId] : [], variants, mergeExisting: true }) });
        const payload = await jsonResponse<{ error?: string }>(response);
        if (!response.ok) throw new Error(payload.error || `Could not create the ratio group “${group.title}.”`);
      }
      if (uploadDestination === 'solo') {
        const soloUploads = readyUploads.filter((upload) => !groupedIds.has(upload.id));
        const projects = await Promise.all(soloUploads.map(async (upload) => {
          const response = await fetch('/api/admin/video-projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: upload.title.trim() || upload.name.replace(/\.[^.]+$/, ''), client: uploadClient.trim() || upload.client.trim(), variants: [{ assetId: upload.assetId, label: upload.variantLabel }], reuseSolo: true }) });
          const payload = await jsonResponse<{ error?: string }>(response);
          if (!response.ok) throw new Error(payload.error || `Could not create a short URL for “${upload.title}.”`);
        }));
        await Promise.all(projects);
      }
      setUploads((current) => current.map((upload) => ({ ...upload, saving: false })));
      setUploadDrawerOpen(false);
      setUploadCollectionId('');
      setUploads([]);
      setPendingUploadFiles([]);
      const failedCount = uploads.length - readyUploads.length;
      setWorkspaceMessage(`Saved upload details for ${readyUploads.length} ${readyUploads.length === 1 ? 'video' : 'videos'}${failedCount ? `. ${failedCount} failed upload${failedCount === 1 ? ' was' : 's were'} skipped.` : '.'}`);
      await refreshLibrary();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not save these video details.';
      setUploads((current) => current.map((upload) => ({ ...upload, saving: false, error: message })));
      setWorkspaceMessage(message);
    } finally { setSavingUploadDetails(false); }
  }

  function requestSaveUploadDetails() {
    if (!uploadClient.trim() && uploads.every((upload) => !upload.client.trim())) { setClientReminderOpen(true); return; }
    void saveUploadDetails();
  }

  function chooseUpload(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = '';
  }

  function dropUpload(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingUpload(false);
    addFiles(event.dataTransfer.files);
  }

  const clients = facets?.clients ?? ['All'];
  const assignmentClients = facets?.directoryClients ?? clients.filter(name=>name!=='All' && name!=='Unassigned');
  const combinedSearchSuggestions = useMemo(() => Array.from(new Set([
    ...clients.filter((item) => item !== 'All' && item !== 'Unassigned'),
    ...(assets ?? []).map((asset) => asset.title.trim()).filter(Boolean),
  ])).sort((first, second) => first.localeCompare(second)).slice(0, 500), [assets, clients]);
  function updateCombinedSearch(value: string) {
    setCombinedSearchValue(value);
    const matchingClient = clients.find((item) => item !== 'All' && item.localeCompare(value, undefined, { sensitivity: 'accent' }) === 0);
    if (matchingClient) {
      setClient(matchingClient);
      setQuery('');
      return;
    }
    setClient('All');
    setQuery(value);
  }
  const dateYears = facets?.years ?? [];
  const matches = useMemo(() => {
    const byId = new Map((assets ?? []).map((asset) => [asset.id, asset]));
    return matchedAssetIds.map((id) => byId.get(id)).filter((asset): asset is MatchedMuxLibraryAsset => Boolean(asset));
  }, [assets, matchedAssetIds]);
  const statusCounts = facets?.statusCounts ?? { all: 0, published: 0, unreviewed: 0, hidden: 0 };
  const thumbnailCounts = facets?.thumbnailCounts ?? { needsThumbnail: 0, customThumbnail: 0 };
  const hasFilters = Boolean(dateRange || query.trim()) || client !== 'All' || statusFilter !== 'all' || thumbnailFilter !== 'all';
  const driveSearchTerm = query.trim() || (client === 'All' || client === 'Unassigned' ? '' : client);
  const driveSearchUrl = `https://drive.google.com/drive/search?q=${encodeURIComponent(['type:video', driveSearchTerm].filter(Boolean).join(' '))}`;
  const assetsById = useMemo(() => new Map((assets ?? []).map((asset) => [asset.id, asset])), [assets]);
  const projectByAssetId = useMemo(() => {
    const map = new Map<string, VideoProject>();
    projects.forEach((project) => project.variants.forEach((variant) => map.set(variant.assetId, project)));
    return map;
  }, [projects]);
  const displayItems = useMemo<LibraryDisplayItem[]>(() => {
    const assetsByCollectionId = new Map<string, MatchedMuxLibraryAsset[]>();
    const collectionIdByAssetId = new Map<string, string>();
    for (const collection of collections) {
      const collectionAssets: MatchedMuxLibraryAsset[] = [];
      for (const project of projects) {
        if (!project.collectionIds.includes(collection.id)) continue;
        for (const variant of project.variants) {
          const asset = assetsById.get(variant.assetId);
          if (!asset || collectionIdByAssetId.has(asset.id)) continue;
          collectionAssets.push(asset);
          collectionIdByAssetId.set(asset.id, collection.id);
        }
      }
      if (collectionAssets.length) assetsByCollectionId.set(collection.id, collectionAssets);
    }

    const emittedCollections = new Set<string>();
    const emittedProjects = new Set<string>();
    return matches.flatMap((asset): LibraryDisplayItem[] => {
      const collectionId = collectionIdByAssetId.get(asset.id);
      if (collectionId) {
        if (emittedCollections.has(collectionId)) return [];
        const collection = collections.find((item) => item.id === collectionId);
        const collectionAssets = assetsByCollectionId.get(collectionId);
        if (!collection || !collectionAssets?.length) return [{ kind: 'asset', asset }];
        emittedCollections.add(collectionId);
        return [{ kind: 'collection', collection, assets: collectionAssets, representative: asset }];
      }
      const project = projectByAssetId.get(asset.id);
      if (!project || project.variants.length < 2) return [{ kind: 'asset', asset }];
      if (emittedProjects.has(project.id)) return [];
      const projectAssets = project.variants.map((variant) => ({ variant, asset: assetsById.get(variant.assetId) })).filter((item): item is { variant: VideoProject['variants'][number]; asset: MatchedMuxLibraryAsset } => Boolean(item.asset));
      if (projectAssets.length < 2) return [{ kind: 'asset', asset }];
      emittedProjects.add(project.id);
      const horizontal = projectAssets.find((item) => /^horiz(?:ontal)?$/i.test(item.variant.label));
      const orderedAssets = horizontal ? [horizontal.asset, ...projectAssets.filter((item) => item.asset.id !== horizontal.asset.id).map((item) => item.asset)] : projectAssets.map((item) => item.asset);
      return [{ kind: 'project', project, assets: orderedAssets, representative: orderedAssets[0] }];
    });
  }, [assetsById, collections, matches, projectByAssetId, projects, selectionMode]);
  const groups = useMemo(() => {
    const grouped = new Map<string, { key: string; eyebrow: string; title: string; items: LibraryDisplayItem[] }>();
    const orderedItems = groupMode === 'date'
      ? [...displayItems].sort((first, second) => {
        const firstAsset = first.kind === 'asset' ? first.asset : first.representative;
        const secondAsset = second.kind === 'asset' ? second.asset : second.representative;
        return libraryDateTimestamp(secondAsset) - libraryDateTimestamp(firstAsset);
      })
      : displayItems;
    for (const item of orderedItems) {
      const asset = item.kind === 'asset' ? item.asset : item.representative;
      const parts = groupMode === 'date'
        ? dateParts(libraryDate(asset))
        : { key: clientName(asset), eyebrow: 'Client group', title: clientName(asset) };
      const group = grouped.get(parts.key) ?? { ...parts, items: [] };
      group.items.push(item);
      grouped.set(parts.key, group);
    }
    const values = [...grouped.values()];
    return groupMode === 'client' ? values.sort((first, second) => first.title.localeCompare(second.title)) : values;
  }, [displayItems, groupMode]);
  const hasMoreItems = nextCursor !== null;
  useEffect(() => {
    const sentinel = loadMoreSentinel.current;
    if (!sentinel || !hasMoreItems) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && nextCursor !== null) void refreshLibrary(nextCursor);
    }, { rootMargin: '600px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreItems, nextCursor]);
  const selectedAssets = selectedIds.map((id) => assetsById.get(id)).filter((asset): asset is MatchedMuxLibraryAsset => Boolean(asset));
  const selectionSources = selectedIds.map((id) => projectByAssetId.get(id)?.collectionIds ?? []);
  const singleSourceCollection = selectedIds.length && selectionSources.every((ids) => ids.length === 1 && ids[0] === selectionSources[0][0]) ? collections.find((c) => c.id === selectionSources[0][0]) : undefined;
  const canCreateRatioGroup = selectedAssets.length === selectedIds.length
    && hasDistinctRatios(selectedAssets)
    && selectedAssets.every((asset) => asset.status === 'ready' && asset.playbackPolicy === 'public' && asset.playbackId);
  const libraryDndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const activeLibraryDragAsset = activeLibraryDrag ? assetsById.get(activeLibraryDrag.assetId) : undefined;
  const pendingDropAssets = pendingLibraryDrop ? [...new Map([...pendingLibraryDrop.sources, pendingLibraryDrop.target].map((asset) => [asset.id, asset])).values()] : [];
  const canCreateDroppedRatioGroup = pendingDropAssets.length >= 2
    && hasDistinctRatios(pendingDropAssets)
    && pendingDropAssets.every((asset) => asset.status === 'ready' && asset.playbackPolicy === 'public' && asset.playbackId);

  const tagsAsset = tagsAssetId ? assetsById.get(tagsAssetId) : undefined;
  const previewAsset = previewAssetId ? assetsById.get(previewAssetId) : undefined;
  const previewProject = previewProjectId ? projects.find((project) => project.id === previewProjectId) : undefined;
  const previewProjectVariants = (previewProject?.variants ?? []).flatMap((variant): SoloVideoVariant[] => {
    const asset = assetsById.get(variant.assetId);
    if (!asset || !canPreviewAsset(asset)) return [];
    return [{
      assetId: asset.id,
      label: variant.label || friendlyAssetRatio(asset),
      aspectRatio: asset.aspectRatio || variant.aspectRatio,
      playbackId: asset.playbackId,
      thumbnailUrl: asset.thumbnailUrl,
      duration: asset.duration,
      downloadsEnabled: asset.downloadsEnabled !== false,
      maxResolution: asset.maxResolution,
    }];
  });
  const closePreview = useCallback(() => {
    setPreviewAssetId('');
    setPreviewProjectId('');
  }, []);
  const selectingProject = selectingProjectId ? projects.find((project) => project.id === selectingProjectId) : undefined;
  const selectingProjectAssets = selectingProject?.variants.map((variant) => ({ variant, asset: assetsById.get(variant.assetId) })).filter((item): item is { variant: VideoProject['variants'][number]; asset: MatchedMuxLibraryAsset } => Boolean(item.asset)) ?? [];
  const selectingCollection = selectingCollectionId ? collections.find((collection) => collection.id === selectingCollectionId) : undefined;
  const selectingCollectionAssets = selectingCollection ? (assets ?? []).filter((asset) => projects.some((project) => project.collectionIds.includes(selectingCollection.id) && project.variants.some((variant) => variant.assetId === asset.id))) : [];
  const selectingGroupTitle = selectingProject?.title || selectingCollection?.name || '';
  const selectingGroupAssets = selectingProject ? selectingProjectAssets.map(({ asset }) => asset) : selectingCollectionAssets;
  const deleteAsset = deleteAssetId ? assetsById.get(deleteAssetId) : undefined;
  const tagsProject = projects.find((project) => project.id === tagsProjectId);
  const deleteProject = projects.find((project) => project.id === deleteProjectId);
  const deleteProjectAssets = deleteProject?.variants.map((variant) => assetsById.get(variant.assetId)).filter((asset): asset is MatchedMuxLibraryAsset => Boolean(asset)) ?? [];
  const knownTags = useMemo(() => Array.from(new Set([
    ...(assets ?? []).flatMap((asset) => asset.localTags),
    ...collections.flatMap((collection) => collection.tags ?? []),
  ])).sort((first, second) => first.localeCompare(second)), [assets, collections]);
  const managingCollection = collections.find((collection) => collection.id === managingCollectionId);
  const deleteCollection = collections.find((collection) => collection.id === deleteCollectionId);
  const managingCollectionAssets = useMemo(() => {
    if (!managingCollectionId) return [];
    const ids = new Set<string>();
    projects.forEach((project) => {
      if (project.collectionIds.includes(managingCollectionId)) project.variants.forEach((variant) => ids.add(variant.assetId));
    });
    return [...ids].map((id) => assetsById.get(id)).filter((asset): asset is MatchedMuxLibraryAsset => Boolean(asset));
  }, [assetsById, managingCollectionId, projects]);
  const managingCollectionProjects = useMemo(() => !managingCollectionId ? [] : projects.filter((project) => project.collectionIds.includes(managingCollectionId)).map((project) => ({ project, assets: project.variants.map((variant) => ({ variant, asset: assetsById.get(variant.assetId) })).filter((item): item is { variant: VideoProject['variants'][number]; asset: MatchedMuxLibraryAsset } => Boolean(item.asset)) })), [assetsById, managingCollectionId, projects]);
  useEffect(() => {
    if (!managingCollectionId) return;
    const headers = Array.from(document.querySelectorAll<HTMLElement>('.mux-collection-project > header'));
    const buttons = headers.flatMap((header, index) => {
      const project = managingCollectionProjects[index]?.project;
      if (!project || header.querySelector('.mux-ratio-group-pencil')) return [];
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'mux-title-pencil mux-ratio-group-pencil'; button.title = 'Edit ratio group title';
      button.setAttribute('aria-label', `Edit title for ${project.title}`); button.innerHTML = uiIconMarkup('edit');
      button.onclick = () => startRatioGroupTitleEdit(header, project);
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'mux-ratio-group-delete'; remove.title = 'Delete ratio group';
      remove.setAttribute('aria-label', `Delete ratio group ${project.title}`); remove.textContent = 'Delete group';
      remove.onclick = () => { setManagingCollectionId(''); setDeleteProjectId(project.id); };
      const title = header.querySelector('h4');
      title?.insertAdjacentElement('afterend', button);
      header.firstElementChild?.append(remove);
      return [button, remove];
    });
    return () => buttons.forEach((button) => button.remove());
  }, [managingCollectionId, managingCollectionProjects]);
  const deleteCollectionAssets = useMemo(() => {
    if (!deleteCollectionId) return [];
    const ids = new Set<string>();
    projects.filter((project) => project.collectionIds.includes(deleteCollectionId)).forEach((project) => project.variants.forEach((variant) => ids.add(variant.assetId)));
    return [...ids].map((id) => assetsById.get(id)).filter((asset): asset is MatchedMuxLibraryAsset => Boolean(asset));
  }, [assetsById, deleteCollectionId, projects]);

  function tagSuggestions(value: string) {
    const needle = currentTagNeedle(value);
    const selected = new Set(parseTags(value).map((tag) => tag.toLowerCase()));
    return knownTags.filter((tag) => !selected.has(tag.toLowerCase()) && (!needle || tag.toLowerCase().includes(needle))).slice(0, 8);
  }

  function publicPath(asset: MatchedMuxLibraryAsset) {
    return `${publicPageBase}/${projectByAssetId.get(asset.id)?.slug ?? asset.id}`;
  }

  function sharePath(asset: MatchedMuxLibraryAsset) {
    return `/watch/${projectByAssetId.get(asset.id)?.slug ?? asset.id}`;
  }

  async function copyPublicUrl(asset: MatchedMuxLibraryAsset) {
    const publicUrl = new URL(sharePath(asset), window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedAssetId(asset.id);
      setWorkspaceMessage(`Copied the public URL for “${asset.title}.”`);
      window.setTimeout(() => setCopiedAssetId((current) => current === asset.id ? '' : current), 1800);
    } catch {
      setWorkspaceMessage('That URL could not be copied. Open the public page and copy it from the address bar.');
    }
  }

  async function openDeckCardPicker(asset: MatchedMuxLibraryAsset) {
    const assetClient = asset.client?.trim();
    if (!assetClient) {
      setWorkspaceMessage('Assign this video to a client before posting it to The Deck.');
      return;
    }
    setDeckVideo(asset); setDeckCards([]); setSelectedDeckCardId(''); setDeckPostError(''); setLoadingDeckCards(true);
    try {
      const response = await fetch(`/api/internal/v1/cards?client=${encodeURIComponent(assetClient)}&limit=100`, { cache: 'no-store' });
      const payload = await jsonResponse<{ data?: DeckCardMatch[]; error?: { message?: string } }>(response);
      if (!response.ok) throw new Error(payload.error?.message || 'Unable to load matching Deck cards.');
      const normalizedClient = assetClient.toLocaleLowerCase();
      setDeckCards((payload.data ?? []).filter((card) => card.client.trim().toLocaleLowerCase() === normalizedClient));
    } catch (reason) {
      setDeckPostError(reason instanceof Error ? reason.message : 'Unable to load matching Deck cards.');
    } finally {
      setLoadingDeckCards(false);
    }
  }

  async function postVideoToDeckCard() {
    if (!deckVideo || !selectedDeckCardId) return;
    setPostingToDeck(true); setDeckPostError('');
    try {
      const project = projectByAssetId.get(deckVideo.id);
      const response = await fetch(`/api/admin/production-board/${encodeURIComponent(selectedDeckCardId)}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: [{
          type: 'mux-asset', assetId: deckVideo.id, itemKind: 'video', title: project?.title || deckVideo.title,
          client: project?.client || deckVideo.client, duration: deckVideo.duration, thumbnailUrl: deckVideo.thumbnailUrl,
          href: `/watch/${encodeURIComponent(project?.slug || deckVideo.id)}`,
          media: [{ id: deckVideo.id, title: project?.title || deckVideo.title, client: project?.client || deckVideo.client, thumbnailUrl: deckVideo.thumbnailUrl, playerUrl: deckVideo.playerUrl }],
          children: [{ text: '' }],
        }, { type: 'paragraph', children: [{ text: '' }] }] }),
      });
      const payload = await jsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || 'Unable to add this video as a Deck comment.');
      const card = deckCards.find((item) => item.id === selectedDeckCardId);
      setDeckVideo(null); setWorkspaceMessage(`Added “${deckVideo.title}” as a comment on “${card?.title || 'the Deck card'}”.`);
    } catch (reason) {
      setDeckPostError(reason instanceof Error ? reason.message : 'Unable to add this video as a Deck comment.');
    } finally {
      setPostingToDeck(false);
    }
  }

  async function copyShowcaseUrl() {
    if (!selectedIds.length) return;

    const showcaseIds = [...new Set(selectedIds.map((id) => projectByAssetId.get(id)?.slug ?? id))];
    const showcasePath = `/showcase?videos=${showcaseIds
      .map((id) => encodeURIComponent(id))
      .join(',')}`;
    const publicUrl = new URL(showcasePath, window.location.origin).toString();

    try {
      await navigator.clipboard.writeText(publicUrl);
      setShowcaseCopied(true);
      setWorkspaceMessage(
        `Copied a showcase link with ${selectedIds.length} ${selectedIds.length === 1 ? 'video' : 'videos'}.`,
      );
      window.setTimeout(() => setShowcaseCopied(false), 1800);
    } catch {
      setWorkspaceMessage('That showcase URL could not be copied.');
    }
  }

  async function copyCollectionUrl(collection: VideoProjectCollection) {
    const publicUrl = new URL(`/watch/collection/${collection.slug}`, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedCollectionId(collection.id);
      setWorkspaceMessage(`Copied the public URL for “${collection.name}.”`);
      window.setTimeout(() => setCopiedCollectionId((current) => current === collection.id ? '' : current), 1800);
    } catch {
      setWorkspaceMessage('That URL could not be copied. Open the collection and copy it from the address bar.');
    }
  }

  async function updateAssetMetadata(asset: MatchedMuxLibraryAsset, patch: { title?: string; tags?: string[]; status?: LibraryStatus }) {
    setSavingAssetId(asset.id);
    setWorkspaceMessage('');
    try {
      const response = await fetch('/api/admin/mux-assets/metadata', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: asset.id, ...patch }) });
      const payload = await jsonResponse<{ title?: string; tags?: string[]; status?: LibraryStatus; error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || 'Could not update that video.');
      setAssets((current) => current?.map((item) => item.id === asset.id ? {
        ...item,
        title: payload.title ?? item.title,
        localTags: payload.tags ?? item.localTags,
        libraryStatus: payload.status ?? item.libraryStatus,
      } : item) ?? null);
      return payload;
    } finally {
      setSavingAssetId('');
    }
  }

  async function saveTitle(event: FormEvent, asset: MatchedMuxLibraryAsset) {
    event.preventDefault();
    const title = titleDraft.trim();
    if (!title) return;
    try {
      await updateAssetMetadata(asset, { title });
      setEditingTitleId('');
      setWorkspaceMessage('Title updated.');
    } catch (reason) { setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not update that title.'); }
  }

  async function saveTags(event: FormEvent, asset: MatchedMuxLibraryAsset) {
    event.preventDefault();
    const tags = parseTags(tagsDraft);
    try {
      await updateAssetMetadata(asset, { tags });
      setTagsAssetId('');
      setWorkspaceMessage(`Updated tags for “${asset.title}.”`);
    } catch (reason) { setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not update those tags.'); }
  }

  async function saveCollectionTags(event: FormEvent) {
    event.preventDefault();
    if (!managingCollection) return;
    setSavingCollection(true);
    setWorkspaceMessage('');
    try {
      const response = await fetch('/api/admin/video-collections', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ collectionId: managingCollection.id, name: collectionNameDraft, tags: parseTags(collectionTagsDraft) }),
      });
      const payload = await jsonResponse<{ collection?: VideoProjectCollection; error?: string }>(response);
      if (!response.ok || !payload.collection) throw new Error(payload.error || 'Could not update collection tags.');
      const updated = payload.collection;
      setCollections((current) => current.map((item) => item.id === updated.id ? updated : item));
      setCollectionNameDraft(updated.name);
      setWorkspaceMessage(`Updated collection details for “${updated.name}.”`);
    } catch (reason) {
      setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not update collection tags.');
    } finally {
      setSavingCollection(false);
    }
  }

  async function deleteCollectionAndKeepVideos() {
    if (!deleteCollection) return;
    setSavingCollection(true); setWorkspaceMessage('');
    try {
      const response = await fetch('/api/admin/video-collections', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ collectionId: deleteCollection.id }) });
      const payload = await jsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || 'Could not delete this collection.');
      setCollections((current) => current.filter((collection) => collection.id !== deleteCollection.id));
      setProjects((current) => current.map((project) => ({ ...project, collectionIds: project.collectionIds.filter((collectionId) => collectionId !== deleteCollection.id) })));
      setDeleteCollectionId('');
      setWorkspaceMessage(`Deleted “${deleteCollection.name}.” Its videos remain in Mux.`);
    } catch (reason) { setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not delete this collection.'); }
    finally { setSavingCollection(false); }
  }

  async function deleteCollectionAndVideos() {
    if (!deleteCollection) return;
    setSavingCollection(true); setWorkspaceMessage('');
    try {
      const removeCollection = await fetch('/api/admin/video-collections', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ collectionId: deleteCollection.id }) });
      const collectionPayload = await jsonResponse<{ error?: string }>(removeCollection);
      if (!removeCollection.ok) throw new Error(collectionPayload.error || 'Could not delete this collection.');
      if (deleteCollectionAssets.length) {
        const removeAssets = await fetch('/api/admin/mux-assets/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetIds: deleteCollectionAssets.map((asset) => asset.id), detachFromPages: true }) });
        const assetPayload = await jsonResponse<{ deleted?: string[]; error?: string }>(removeAssets);
        if (!removeAssets.ok || !assetPayload.deleted) throw new Error(assetPayload.error || 'The collection was removed, but its videos could not be deleted.');
        const deleted = new Set(assetPayload.deleted);
        setAssets((current) => current?.filter((asset) => !deleted.has(asset.id)) ?? null);
      }
      setCollections((current) => current.filter((collection) => collection.id !== deleteCollection.id));
      setProjects((current) => current.filter((project) => !project.collectionIds.includes(deleteCollection.id)));
      setDeleteCollectionId('');
      setWorkspaceMessage(`Deleted “${deleteCollection.name}” and ${deleteCollectionAssets.length} ${deleteCollectionAssets.length === 1 ? 'video' : 'videos'} from Mux.`);
    } catch (reason) { setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not delete this collection and its videos.'); }
    finally { setSavingCollection(false); }
  }

  async function changeStatus(asset: MatchedMuxLibraryAsset, status: LibraryStatus) {
    try {
      await updateAssetMetadata(asset, { status });
      setWorkspaceMessage(`Moved “${asset.title}” to ${status}.`);
    } catch (reason) { setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not update that video.'); }
  }

  async function deleteOne(asset: MatchedMuxLibraryAsset) {
    setSavingAssetId(asset.id);
    setWorkspaceMessage('');
    try {
      const response = await fetch('/api/admin/mux-assets/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetIds: [asset.id], detachFromPages: true }) });
      const payload = await jsonResponse<{ deleted?: string[]; error?: string }>(response);
      if (!response.ok || !payload.deleted) throw new Error(payload.error || 'Could not delete that video.');
      setAssets((current) => current?.filter((item) => item.id !== asset.id) ?? null);
      setDeleteAssetId('');
      setWorkspaceMessage(`Deleted “${asset.title}” from Mux.`);
    } catch (reason) { setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not delete that video.'); }
    finally { setSavingAssetId(''); }
  }

  async function updateProjectAssets(project: VideoProject, projectAssets: MatchedMuxLibraryAsset[], patch: { tags?: string[]; status?: LibraryStatus }) {
    setSavingProjectId(project.id);
    setWorkspaceMessage('');
    try {
      const response = await fetch('/api/admin/mux-assets/metadata-batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetIds: projectAssets.map((asset) => asset.id), ...patch }) });
      const payload = await jsonResponse<{ error?: string }>(response); if (!response.ok) throw new Error(payload.error || 'Could not update every ratio version.');
      setAssets((current) => current?.map((asset) => projectAssets.some((item) => item.id === asset.id) ? {
        ...asset,
        localTags: patch.tags ?? asset.localTags,
        libraryStatus: patch.status ?? asset.libraryStatus,
      } : asset) ?? null);
      return true;
    } catch (reason) {
      setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not update this video.');
      return false;
    } finally {
      setSavingProjectId('');
    }
  }

  async function saveProjectTitle(event: FormEvent, project: VideoProject) {
    event.preventDefault();
    const title = projectTitleDraft.trim();
    if (!title) return;
    setSavingProjectId(project.id);
    setWorkspaceMessage('');
    try {
      const response = await fetch('/api/admin/video-projects', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: project.id, title }) });
      const payload = await jsonResponse<{ project?: VideoProject; error?: string }>(response);
      if (!response.ok || !payload.project) throw new Error(payload.error || 'Could not rename this ratio group.');
      setProjects((current) => current.map((item) => item.id === project.id ? payload.project! : item));
      setEditingProjectTitleId('');
      setWorkspaceMessage(`Renamed ratio group to “${payload.project.title}.”`);
    } catch (reason) { setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not rename this ratio group.'); }
    finally { setSavingProjectId(''); }
  }

  function startRatioGroupTitleEdit(header: HTMLElement, project: VideoProject) {
    const title = header.querySelector('h4');
    if (!title || header.querySelector('.mux-ratio-title-edit')) return;

    const pencil = header.querySelector<HTMLButtonElement>('.mux-ratio-group-pencil');
    const form = document.createElement('form');
    form.className = 'mux-title-edit mux-ratio-title-edit';
    const input = document.createElement('input');
    input.value = project.title;
    input.setAttribute('aria-label', `Title for ${project.title}`);
    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = 'Save';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    const restore = () => {
      form.replaceWith(title);
      pencil?.removeAttribute('hidden');
    };

    form.append(input, save, cancel);
    title.replaceWith(form);
    pencil?.setAttribute('hidden', '');
    cancel.onclick = restore;
    form.onsubmit = async (event) => {
      event.preventDefault();
      const nextTitle = input.value.trim();
      if (!nextTitle) return input.focus();
      if (nextTitle === project.title) return restore();
      save.disabled = true;
      cancel.disabled = true;
      save.textContent = 'Saving…';
      if (await renameRatioGroup(project, nextTitle)) {
        title.textContent = nextTitle;
        restore();
      } else {
        save.disabled = false;
        cancel.disabled = false;
        save.textContent = 'Save';
      }
    };
    input.focus();
    input.select();
  }

  async function renameRatioGroup(project: VideoProject, title: string) {
    if (!title || title === project.title) return false;
    setSavingProjectId(project.id);
    setWorkspaceMessage('');
    try {
      const response = await fetch('/api/admin/video-projects', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: project.id, title }) });
      const payload = await jsonResponse<{ project?: VideoProject; error?: string }>(response);
      if (!response.ok || !payload.project) throw new Error(payload.error || 'Could not rename this ratio group.');
      setProjects((current) => current.map((item) => item.id === project.id ? payload.project! : item));
      setWorkspaceMessage(`Renamed ratio group to “${payload.project.title}.”`);
      return true;
    } catch (reason) { setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not rename this ratio group.'); return false; }
    finally { setSavingProjectId(''); }
  }

  async function saveProjectTags(event: FormEvent) {
    event.preventDefault();
    if (!tagsProject) return;
    const projectAssets = tagsProject.variants.map((variant) => assetsById.get(variant.assetId)).filter((asset): asset is MatchedMuxLibraryAsset => Boolean(asset));
    if (await updateProjectAssets(tagsProject, projectAssets, { tags: parseTags(tagsDraft) })) {
      setTagsProjectId('');
      setWorkspaceMessage(`Updated tags for “${tagsProject.title}.”`);
    }
  }

  async function changeProjectStatus(project: VideoProject, projectAssets: MatchedMuxLibraryAsset[], status: LibraryStatus) {
    if (await updateProjectAssets(project, projectAssets, { status })) {
      setWorkspaceMessage(`Moved “${project.title}” to ${status}.`);
    }
  }

  async function changeCollectionStatus(collection: VideoProjectCollection, collectionAssets: MatchedMuxLibraryAsset[], status: LibraryStatus) {
    setSavingCollection(true);
    setWorkspaceMessage('');
    try {
      const response = await fetch('/api/admin/mux-assets/metadata-batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetIds: collectionAssets.map((asset) => asset.id), status }) });
      const payload = await jsonResponse<{ error?: string }>(response); if (!response.ok) throw new Error(payload.error || 'Could not update every video in this collection.');
      const collectionAssetIds = new Set(collectionAssets.map((asset) => asset.id));
      setAssets((current) => current?.map((asset) => collectionAssetIds.has(asset.id) ? { ...asset, libraryStatus: status } : asset) ?? null);
      setWorkspaceMessage(`Moved every video in “${collection.name}” to ${status}.`);
    } catch (reason) { setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not update this collection.'); }
    finally { setSavingCollection(false); }
  }

  async function deleteProjectAndAssets() {
    if (!deleteProject) return;
    setSavingProjectId(deleteProject.id);
    setWorkspaceMessage('');
    try {
      const removeProject = await fetch('/api/admin/video-projects', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: deleteProject.id }),
      });
      const projectPayload = await jsonResponse<{ error?: string }>(removeProject);
      if (!removeProject.ok) throw new Error(projectPayload.error || 'Could not remove this video page.');
      const removeAssets = await fetch('/api/admin/mux-assets/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetIds: deleteProjectAssets.map((asset) => asset.id) }),
      });
      const assetPayload = await jsonResponse<{ deleted?: string[]; error?: string }>(removeAssets);
      if (!removeAssets.ok || !assetPayload.deleted) throw new Error(assetPayload.error || 'The video page was removed, but its Mux files could not be deleted.');
      setProjects((current) => current.filter((project) => project.id !== deleteProject.id));
      setAssets((current) => current?.filter((asset) => !assetPayload.deleted?.includes(asset.id)) ?? null);
      setDeleteProjectId('');
      setWorkspaceMessage(`Deleted “${deleteProject.title}” and its ratio versions from Mux.`);
    } catch (reason) {
      setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not delete this video.');
    } finally {
      setSavingProjectId('');
    }
  }

  function toggleAsset(asset: MatchedMuxLibraryAsset) {
    if (!selectionMode) return;
    setWorkspaceMessage('');
    setSelectedIds((current) => current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id]);
    setVariantLabels((current) => ({ ...current, [asset.id]: current[asset.id] || ratioLabel(asset.aspectRatio) }));
    if (!projectTitle) setProjectTitle(asset.title);
    if (!projectClient && clientName(asset) !== 'Unassigned') setProjectClient(clientName(asset));
  }

  function selectAssetForBulk(asset: MatchedMuxLibraryAsset) {
    setSelectionMode(true);
    setWorkspaceMessage('');
    setSelectedIds((current) => current.includes(asset.id) ? current : [...current, asset.id]);
    setVariantLabels((current) => ({ ...current, [asset.id]: current[asset.id] || ratioLabel(asset.aspectRatio) }));
    if (!projectTitle) setProjectTitle(asset.title);
    if (!projectClient && clientName(asset) !== 'Unassigned') setProjectClient(clientName(asset));
  }

  function selectCollectionForBulk(collectionAssets: MatchedMuxLibraryAsset[]) {
    setSelectionMode(true);
    setWorkspaceMessage('');
    setSelectedIds((current) => [...new Set([...current, ...collectionAssets.map((asset) => asset.id)])]);
  }

  function selectProjectForBulk(project: VideoProject, projectAssets: MatchedMuxLibraryAsset[]) {
    setSelectionMode(true);
    setWorkspaceMessage('');
    setSelectedIds((current) => [...new Set([...current, ...projectAssets.map((asset) => asset.id)])]);
    setVariantLabels((current) => ({ ...current, ...Object.fromEntries(projectAssets.map((asset) => [asset.id, current[asset.id] || ratioLabel(asset.aspectRatio)])) }));
    if (!projectTitle) setProjectTitle(project.title);
    if (!projectClient && (project.client || clientName(projectAssets[0])) !== 'Unassigned') setProjectClient(project.client || clientName(projectAssets[0]));
  }

  async function createCollection(event: FormEvent) {
    event.preventDefault();
    setSaving('collection'); setWorkspaceMessage('');
    try {
      const response = await fetch('/api/admin/video-collections', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        name: collectionName,
        assetIds: selectedIds,
        clientsByAssetId: Object.fromEntries(selectedAssets.map((asset) => [asset.id, clientName(asset)])),
      }) });
      const payload = await jsonResponse<{ collection?: VideoProjectCollection; projects?: VideoProject[]; collections?: VideoProjectCollection[]; reused?: boolean; error?: string }>(response);
      if (!response.ok || !payload.collection || !payload.projects || !payload.collections) throw new Error(payload.error || 'Could not create the collection.');
      setProjects(payload.projects);
      setCollections(payload.collections);
      setCollectionName('');
      setSelectedIds([]);
      setBulkAction(null);
      setSelectionMode(false);
      setWorkspaceMessage(`${payload.reused ? 'Updated' : 'Created'} “${payload.collection.name}” with ${selectedIds.length} ${selectedIds.length === 1 ? 'video' : 'videos'}.`);
    } catch (reason) { setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not create the collection.'); }
    finally { setSaving(''); }
  }

  async function addToExistingCollection(event: FormEvent) {
    event.preventDefault();
    const collection = collections.find((item) => item.id === existingCollectionId);
    if (!collection) return;

    setSaving('collection');
    setWorkspaceMessage('');
    try {
      const response = await fetch('/api/admin/video-collections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          collectionId: collection.id,
          name: collection.name,
          assetIds: selectedIds,
          clientsByAssetId: Object.fromEntries(selectedAssets.map((asset) => [asset.id, clientName(asset)])),
        }),
      });
      const payload = await jsonResponse<{ collection?: VideoProjectCollection; projects?: VideoProject[]; collections?: VideoProjectCollection[]; error?: string }>(response);
      if (!response.ok || !payload.collection || !payload.projects || !payload.collections) throw new Error(payload.error || 'Could not add the videos to this collection.');
      setProjects(payload.projects);
      setCollections(payload.collections);
      setExistingCollectionId('');
      setSelectedIds([]);
      setBulkAction(null);
      setSelectionMode(false);
      setWorkspaceMessage(`Added ${selectedIds.length} ${selectedIds.length === 1 ? 'video' : 'videos'} to “${payload.collection.name}”.`);
    } catch (reason) {
      setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not add the videos to this collection.');
    } finally {
      setSaving('');
    }
  }

  async function createSelectedRatioGroup(event: FormEvent) {
    event.preventDefault();
    if (!canCreateRatioGroup) return;
    setSaving('project');
    setWorkspaceMessage('');
    try {
      const response = await fetch('/api/admin/video-projects', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: projectTitle, assetIds: selectedIds }),
      });
      const payload = await jsonResponse<{ project?: VideoProject; error?: string }>(response);
      if (!response.ok || !payload.project) throw new Error(payload.error || 'Could not create the ratio group.');
      await refreshLibrary();
      exitSelectionMode();
      setWorkspaceMessage(`Created “${payload.project.title}.”`);
    } catch (reason) {
      setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not create the ratio group.');
    } finally {
      setSaving('');
    }
  }

  async function addDroppedAssetsToCollection(sources: MatchedMuxLibraryAsset[], collection: VideoProjectCollection) {
    if (!sources.length) return;
    setLibraryDropSaving('add');
    setWorkspaceMessage('');
    try {
      const response = await fetch('/api/admin/video-collections', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ collectionId: collection.id, name: collection.name, assetIds: sources.map((asset) => asset.id), clientsByAssetId: Object.fromEntries(sources.map((asset) => [asset.id, clientName(asset)])) }),
      });
      const payload = await jsonResponse<{ collection?: VideoProjectCollection; projects?: VideoProject[]; collections?: VideoProjectCollection[]; error?: string }>(response);
      if (!response.ok || !payload.collection || !payload.projects || !payload.collections) throw new Error(payload.error || 'Could not add the video to this collection.');
      setProjects(payload.projects);
      setCollections(payload.collections);
      setWorkspaceMessage(`Added ${sources.length === 1 ? `“${sources[0].title}”` : `${sources.length} videos`} to “${payload.collection.name}”.`);
    } catch (reason) {
      setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not add the video to this collection.');
    } finally { setLibraryDropSaving(''); }
  }

  async function mergeDroppedCollectionIntoCollection(source: VideoProjectCollection, sources: MatchedMuxLibraryAsset[], destination: VideoProjectCollection) {
    if (!sources.length || source.id === destination.id) return;
    setLibraryDropSaving('add');
    setWorkspaceMessage('');
    try {
      const attach = await fetch('/api/admin/video-collections', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ collectionId: destination.id, name: destination.name, assetIds: sources.map((asset) => asset.id), clientsByAssetId: Object.fromEntries(sources.map((asset) => [asset.id, clientName(asset)])) }),
      });
      const attachPayload = await jsonResponse<{ error?: string }>(attach);
      if (!attach.ok) throw new Error(attachPayload.error || 'Could not add the collection videos.');

      const remove = await fetch('/api/admin/video-collections', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ collectionId: source.id }) });
      const removePayload = await jsonResponse<{ error?: string }>(remove);
      if (!remove.ok) throw new Error(removePayload.error || 'The videos were added, but the source collection could not be removed.');

      await refreshLibrary();
      setWorkspaceMessage(`Merged “${source.name}” into “${destination.name}”.`);
    } catch (reason) {
      setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not merge those collections.');
    } finally { setLibraryDropSaving(''); }
  }

  async function addDroppedAssetsToRatioGroup(sources: MatchedMuxLibraryAsset[], project: VideoProject) {
    if (!sources.length) return;
    const projectAssets = project.variants.map((variant) => assetsById.get(variant.assetId)).filter((asset): asset is MatchedMuxLibraryAsset => Boolean(asset));
    const groupAssets = [...new Map([...projectAssets, ...sources].map((asset) => [asset.id, asset])).values()];
    if (projectAssets.length !== project.variants.length || !hasDistinctRatios(groupAssets) || !groupAssets.every((asset) => asset.status === 'ready' && asset.playbackPolicy === 'public' && asset.playbackId)) {
      setWorkspaceMessage('That video must be ready, public, and use a new ratio before it can join this ratio group.');
      return;
    }
    setLibraryDropSaving('add');
    setWorkspaceMessage('');
    try {
      const response = await fetch('/api/admin/video-projects', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: project.title, assetIds: groupAssets.map((asset) => asset.id) }) });
      const payload = await jsonResponse<{ project?: VideoProject; error?: string }>(response);
      if (!response.ok || !payload.project) throw new Error(payload.error || 'Could not add the video to this ratio group.');
      await refreshLibrary();
      setWorkspaceMessage(`Added ${sources.length === 1 ? `“${sources[0].title}”` : `${sources.length} videos`} to “${payload.project.title}”.`);
    } catch (reason) {
      setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not add the video to this ratio group.');
    } finally { setLibraryDropSaving(''); }
  }

  async function createDroppedGroup(kind: 'collection' | 'ratio') {
    if (!pendingLibraryDrop || !droppedGroupTitle.trim()) return;
    const { sources, target } = pendingLibraryDrop;
    const groupedAssets = [...new Map([...sources, target].map((asset) => [asset.id, asset])).values()];
    const assetIds = groupedAssets.map((asset) => asset.id);
    setLibraryDropSaving(kind);
    setWorkspaceMessage('');
    try {
      if (kind === 'collection') {
        const response = await fetch('/api/admin/video-collections', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: droppedGroupTitle.trim(), assetIds, clientsByAssetId: Object.fromEntries(groupedAssets.map((asset) => [asset.id, clientName(asset)])) }) });
        const payload = await jsonResponse<{ collection?: VideoProjectCollection; projects?: VideoProject[]; collections?: VideoProjectCollection[]; error?: string }>(response);
        if (!response.ok || !payload.collection || !payload.projects || !payload.collections) throw new Error(payload.error || 'Could not create the collection.');
        setProjects(payload.projects); setCollections(payload.collections);
        setWorkspaceMessage(`Created “${payload.collection.name}”.`);
      } else {
        if (!canCreateDroppedRatioGroup) throw new Error('Both videos must be ready, public, and have different ratios to create a ratio group.');
        const response = await fetch('/api/admin/video-projects', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: droppedGroupTitle.trim(), assetIds }) });
        const payload = await jsonResponse<{ project?: VideoProject; error?: string }>(response);
        if (!response.ok || !payload.project) throw new Error(payload.error || 'Could not create the ratio group.');
        await refreshLibrary();
        setWorkspaceMessage(`Created “${payload.project.title}”.`);
      }
      setPendingLibraryDrop(null);
      setDroppedGroupTitle('');
    } catch (reason) {
      setWorkspaceMessage(reason instanceof Error ? reason.message : `Could not create the ${kind} group.`);
    } finally { setLibraryDropSaving(''); }
  }

  function handleLibraryDragEnd(event: DragEndEvent) {
    setActiveLibraryDrag(null);
    const sourceIds = event.active.data.current?.assetIds as string[] | undefined;
    const target = event.over?.data.current as LibraryDropTarget | undefined;
    const sourceTarget = event.active.data.current?.sourceTarget as LibraryDropTarget | undefined;
    const sources = (sourceIds ?? []).map((id) => assetsById.get(id)).filter((asset): asset is MatchedMuxLibraryAsset => Boolean(asset));
    if (!sources.length || !target) return;
    if (event.active.data.current?.selection) {
      const targetIds = target.kind === 'project' ? projects.find((p) => p.id === target.id)?.variants.map((v) => v.assetId) ?? [] : [target.id];
      const ids = target.kind === 'collection' ? sourceIds!.filter((id) => !projectByAssetId.get(id)?.collectionIds.includes(target.id)) : [...new Set([...sourceIds!, ...targetIds])];
      if (!ids.length || (target.kind !== 'collection' && targetIds.every((id) => sourceIds!.includes(id)))) return;
      openSelectionMove(target.kind === 'collection' ? target.id : 'new', ids); return;
    }
    if (sourceTarget?.kind === target.kind && sourceTarget.id === target.id) return;
    if (target.kind === 'collection') {
      const collection = collections.find((item) => item.id === target.id);
      const sourceCollection = sourceTarget?.kind === 'collection' ? collections.find((item) => item.id === sourceTarget.id) : undefined;
      if (collection && sourceCollection) void mergeDroppedCollectionIntoCollection(sourceCollection, sources, collection);
      else if (collection) void addDroppedAssetsToCollection(sources, collection);
      return;
    }
    if (target.kind === 'project') {
      const project = projects.find((item) => item.id === target.id);
      if (project) void addDroppedAssetsToRatioGroup(sources.filter((asset) => !project.variants.some((variant) => variant.assetId === asset.id)), project);
      return;
    }
    const targetAsset = assetsById.get(target.id);
    if (!targetAsset || sources.some((asset) => asset.id === targetAsset.id)) return;
    setDroppedGroupTitle(targetAsset.title);
    setPendingLibraryDrop({ sources, target: targetAsset });
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    setSaving('project'); setWorkspaceMessage('');
    try {
      const response = await fetch('/api/admin/video-projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: projectTitle, slug: videoProjectSlug(projectTitle), client: projectClient, description: projectDescription, collectionIds: projectCollectionIds, variants: selectedIds.map((assetId) => ({ assetId, label: variantLabels[assetId] })) }) });
      const payload = await jsonResponse<{ project?: VideoProject; error?: string }>(response);
      if (!response.ok || !payload.project) throw new Error(payload.error || 'Could not create the video page.');
      setProjects((current) => [payload.project!, ...current]);
      setSelectedIds([]); setVariantLabels({}); setProjectTitle(''); setProjectClient(''); setProjectDescription(''); setProjectCollectionIds([]);
      setBulkAction(null); setSelectionMode(false);
      setWorkspaceMessage(`Created “${payload.project.title}.”`);
    } catch (reason) { setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not create the video page.'); }
    finally { setSaving(''); }
  }

  async function assignClient(event: FormEvent) {
    event.preventDefault();
    setSaving('client'); setWorkspaceMessage('');
    try {
      const response = await fetch('/api/admin/mux-assets/client', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetIds: selectedIds, client: clientAssignment }) });
      const payload = await jsonResponse<{ assetIds?: string[]; client?: string; error?: string }>(response);
      if (!response.ok || !payload.assetIds || !payload.client) throw new Error(payload.error || 'Could not assign that client.');
      const updatedIds = new Set(payload.assetIds);
      setAssets((current) => current?.map((asset) => updatedIds.has(asset.id) ? { ...asset, client: payload.client! } : asset) ?? null);
      setProjectClient(payload.client);
      setClientAssignment(''); setBulkAction(null); setSelectedIds([]); setSelectionMode(false);
      setWorkspaceMessage(`Assigned ${payload.assetIds.length} ${payload.assetIds.length === 1 ? 'video' : 'videos'} to ${payload.client}.`);
    } catch (reason) { setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not assign that client.'); }
    finally { setSaving(''); }
  }

  function openClientAssignment(items: MatchedMuxLibraryAsset[]) {
    const existingClient = items.map(clientName).find((name) => name !== 'Unassigned') ?? '';
    setSelectedIds(items.map((item) => item.id));
    setClientAssignment(existingClient);
    setBulkAction('client');
  }

  async function deleteSelected() {
    setSaving('delete'); setWorkspaceMessage('');
    try {
      const response = await fetch('/api/admin/mux-assets/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetIds: selectedIds, detachFromPages: true }) });
      const payload = await jsonResponse<{ deleted?: string[]; error?: string }>(response);
      if (!response.ok || !payload.deleted) throw new Error(payload.error || 'Could not delete the selected videos.');
      const deleted = new Set(payload.deleted);
      setAssets((current) => current?.filter((asset) => !deleted.has(asset.id)) ?? null);
      setBulkAction(null); setSelectedIds([]); setSelectionMode(false);
      setWorkspaceMessage(`Deleted ${payload.deleted.length} ${payload.deleted.length === 1 ? 'video' : 'videos'} from Mux.`);
    } catch (reason) { setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not delete the selected videos.'); }
    finally { setSaving(''); }
  }

  async function detachSelectedFromPages() {
    setSaving('detach'); setWorkspaceMessage('');
    try {
      const response = await fetch('/api/admin/mux-assets/detach-pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetIds: selectedIds }) });
      const payload = await jsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || 'Could not remove these videos from their shareable pages.');
      setBulkAction(null); setSelectedIds([]); setSelectionMode(false);
      setWorkspaceMessage('Removed the selected videos from their shareable pages. The Mux files were kept.');
      await refreshLibrary();
    } catch (reason) { setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not remove these videos from their shareable pages.'); }
    finally { setSaving(''); }
  }

  function exitSelectionMode() {
    setSelectionMode(false); setSelectedIds([]); setVariantLabels({}); setBulkAction(null); setSelectingProjectId(''); setSelectingCollectionId('');
  }

  function openSelectionMove(destination: string, ids = selectedIds) {
    const sourceCollectionId = bulkAction === 'remove-collection' ? singleSourceCollection?.id : undefined;
    setMoveName(''); setMoveError(''); setBulkAction(null); setSelectionMove({ ids, destination, sourceCollectionId });
  }
  async function moveSelection(event: FormEvent) {
    event.preventDefault(); if (!selectionMove || movingSelection) return;
    setMovingSelection(true); setMoveError('');
    try {
      const response = await fetch('/api/admin/video-collections/move', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetIds: selectionMove.ids, destination: selectionMove.destination, sourceCollectionId: selectionMove.sourceCollectionId, name: moveName }) });
      const payload = await jsonResponse<{ projects: VideoProject[]; collections: VideoProjectCollection[]; error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || 'Unable to move videos.');
      setProjects(payload.projects); setCollections(payload.collections); setSelectionMove(null); exitSelectionMode(); setWorkspaceMessage('Videos moved successfully.');
    } catch (error) { setMoveError(error instanceof Error ? error.message : 'Unable to move videos.'); }
    finally { setMovingSelection(false); }
  }
  const selectionActions = <><button disabled={!selectedIds.length} onClick={() => void copyShowcaseUrl()}>{showcaseCopied ? 'Temp showcase copied' : 'Create temp showcase'}</button><button disabled={!selectedIds.length} onClick={() => openSelectionMove('new')}>Create collection</button><button disabled={!selectedIds.length || !collections.length} onClick={() => openSelectionMove('')}>Add to collection</button><button disabled={!canCreateRatioGroup} title={canCreateRatioGroup ? undefined : 'Select at least two ready videos with different aspect ratios'} onClick={() => { setProjectTitle(selectedAssets[0].title); setBulkAction('ratio'); }}>Create ratio group</button><button disabled={!selectedIds.length} onClick={() => { setClientAssignment(selectedAssets.map(clientName).find((name) => name !== 'Unassigned') || ''); setBulkAction('client'); }}>Add to client</button><button disabled={!selectedIds.length} onClick={() => setBulkAction('detach')}>Remove from pages</button><button className="danger" disabled={!selectedIds.length} onClick={() => setBulkAction('delete')}>Delete</button>{singleSourceCollection && <button onClick={() => setBulkAction('remove-collection')}>Remove from collection</button>}</>;
  const moveSources = selectionMove ? collections.filter((c) => c.id !== selectionMove.destination && projects.some((p) => p.collectionIds.includes(c.id) && p.variants.some((v) => selectionMove.ids.includes(v.assetId)))) : [];
  const emptiedSources = moveSources.filter((c) => projects.filter((p) => p.collectionIds.includes(c.id)).every((p) => p.variants.every((v) => selectionMove!.ids.includes(v.assetId))));
  const splittingRatioGroups = selectionMove && projects.some((p) => p.variants.length > 1
    && p.variants.some((v) => selectionMove.ids.includes(v.assetId))
    && (selectionMove.destination === 'solo' || p.variants.some((v) => !selectionMove.ids.includes(v.assetId))));
  const errorLogLink = <p><a href="https://dash.cloudflare.com/?to=/:account/workers-and-pages" target="_blank" rel="noopener noreferrer">Open Cloudflare to view error logs <UiIcon name="external" /></a><br /><small>Select trantergrey-site-git <UiIcon name="forward" /> current deployment <UiIcon name="forward" /> View details <UiIcon name="forward" /> Functions. Start live logs, then click Try again here to capture the error.</small></p>;

  if (error && !assets) return <div className="admin-empty" role="alert"><p>{error}</p><button type="button" disabled={refreshingLibrary} onClick={() => void refreshLibrary()}>{refreshingLibrary ? 'Retrying…' : 'Try again'}</button>{errorLogLink}</div>;
  if (!assets) return <p className="admin-empty">Reading the Mux library…</p>;

  const sharedMatchingCollections = collections.filter((collection) => collection.name.toLowerCase().includes(uploadCollectionName.trim().toLowerCase())).slice(0, 8);
  const sharedSuggestedTags = tagSuggestions(uploadTags);
  const ratioGroupByUploadId = new Map(uploadRatioGroups.flatMap((group) => group.uploadIds.map((uploadId) => [uploadId, group])));

  return <>
    {error && <div className="admin-empty" role="alert"><p>The library could not refresh. Showing the last loaded videos. {error}</p><button type="button" disabled={refreshingLibrary} onClick={() => void refreshLibrary()}>{refreshingLibrary ? 'Retrying…' : 'Try again'}</button>{errorLogLink}</div>}
    {workspaceMessage && <div className="mux-workspace-message" role="status" aria-live="polite">{workspaceMessage}</div>}
    {replacementProgress && <div className="mux-replacement-progress" role="status" aria-live="polite"><div><span>Replacing{replacementProgress.total > 1 ? ` ${replacementProgress.current} of ${replacementProgress.total}` : ''}</span><strong>{replacementProgress.stage === 'uploading' ? `${replacementProgress.progress}% uploaded` : replacementProgress.stage === 'processing' ? 'Mux is processing' : 'Updating video page'}</strong></div><p title={replacementProgress.fileName}>{replacementProgress.fileName}</p><i><i style={{ width: `${replacementProgress.progress}%` }} /></i></div>}
    <input ref={replaceInput} className="mux-upload-input" type="file" accept="video/*,.m4v,.mkv" onChange={(event) => { const file = event.target.files?.[0]; if (file && replaceTargetId) void replaceVideo(file, replaceTargetId); }} />
    <input ref={groupReplaceInput} className="mux-upload-input" type="file" accept="video/*,.m4v,.mkv" multiple onChange={(event) => { const project = projects.find((item) => item.id === replaceProjectId); if (!project) return; const projectAssets = project.variants.map((variant) => assetsById.get(variant.assetId)).filter((asset): asset is MatchedMuxLibraryAsset => Boolean(asset)); void replaceProjectVideos(Array.from(event.target.files ?? []), project, projectAssets); }} />
    <button className="mux-mobile-upload-trigger" type="button" onClick={() => uploadInput.current?.click()}>Upload videos</button>
    <section className={`mux-upload-zone${isDraggingUpload ? ' is-dragging' : ''}`} onDragEnter={(event) => { event.preventDefault(); setIsDraggingUpload(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDraggingUpload(false); }} onDrop={dropUpload}>
      <input ref={uploadInput} className="mux-upload-input" type="file" accept="video/*,.m4v,.mkv" multiple onChange={chooseUpload} />
      <div><p>Upload to Mux</p><h2>Drop videos here.</h2><span>Direct to Mux.</span></div>
      <button type="button" onClick={() => uploadInput.current?.click()}>Choose videos</button>
      {uploads.length > 0 && <div className="mux-upload-queue" aria-live="polite">{uploads.map((upload) => <div key={upload.id} className={upload.state}><span>{upload.name}</span><b>{upload.state === 'uploading' ? `${upload.progress}% uploaded` : upload.state === 'processing' ? upload.assetId ? 'Mux is preparing video · ready to save' : 'Mux is preparing video' : upload.state === 'complete' ? 'Ready to save' : 'Could not upload'}</b>{(upload.state === 'uploading' || upload.state === 'processing') && <i><i style={{ width: `${upload.progress}%` }} /></i>}{upload.error && <small>{upload.error}</small>}</div>)}</div>}
    </section>
    {!uploadDrawerOpen && uploads.length > 0 && <button type="button" onClick={() => setUploadDrawerOpen(true)}>Review unsaved upload details</button>}
    {uploadDrawerOpen && <aside className={`mux-upload-drawer${uploads.length >= 8 ? ' mux-upload-drawer-large' : uploads.length >= 4 ? ' mux-upload-drawer-wide' : ''}`} aria-label="Upload details">
      <header><div><p>Uploads in progress</p><h2>{uploads.length} {uploads.length === 1 ? 'video' : 'videos'}</h2></div><button type="button" onClick={() => setUploadDrawerOpen(false)} aria-label="Close upload details"><UiIcon name="close" /></button></header>
      <div className="mux-upload-drawer-body">
        <fieldset><legend>Where should these go?</legend><label><input type="radio" checked={uploadDestination === 'solo'} onChange={() => setUploadDestination('solo')} />Keep as solo videos</label><label><input type="radio" checked={uploadDestination === 'collection'} onChange={() => setUploadDestination('collection')} />Add to collection</label></fieldset>
        <section className="mux-upload-shared-details">
          {uploadDestination === 'collection' && <label className="mux-upload-client-picker"><span>Add to collection</span><input value={uploadCollectionName} onFocus={() => setCollectionPickerOpen(true)} onBlur={() => window.setTimeout(() => setCollectionPickerOpen(false), 150)} onChange={(event) => { setUploadCollectionName(event.target.value); setUploadCollectionId(''); setCollectionPickerOpen(true); }} placeholder="Search or add a collection" />{collectionPickerOpen && <div role="listbox">{sharedMatchingCollections.map((collection) => <button type="button" role="option" key={collection.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { setUploadCollectionName(collection.name); setUploadCollectionId(collection.id); setCollectionPickerOpen(false); }}>{collection.name}</button>)}{uploadCollectionName.trim() && !sharedMatchingCollections.some((collection) => collection.name.toLowerCase() === uploadCollectionName.trim().toLowerCase()) && <button type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => { setUploadCollectionId(''); setCollectionPickerOpen(false); }}>Create “{uploadCollectionName.trim()}”</button>}</div>}</label>}
          <fieldset className="mux-upload-ratio-option"><legend>Multiple ratios included?</legend><label className="mux-upload-ratio-toggle"><input type="checkbox" checked={uploadRatiosIncluded} onChange={(event) => { setUploadRatiosIncluded(event.target.checked); setSelectedUploadIds([]); }} /><span>Group selected uploads as ratio variations</span></label></fieldset>
          <div className="mux-upload-client-picker"><span>Client (applied when you save upload details)</span><ClientPicker value={uploadClient} clients={assignmentClients} onChange={setUploadClient} onClientsChanged={() => void refreshLibrary()} /></div>
          <label><span>Tags</span><input value={uploadTags} onFocus={() => setTagPickerUploadId('shared')} onBlur={() => window.setTimeout(() => setTagPickerUploadId((current) => current === 'shared' ? '' : current), 150)} onChange={(event) => { setUploadTags(event.target.value); setTagPickerUploadId('shared'); }} placeholder="Campaign, social" /></label>
          {tagPickerUploadId === 'shared' && <div className="mux-upload-tag-suggestions"><button className="mux-upload-tag-dismiss" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setTagPickerUploadId('')}>Done with tags <UiIcon name="close" /></button>{sharedSuggestedTags.map((tag) => <button type="button" key={tag} onMouseDown={(event) => event.preventDefault()} onClick={() => { setUploadTags((current) => acceptTag(current, tag)); setTagPickerUploadId('shared'); }}>{tag}</button>)}</div>}
        </section>
        {uploadRatiosIncluded && <section className="mux-upload-ratio-builder"><div><p>Ratio groups</p><span>Select related uploads below, then give the set one shared title.</span></div><div className="mux-upload-ratio-controls"><label><span>Shared title</span><input value={ratioGroupTitle} onChange={(event) => setRatioGroupTitle(event.target.value)} placeholder="Campaign video" /></label><button type="button" disabled={selectedUploadIds.length < 2} onClick={() => createRatioGroup(selectedUploadIds, ratioGroupTitle)}>Group selected</button></div>{uploadRatioGroups.length > 0 && <div className="mux-upload-ratio-groups">{uploadRatioGroups.map((group) => <div key={group.id}><strong>{group.title}</strong><span>{group.uploadIds.length} ratios</span><button type="button" onClick={() => removeRatioGroup(group.id)}>Remove</button></div>)}</div>}</section>}
        {uploads.map((upload) => {
          const ratioGroup = ratioGroupByUploadId.get(upload.id);
          const selectable = uploadRatiosIncluded && !ratioGroup;
          return <article className={`mux-upload-card${selectedUploadIds.includes(upload.id) ? ' selected' : ''}`} key={upload.id}>
            {selectable ? <button className="mux-upload-card-select" type="button" onClick={() => toggleUploadForRatioGroup(upload.id)} aria-pressed={selectedUploadIds.includes(upload.id)} aria-label={`${selectedUploadIds.includes(upload.id) ? 'Deselect' : 'Select'} ${upload.title}`}><div className="mux-upload-card-preview">{upload.assetId && assetsById.get(upload.assetId)?.thumbnailUrl && !upload.thumbnailFailed ? <img src={assetsById.get(upload.assetId)?.thumbnailUrl || ''} alt="" onError={() => updateUpload(upload.id, { thumbnailFailed: true })} /> : <span>{upload.state === 'uploading' ? `${upload.progress}%` : 'Mux preparing preview'}</span>}<i>{selectedUploadIds.includes(upload.id) ? <UiIcon name="check" /> : <UiIcon name="plus" />}</i></div></button> : <div className="mux-upload-card-preview">{upload.assetId && assetsById.get(upload.assetId)?.thumbnailUrl && !upload.thumbnailFailed ? <img src={assetsById.get(upload.assetId)?.thumbnailUrl || ''} alt="" onError={() => updateUpload(upload.id, { thumbnailFailed: true })} /> : <span>{upload.state === 'uploading' ? `${upload.progress}%` : 'Mux preparing preview'}</span>}</div>}
            {ratioGroup ? <p className="mux-upload-ratio-title">{ratioGroup.title} · ratio variation</p> : <label><span>Title</span><input value={upload.title} onChange={(event) => updateUpload(upload.id, { title: event.target.value })} /></label>}
            {(upload.state === 'uploading' || upload.state === 'processing') && <i className="mux-upload-card-progress"><i style={{ width: `${upload.progress}%` }} /></i>}
            {upload.error && <small role="alert">{upload.error}</small>}
          </article>;
        })}
      </div>
      <footer><button type="button" onClick={() => setUploadDrawerOpen(false)}>Keep browsing</button><button className="primary" type="button" disabled={savingUploadDetails || uploads.some((upload) => upload.state === 'uploading') || !uploads.some((upload) => upload.assetId)} onClick={requestSaveUploadDetails}>{savingUploadDetails ? 'Saving…' : 'Save upload details'}</button></footer>
    </aside>}
    {clientReminderOpen && <div className="client-reminder-modal" role="dialog" aria-modal="true" aria-labelledby="upload-client-reminder-title"><div className="client-reminder-panel"><p>One last detail</p><h2 id="upload-client-reminder-title">Leave this upload without a client?</h2><span>Adding a client now keeps this video easy to find later. You can still save it without one.</span><div className="client-reminder-picker"><ClientPicker value={uploadClient} clients={assignmentClients} onChange={setUploadClient} onClientsChanged={() => void refreshLibrary()} placeholder="Search or add a client" /></div><div className="client-reminder-actions"><button type="button" onClick={() => { setClientReminderOpen(false); void saveUploadDetails(); }}>Save without client</button><button className="primary" type="button" disabled={!uploadClient.trim()} onClick={() => { setClientReminderOpen(false); void saveUploadDetails(); }}>Save client</button></div></div></div>}
    {duplicateRatioWarning && <div className="mux-bulk-modal" role="dialog" aria-modal="true" onMouseDown={() => setDuplicateRatioWarning(null)}><div onMouseDown={(event) => event.stopPropagation()}><button className="mux-bulk-modal-close" type="button" onClick={() => setDuplicateRatioWarning(null)} aria-label="Close"><UiIcon name="close" /></button><div className="mux-bulk-delete"><p>Duplicate ratio</p><h3>Group these anyway?</h3><span>Two or more selected videos appear to share the same ratio. You can cancel and adjust the selection, or continue with this ratio group.</span><div className="mux-collection-delete-actions"><button type="button" onClick={() => setDuplicateRatioWarning(null)}>Cancel</button><button className="danger" type="button" onClick={() => createRatioGroup(duplicateRatioWarning.uploadIds, duplicateRatioWarning.title, true)}>Continue</button></div></div></div></div>}
    <div className="mux-library-toolbar">
      {combinedSearch ? <label className="mux-search"><span>Search titles or clients</span><input value={combinedSearchValue} onChange={(event) => updateCombinedSearch(event.target.value)} placeholder="Search a title or client" list="mux-library-search-suggestions" /><datalist id="mux-library-search-suggestions">{combinedSearchSuggestions.map((suggestion) => <option value={suggestion} key={suggestion} />)}</datalist></label> : <><label className="mux-search"><span>Search title, client, or Mux ID</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Mux" /></label><label className="mux-select"><span>Client</span><select value={client} onChange={(event) => setClient(event.target.value)}>{clients.map((item) => <option value={item} key={item}>{item === 'All' ? 'All clients' : item}</option>)}</select><ChevronDown className="mux-select-chevron" aria-hidden="true" /></label></>}
      <MuxDateFilter range={dateRange} years={dateYears} onChange={setDateRange} />
    </div>
    <div className="mux-library-subtoolbar">
      <div className="mux-filter-set mux-status-filter"><span>Status</span>{(['all', 'published', 'unreviewed', 'hidden'] as StatusFilter[]).map((item) => <button className={statusFilter === item ? 'active' : ''} onClick={() => setStatusFilter(item)} key={item}><span>{item === 'unreviewed' ? 'unpublished' : item}</span><b>{statusCounts[item].toLocaleString()}</b></button>)}</div>
      <div className="mux-filter-set"><span>Thumbnail</span><button className={thumbnailFilter === 'all' ? 'active' : ''} onClick={() => setThumbnailFilter('all')}><span>all</span></button><button className={thumbnailFilter === 'needs-thumbnail' ? 'active' : ''} onClick={() => setThumbnailFilter('needs-thumbnail')}><span>needs selection</span><b>{thumbnailCounts.needsThumbnail.toLocaleString()}</b></button><button className={thumbnailFilter === 'custom-thumbnail' ? 'active' : ''} onClick={() => setThumbnailFilter('custom-thumbnail')}><span>selected</span><b>{thumbnailCounts.customThumbnail.toLocaleString()}</b></button></div>
      <div className="mux-filter-set"><span>Index by</span>{(['date', 'client'] as GroupMode[]).map((item) => <button className={groupMode === item ? 'active' : ''} onClick={() => setGroupMode(item)} key={item}>{item === 'date' ? 'Timeline' : 'Client'}</button>)}</div>
      {hasFilters && <button className="mux-clear-filters" onClick={() => { setQuery(''); setClient('All'); setCombinedSearchValue(''); setStatusFilter('all'); setThumbnailFilter('all'); setDateRange(null); }}>Clear filters</button>}
      <div className="mux-library-actions"><MuxThemeToggle /><button className={`mux-selection-toggle${selectionMode ? ' active' : ''}`} onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}>{selectionMode ? 'Cancel selection' : 'Select videos'}</button></div>
    </div>
    <p className="mux-library-result-count"><strong>{resultTotal.toLocaleString()}</strong> of {statusCounts.all.toLocaleString()} assets</p>
    <DndContext sensors={libraryDndSensors} collisionDetection={pointerWithin} autoScroll={false} onDragStart={(event) => { const data = event.active.data.current; const assetId = String(data?.previewAssetId || ''); if (assetId) { beginLibraryDragPosition(event); setActiveLibraryDrag({ assetId, label: String(data?.dragLabel || '') }); } }} onDragMove={updateLibraryDragPosition} onDragCancel={() => setActiveLibraryDrag(null)} onDragEnd={handleLibraryDragEnd}>{selectionMode && <SelectionDrawer assets={selectedAssets} remove={(id) => setSelectedIds((ids) => ids.filter((item) => item !== id))} close={exitSelectionMode} actions={selectionActions} />}{!statusCounts.all ? <p className="admin-empty">No Mux assets were found in this environment.</p> : !matches.length ? <p className="admin-empty">No videos match those filters.</p> : <div className="mux-library-grid mux-library-flow">{groups.map((group) => group.items.map((item, index) => {
      const asset = item.kind === 'asset' ? item.asset : item.representative;
      const marker = index === 0 && <div className="mux-library-time-marker"><span>{groupMode === 'date' ? <><strong>{group.title}</strong><small>{group.eyebrow}</small></> : <strong>{group.title}</strong>}</span><i aria-hidden="true" /></div>;

      if (item.kind === 'collection') {
        const publicHref = `${publicPageBase}/collection/${item.collection.slug}`;
        const previews = [item.representative, ...item.assets.filter((preview) => preview.id !== item.representative.id)].slice(0, 3);
        const actionKey = `collection-${item.collection.id}`;
        if (selectionMode) return <div className="mux-library-flow-cell mux-library-collection-cell" key={`collection-${item.collection.id}`}>
          {marker}
          <MuxLibraryDndCard className="mux-collection-card" dropTarget={{ kind: 'collection', id: item.collection.id }}>
            <button className="mux-library-thumb mux-selectable-thumb mux-collection-stack mux-group-select-thumb" type="button" onClick={() => setSelectingCollectionId(item.collection.id)} aria-label={`Select videos from ${item.collection.name}`}>
              {previews.map((preview, previewIndex) => <span className={`mux-collection-stack-frame ${previewIndex === 0 ? 'front' : previewIndex === 1 ? 'middle' : 'back'}`} key={preview.id}>{preview.thumbnailUrl ? <img src={preview.thumbnailUrl} alt="" /> : <span>Preview unavailable</span>}</span>)}
              <span className="mux-group-selected-count">{item.assets.filter((asset) => selectedIds.includes(asset.id)).length} of {item.assets.length} selected</span><i>{item.assets.some((asset) => selectedIds.includes(asset.id)) ? <UiIcon name="check" /> : <UiIcon name="plus" />}</i>
            </button>
            <div className="mux-library-card-copy mux-collection-card-copy"><p>Collection · {item.assets.length} videos</p><h2>{item.collection.name}</h2></div>
          </MuxLibraryDndCard>
        </div>;
        return <div className={`mux-library-flow-cell mux-library-collection-cell${hoveredQuickActionsCard === actionKey ? ' quick-actions-hovered' : ''}${openMobileActions === actionKey ? ' quick-actions-open' : ''}`} key={`collection-${item.collection.id}`} onMouseEnter={() => setHoveredQuickActionsCard(actionKey)} onMouseLeave={() => setHoveredQuickActionsCard((current) => current === actionKey ? '' : current)}>
          {marker}
          <MuxLibraryDndCard className="mux-collection-card" draggableAssets={selectionMode ? undefined : item.assets} dragLabel={item.collection.name} dragEnabled={!mobileViewport} dropTarget={{ kind: 'collection', id: item.collection.id }}>
            <div className={`mux-library-thumb mux-library-thumb-with-actions mux-collection-stack${openMobileActions === actionKey ? ' mobile-actions-open' : ''}`}>
              <a className="mux-library-thumb-primary mux-collection-stack-primary" href={`/admin/mux/${item.representative.id}?collection=${encodeURIComponent(item.collection.id)}`} aria-label={`Manage ${item.collection.name}`}>
                {previews.map((preview, previewIndex) => <span className={`mux-collection-stack-frame ${previewIndex === 0 ? 'front' : previewIndex === 1 ? 'middle' : 'back'}`} key={preview.id}>{preview.thumbnailUrl ? <img src={preview.thumbnailUrl} alt="" /> : <span>Preview unavailable</span>}</span>)}
                <b>{item.assets.length} videos</b>
              </a>
              <MobileActionsToggle title={item.collection.name} expanded={openMobileActions === actionKey} onClick={() => setOpenMobileActions((current) => current === actionKey ? '' : actionKey)} />
              <div className="mux-library-hover-actions mux-collection-hover-actions" role="group" aria-label={`Actions for ${item.collection.name}`}>
                <a href={`/admin/mux/${item.representative.id}?collection=${encodeURIComponent(item.collection.id)}`}><QuickActionLabel icon="manage">Manage</QuickActionLabel></a>
                <a href={publicHref} target={publicLinksOpenInNewTab ? '_blank' : undefined} rel={publicLinksOpenInNewTab ? 'noreferrer' : undefined}><QuickActionLabel icon="public">Public page</QuickActionLabel></a>
                <button type="button" onClick={() => void openDeckCardPicker(item.representative)}><QuickActionLabel icon="manage">Add to Deck</QuickActionLabel></button>
                <button type="button" onClick={() => selectCollectionForBulk(item.assets)}><QuickActionLabel icon="select">Select</QuickActionLabel></button>
                <button type="button" onClick={() => void copyCollectionUrl(item.collection)}><QuickActionLabel icon="copy">{copiedCollectionId === item.collection.id ? 'Copied' : 'Copy URL'}</QuickActionLabel></button>
                <button type="button" onClick={() => openClientAssignment(item.assets)}><QuickActionLabel icon="client">{item.assets.some((asset) => clientName(asset) !== 'Unassigned') ? 'Change client' : 'Add client'}</QuickActionLabel></button>
                <button type="button" onClick={() => { setManagingCollectionId(item.collection.id); setCollectionNameDraft(item.collection.name); setCollectionTagsDraft((item.collection.tags ?? []).join(', ')) }}><QuickActionLabel icon="tags">Tags</QuickActionLabel></button>
                <button type="button" disabled={savingCollection} onClick={() => void changeCollectionStatus(item.collection, item.assets, item.assets.every((asset) => asset.libraryStatus === 'published') ? 'unreviewed' : 'published')}><QuickActionLabel icon="publish">{item.assets.every((asset) => asset.libraryStatus === 'published') ? 'Unpublish' : 'Publish'}</QuickActionLabel></button>
                <button type="button" disabled={savingCollection} onClick={() => void changeCollectionStatus(item.collection, item.assets, item.assets.every((asset) => asset.libraryStatus === 'hidden') ? 'unreviewed' : 'hidden')}><QuickActionLabel icon="hide">{item.assets.every((asset) => asset.libraryStatus === 'hidden') ? 'Unhide' : 'Hide'}</QuickActionLabel></button>
                <button className="danger" type="button" onClick={() => setDeleteCollectionId(item.collection.id)}><QuickActionLabel icon="delete">Delete</QuickActionLabel></button>
              </div>
            </div>
            <div className="mux-library-card-copy mux-collection-card-copy"><p>Collection · {item.assets.length} videos</p><h2><a href={publicHref} target={publicLinksOpenInNewTab ? '_blank' : undefined} rel={publicLinksOpenInNewTab ? 'noreferrer' : undefined}>{item.collection.name}</a></h2></div>
          </MuxLibraryDndCard>
        </div>;
      }

      if (item.kind === 'project') {
        const publicHref = `${publicPageBase}/${item.project.slug}`;
        const allPublished = item.assets.every((asset) => asset.libraryStatus === 'published');
        const allHidden = item.assets.every((asset) => asset.libraryStatus === 'hidden');
        const sharedTags = item.assets[0]?.localTags ?? [];
        const actionKey = `project-${item.project.id}`;
        return <div className={`mux-library-flow-cell${hoveredQuickActionsCard === actionKey ? ' quick-actions-hovered' : ''}${openMobileActions === actionKey ? ' quick-actions-open' : ''}`} key={`project-${item.project.id}`} onMouseEnter={() => setHoveredQuickActionsCard(actionKey)} onMouseLeave={() => setHoveredQuickActionsCard((current) => current === actionKey ? '' : current)}>
          {marker}
          <MuxLibraryDndCard draggableAssets={selectionMode ? undefined : item.assets} dragLabel={item.project.title} dragEnabled={!mobileViewport} dropTarget={{ kind: 'project', id: item.project.id }}>
            <div className={`mux-library-thumb mux-library-thumb-with-actions${openMobileActions === actionKey ? ' mobile-actions-open' : ''}`}>
              {selectionMode ? <button className="mux-library-thumb-primary mux-selectable-thumb mux-project-select-thumb" type="button" onClick={() => setSelectingProjectId(item.project.id)} aria-label={`Select ratios from ${item.project.title}`}>
                <LibraryThumbnail asset={item.representative} />
                <span className="mux-library-ratio-count">{item.assets.length} ratios</span>
                <b>{duration(item.representative.duration)}</b>
                <span className="mux-group-selected-count">{item.assets.filter((asset) => selectedIds.includes(asset.id)).length} of {item.assets.length} selected</span><i>{item.assets.some((asset) => selectedIds.includes(asset.id)) ? <UiIcon name="check" /> : <UiIcon name="plus" />}</i>
              </button> : <><a className="mux-library-thumb-primary" href={`/admin/mux/${item.representative.id}`} aria-label={`Manage ${item.project.title}`}>
                <LibraryThumbnail asset={item.representative} />
                <span className="mux-library-ratio-count">{item.assets.length} ratios</span>
                <b>{duration(item.representative.duration)}</b>
              </a>
              <MobileActionsToggle title={item.project.title} expanded={openMobileActions === actionKey} onClick={() => setOpenMobileActions((current) => current === actionKey ? '' : actionKey)} />
              <div className="mux-library-hover-actions" role="group" aria-label={`Actions for ${item.project.title}`}><button type="button" disabled={!item.assets.every(canPreviewAsset)} title={item.assets.every(canPreviewAsset) ? undefined : 'Mux is still preparing one or more video ratios.'} onClick={() => { setPreviewProjectId(item.project.id); setPreviewAssetId(item.representative.id); }}><QuickActionLabel icon="view">Play</QuickActionLabel></button><a href={`/admin/mux/${item.representative.id}`}><QuickActionLabel icon="manage">Manage</QuickActionLabel></a><a href={publicHref} target="_blank" rel="noreferrer"><QuickActionLabel icon="public">Public page</QuickActionLabel></a>{(item.project.client || item.representative.client)?.trim() && <button type="button" onClick={() => void openDeckCardPicker({ ...item.representative, client: item.project.client || item.representative.client })}><QuickActionLabel icon="manage">Add to Deck</QuickActionLabel></button>}<button type="button" onClick={() => selectProjectForBulk(item.project, item.assets)}><QuickActionLabel icon="select">Select</QuickActionLabel></button><button type="button" disabled={replacingProjectId === item.project.id} onClick={() => { setReplaceProjectId(item.project.id); groupReplaceInput.current?.click(); }}><QuickActionLabel icon="replace">{replacingProjectId === item.project.id ? 'Replacing…' : 'Replace videos'}</QuickActionLabel></button><button type="button" onClick={() => void copyPublicUrl(item.representative)}><QuickActionLabel icon="copy">{copiedAssetId === item.representative.id ? 'Copied' : 'Copy URL'}</QuickActionLabel></button><button type="button" onClick={() => openClientAssignment(item.assets)}><QuickActionLabel icon="client">{item.project.client || item.assets.some((asset) => clientName(asset) !== 'Unassigned') ? 'Change client' : 'Add client'}</QuickActionLabel></button><button type="button" onClick={() => { setTagsProjectId(item.project.id); setTagsDraft(sharedTags.join(', ')); }}><QuickActionLabel icon="tags">Tags</QuickActionLabel></button><button type="button" disabled={savingProjectId === item.project.id} onClick={() => void changeProjectStatus(item.project, item.assets, allPublished ? 'unreviewed' : 'published')}><QuickActionLabel icon="publish">{allPublished ? 'Unpublish' : 'Publish'}</QuickActionLabel></button><button type="button" disabled={savingProjectId === item.project.id} onClick={() => void changeProjectStatus(item.project, item.assets, allHidden ? 'unreviewed' : 'hidden')}><QuickActionLabel icon="hide">{allHidden ? 'Unhide' : 'Hide'}</QuickActionLabel></button><button type="button" className="danger" disabled={savingProjectId === item.project.id} onClick={() => setDeleteProjectId(item.project.id)}><QuickActionLabel icon="delete">Delete</QuickActionLabel></button></div></>}
            </div>
            <div className="mux-library-card-copy"><p className="mux-library-card-meta"><span>{item.project.client || clientName(item.representative)}{item.assets.some(hasMuxError) && <em> · Error</em>}</span><b>{publicationLabel(allPublished ? 'published' : 'unreviewed')}</b></p>{item.assets.some((projectAsset) => !projectAsset.hasCustomThumbnail) && <p className="mux-thumbnail-needed">{item.assets.filter((projectAsset) => !projectAsset.hasCustomThumbnail).length} need thumbnail</p>}<h2><a href={publicHref} target={publicLinksOpenInNewTab ? '_blank' : undefined} rel={publicLinksOpenInNewTab ? 'noreferrer' : undefined}>{item.project.title}</a></h2></div>
          </MuxLibraryDndCard>
        </div>;
      }

      const actionKey = `asset-${asset.id}`;
      return <div className={`mux-library-flow-cell${selectedIds.includes(asset.id) ? ' selected' : ''}${hoveredQuickActionsCard === actionKey ? ' quick-actions-hovered' : ''}${openMobileActions === actionKey ? ' quick-actions-open' : ''}`} key={asset.id} onMouseEnter={() => setHoveredQuickActionsCard(actionKey)} onMouseLeave={() => setHoveredQuickActionsCard((current) => current === actionKey ? '' : current)}>
          {marker}
          <MuxLibraryDndCard draggableAssets={selectionMode ? undefined : [asset]} dragEnabled={!mobileViewport} dropTarget={{ kind: 'asset', id: asset.id }}>
          {selectionMode ? <button className="mux-library-thumb mux-selectable-thumb" type="button" onClick={() => toggleAsset(asset)} aria-pressed={selectedIds.includes(asset.id)} aria-label={`${selectedIds.includes(asset.id) ? 'Deselect' : 'Select'} ${asset.title}`}>{asset.thumbnailUrl && !isProcessingAsset(asset) ? <LibraryThumbnail asset={asset} /> : <ThumbnailFallback />}<ProcessingOverlay asset={asset} /><b>{duration(asset.duration)}</b><i>{selectedIds.includes(asset.id) ? <UiIcon name="check" /> : <UiIcon name="plus" />}</i></button> : <div className={`mux-library-thumb mux-library-thumb-with-actions${openMobileActions === actionKey ? ' mobile-actions-open' : ''}`}><a className="mux-library-thumb-primary" href={`/admin/mux/${asset.id}`} aria-label={`Manage ${asset.title}`}>{asset.thumbnailUrl && !isProcessingAsset(asset) ? <LibraryThumbnail asset={asset} /> : <ThumbnailFallback />}<ProcessingOverlay asset={asset} /><b>{duration(asset.duration)}</b></a><MobileActionsToggle title={asset.title} expanded={openMobileActions === actionKey} onClick={() => setOpenMobileActions((current) => current === actionKey ? '' : actionKey)} /><div className="mux-library-hover-actions" role="group" aria-label={`Actions for ${asset.title}`}><button type="button" disabled={!canPreviewAsset(asset)} title={canPreviewAsset(asset) ? undefined : 'Mux is still preparing this video.'} onClick={() => setPreviewAssetId(asset.id)}><QuickActionLabel icon="view">View</QuickActionLabel></button><a href={`/admin/mux/${asset.id}`}><QuickActionLabel icon="manage">Manage</QuickActionLabel></a><a href={publicPath(asset)} target="_blank" rel="noreferrer"><QuickActionLabel icon="public">Public page</QuickActionLabel></a><button type="button" onClick={() => void openDeckCardPicker(asset)}><QuickActionLabel icon="manage">Add to Deck</QuickActionLabel></button><button type="button" onClick={() => selectAssetForBulk(asset)}><QuickActionLabel icon="select">Select</QuickActionLabel></button><button type="button" disabled={replacingAssetId === asset.id} onClick={() => { setReplaceTargetId(asset.id); replaceInput.current?.click(); }}><QuickActionLabel icon="replace">{replacingAssetId === asset.id ? 'Replacing…' : 'Replace video'}</QuickActionLabel></button><button type="button" onClick={() => void copyPublicUrl(asset)}><QuickActionLabel icon="copy">{copiedAssetId === asset.id ? 'Copied' : 'Copy URL'}</QuickActionLabel></button><button type="button" onClick={() => openClientAssignment([asset])}><QuickActionLabel icon="client">{clientName(asset) === 'Unassigned' ? 'Add client' : 'Change client'}</QuickActionLabel></button><button type="button" onClick={() => { setTagsAssetId(asset.id); setTagsDraft(asset.localTags.join(', ')); }}><QuickActionLabel icon="tags">Tags</QuickActionLabel></button><button type="button" disabled={savingAssetId === asset.id} onClick={() => void changeStatus(asset, asset.libraryStatus === 'published' ? 'unreviewed' : 'published')}><QuickActionLabel icon="publish">{asset.libraryStatus === 'published' ? 'Unpublish' : 'Publish'}</QuickActionLabel></button><button type="button" disabled={savingAssetId === asset.id} onClick={() => void changeStatus(asset, asset.libraryStatus === 'hidden' ? 'unreviewed' : 'hidden')}><QuickActionLabel icon="hide">{asset.libraryStatus === 'hidden' ? 'Unhide' : 'Hide'}</QuickActionLabel></button><button type="button" className="danger" disabled={savingAssetId === asset.id} onClick={() => setDeleteAssetId(asset.id)}><QuickActionLabel icon="delete">Delete</QuickActionLabel></button></div></div>}
          <div className="mux-library-card-copy"><p className="mux-library-card-meta"><span>{clientName(asset)}{hasMuxError(asset) && <em> · Error</em>}</span><b>{publicationLabel(asset.libraryStatus)}</b></p>{!asset.hasCustomThumbnail && <p className="mux-thumbnail-needed">Needs thumbnail</p>}{editingTitleId === asset.id ? <form className="mux-title-edit" onSubmit={(event) => void saveTitle(event, asset)}><input autoFocus value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} /><button type="submit" disabled={savingAssetId === asset.id}>{savingAssetId === asset.id ? 'Saving…' : 'Save'}</button><button type="button" onClick={() => setEditingTitleId('')}>Cancel</button></form> : <div className="mux-library-title-line"><h2><a href={`/admin/mux/${asset.id}`}>{asset.title}</a></h2><button type="button" className="mux-title-pencil" title="Edit title" aria-label={`Edit title for ${asset.title}`} onClick={() => { setEditingTitleId(asset.id); setTitleDraft(asset.title); }}><UiIcon name="edit" /></button></div>}</div>
          </MuxLibraryDndCard>
        </div>;
    }))}</div>}<DragOverlay dropAnimation={null}>{activeLibraryDragAsset && <div className="mux-library-drag-overlay"><span>{activeLibraryDragAsset.thumbnailUrl ? <img src={activeLibraryDragAsset.thumbnailUrl} alt="" /> : <ThumbnailFallback />}</span><strong>{activeLibraryDrag?.label || activeLibraryDragAsset.title}</strong></div>}</DragOverlay>{activeLibraryDrag && <div className="mux-drag-scroll-zones" aria-hidden="true"><div className="mux-drag-scroll-zone mux-drag-scroll-zone-up"><b><UiIcon name="up" /></b><span>Scroll up</span></div><div className="mux-drag-scroll-zone mux-drag-scroll-zone-down"><b><UiIcon name="down" /></b><span>Scroll down</span></div></div>}</DndContext>{hasMoreItems && <div ref={loadMoreSentinel} className="mux-library-scroll-sentinel" aria-live="polite">Loading more videos…</div>}
    {hasFilters && <div className="mux-drive-search">
      <a href={driveSearchUrl} target="_blank" rel="noreferrer">
        Search Google Drive <ExternalLink aria-hidden="true" />
      </a>
    </div>}
    {pendingLibraryDrop && <div className="mux-bulk-modal mux-drop-group-modal" role="dialog" aria-modal="true" aria-label="Create a video group" onMouseDown={() => !libraryDropSaving && setPendingLibraryDrop(null)}><div onMouseDown={(event) => event.stopPropagation()}><button className="mux-bulk-modal-close" type="button" onClick={() => setPendingLibraryDrop(null)} aria-label="Close"><UiIcon name="close" /></button><section className="mux-drop-group-dialog"><p>New group</p><h3>Group these videos?</h3><span>Choose how the dropped videos should be grouped.</span><label><span>Group title</span><input autoFocus required maxLength={160} value={droppedGroupTitle} disabled={Boolean(libraryDropSaving)} onChange={(event) => setDroppedGroupTitle(event.target.value)} /></label><ul>{pendingDropAssets.map((asset) => <li key={asset.id}>{asset.title} · {friendlyAssetRatio(asset)}</li>)}</ul><div className="mux-drop-group-actions"><button type="button" disabled={!droppedGroupTitle.trim() || Boolean(libraryDropSaving)} onClick={() => void createDroppedGroup('collection')}>{libraryDropSaving === 'collection' ? 'Creating…' : 'Create collection'}</button><button type="button" disabled={!droppedGroupTitle.trim() || !canCreateDroppedRatioGroup || Boolean(libraryDropSaving)} title={canCreateDroppedRatioGroup ? undefined : 'Videos must be ready, public, and have different ratios.'} onClick={() => void createDroppedGroup('ratio')}>{libraryDropSaving === 'ratio' ? 'Creating…' : 'Create ratio group'}</button></div></section></div></div>}
    {deckVideo && <div className="mux-bulk-modal" role="dialog" aria-modal="true" aria-label={`Add ${deckVideo.title} as a Deck comment`} onMouseDown={() => !postingToDeck && setDeckVideo(null)}><div onMouseDown={(event) => event.stopPropagation()}><button className="mux-bulk-modal-close" type="button" disabled={postingToDeck} onClick={() => setDeckVideo(null)} aria-label="Close"><UiIcon name="close" /></button><form className="mux-bulk-simple-form" onSubmit={(event) => { event.preventDefault(); void postVideoToDeckCard(); }}><p>Add video to The Deck</p><h3>{deckVideo.title}</h3><small>Showing cards for {deckVideo.client}.</small>{deckPostError && <small role="alert">{deckPostError}</small>}{loadingDeckCards ? <span>Loading matching cards…</span> : deckCards.length ? <label><span>Deck card</span><select autoFocus required value={selectedDeckCardId} onChange={(event) => setSelectedDeckCardId(event.target.value)} disabled={postingToDeck}><option value="">Choose a card</option>{deckCards.map((card) => <option key={card.id} value={card.id}>{card.title}</option>)}</select></label> : !deckPostError && <span>No Deck cards match this client.</span>}{deckCards.length > 0 && <button type="submit" disabled={!selectedDeckCardId || postingToDeck}>{postingToDeck ? 'Adding comment…' : 'Add video as comment'}</button>}</form></div></div>}
{previewAsset && previewProject && previewProjectVariants.length > 0 ? <VideoModal
      video={{ id: previewAsset.id, title: previewProject.title, client: previewProject.client || clientName(previewAsset), thumbnail: previewAsset.thumbnailUrl || '', muxPlaybackId: previewProjectVariants[0].playbackId }}
      onClose={closePreview}
    >
      <div className="video-ratio-preview">
        <SoloVideoPlayer key={previewProject.id} title={previewProject.title} variants={previewProjectVariants} standaloneHref={`/watch/${previewProject.slug}`} compact={compactPreviews} />
      </div>
    </VideoModal> : previewAsset && <div className="mux-player-modal" role="dialog" aria-modal="true" aria-label={`Preview ${previewAsset.title}`} onMouseDown={closePreview}><div className="mux-player-modal-panel" onMouseDown={(event) => event.stopPropagation()}><button className="mux-player-modal-close" type="button" aria-label="Close preview" onClick={closePreview}><svg viewBox="0 0 256 256" aria-hidden="true"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" /></svg></button>{previewAsset.playbackId && previewAsset.playbackPolicy === 'public' ? <MuxVideoPlayer key={previewAsset.id} assetId={previewAsset.id} playbackId={previewAsset.playbackId} poster={previewAsset.thumbnailUrl} title={previewProject?.title || previewAsset.title} autoPlay /> : <p>Preview unavailable while Mux finishes processing this asset.</p>}</div></div>}
      {selectingGroupTitle && <div className="mux-bulk-modal mux-group-selection-modal" role="dialog" aria-modal="true" aria-label={`Select videos from ${selectingGroupTitle}`} onMouseDown={() => { setSelectingProjectId(''); setSelectingCollectionId(''); }}><div onMouseDown={(event) => event.stopPropagation()}><button className="mux-bulk-modal-close" type="button" onClick={() => { setSelectingProjectId(''); setSelectingCollectionId(''); }} aria-label="Close"><UiIcon name="close" /></button><header><p>Select from group</p><h3>{selectingGroupTitle}</h3><span>{selectingGroupAssets.filter((asset) => selectedIds.includes(asset.id)).length} of {selectingGroupAssets.length} selected</span></header><div className="mux-group-selection-grid">{selectingGroupAssets.map((asset) => <button className={selectedIds.includes(asset.id) ? 'selected' : ''} type="button" key={asset.id} onClick={() => toggleAsset(asset)} aria-pressed={selectedIds.includes(asset.id)}><span>{asset.thumbnailUrl ? <img src={asset.thumbnailUrl} alt="" /> : <i>Preview unavailable</i>}<b>{duration(asset.duration)}</b><em>{selectedIds.includes(asset.id) ? <UiIcon name="check" /> : <UiIcon name="plus" />}</em></span><strong>{asset.title}</strong><small>{friendlyAssetRatio(asset)}</small></button>)}</div><footer><button type="button" onClick={() => { setSelectingProjectId(''); setSelectingCollectionId(''); }}>Done</button></footer></div></div>}
      {selectionMode && <div className="mux-selection-spacer" aria-hidden="true" />}
    {selectionMove && <div className="mux-bulk-modal" role="dialog" aria-modal="true" aria-label="Move selected videos"><div>
      <button type="button" className="mux-bulk-modal-close" disabled={movingSelection} onClick={() => setSelectionMove(null)} aria-label="Close"><UiIcon name="close" /></button>
      <form className="mux-bulk-simple-form" onSubmit={moveSelection}>
        <p>Move {selectionMove.ids.length} {selectionMove.ids.length === 1 ? 'video' : 'videos'}</p>
        <h3>{selectionMove.destination === 'solo' ? 'Separate as solo videos' : 'Choose their collection'}</h3>
        {selectionMove.destination !== 'solo' && <label><span>Destination</span>
          <select disabled={movingSelection} value={selectionMove.destination} required onChange={(e) => setSelectionMove({ ...selectionMove, destination: e.target.value })}>
            <option value="">Choose a collection</option><option value="new">Create new collection</option>
            {collections.filter((c) => c.id !== selectionMove.sourceCollectionId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>}
        {selectionMove.destination === 'new' && <label><span>Collection name</span><input autoFocus required maxLength={120} disabled={movingSelection} value={moveName} onChange={(e) => setMoveName(e.target.value)} /></label>}
        {moveSources.length > 0 && <small>These videos will leave: {moveSources.map((c) => c.name).join(', ')}.</small>}
        {emptiedSources.length > 0 && <small role="alert">{emptiedSources.map((c) => c.name).join(', ')} will be empty. {emptiedSources.length === 1 ? 'Its shared page will have no videos; the URL will be retained.' : 'Their shared pages will have no videos; the URLs will be retained.'}</small>}
        {splittingRatioGroups && <small>Moving part of a ratio group separates selected versions into individual pages. Remaining versions keep the group link. Separating a full group as solo videos keeps its link on the first version.</small>}
        {moveError && <p role="alert">{moveError}</p>}
        <button disabled={movingSelection || !selectionMove.destination}>{movingSelection ? 'Moving…' : 'Confirm move'}</button>
      </form>
    </div></div>}
    {bulkAction && <div className="mux-bulk-modal" role="dialog" aria-modal="true" onMouseDown={() => !saving && setBulkAction(null)}><div onMouseDown={(event) => event.stopPropagation()}>
      <button className="mux-bulk-modal-close" type="button" onClick={() => setBulkAction(null)} aria-label="Close"><UiIcon name="close" /></button>
      {bulkAction === 'remove-collection' && singleSourceCollection && <div className="mux-bulk-simple-form"><p>Remove from {singleSourceCollection.name}</p><h3>Where should these videos go?</h3>{[['new', 'Create new collection'], ['', 'Add to existing collection'], ['solo', 'Separate as solo videos']].map(([destination, label]) => <button key={label} type="button" onClick={() => openSelectionMove(destination)}>{label}</button>)}</div>}
      {bulkAction === 'project' && <form className="mux-project-builder" onSubmit={createProject}><div className="mux-builder-head"><div><p>New solo page</p><h3>{selectedAssets.length} {selectedAssets.length === 1 ? 'asset' : 'ratio variants'}</h3></div></div><div className="mux-builder-fields"><label><span>Title</span><input required value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} /></label><label><span>Client</span><input value={projectClient} onChange={(event) => setProjectClient(event.target.value)} /></label><label className="wide"><span>Short description (optional)</span><textarea value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} rows={2} /></label></div><div className="mux-builder-variants">{selectedAssets.map((asset) => <div key={asset.id}><img src={asset.thumbnailUrl || ''} alt="" /><span><strong>{asset.title}</strong><small>{asset.aspectRatio || 'Ratio unavailable'}</small></span><input value={variantLabels[asset.id] || ratioLabel(asset.aspectRatio)} onChange={(event) => setVariantLabels((current) => ({ ...current, [asset.id]: event.target.value }))} aria-label={`Label for ${asset.title}`} /></div>)}</div>{collections.length > 0 && <fieldset className="mux-builder-collections"><legend>Add to collections</legend>{collections.map((item) => <label key={item.id}><input type="checkbox" checked={projectCollectionIds.includes(item.id)} onChange={() => setProjectCollectionIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />{item.name}</label>)}</fieldset>}<div className="mux-builder-submit"><span>URL: /watch/{videoProjectSlug(projectTitle) || 'your-video'}</span><button type="submit" disabled={saving === 'project'}>{saving === 'project' ? 'Building page…' : 'Create video page'}</button></div></form>}
      {bulkAction === 'ratio' && <form className="mux-bulk-simple-form" onSubmit={createSelectedRatioGroup}>
        <p>New ratio group</p>
        <h3>{selectedAssets.length} ratio variants</h3>
        <label><span>Group title</span><input autoFocus required maxLength={160} value={projectTitle} disabled={saving === 'project'} onChange={(event) => setProjectTitle(event.target.value)} /></label>
        <ul>{selectedAssets.map((asset) => <li key={asset.id}>{asset.title} · {ratioLabel(asset.aspectRatio)}</li>)}</ul>
        <button type="submit" disabled={!canCreateRatioGroup || saving === 'project'}>{saving === 'project' ? 'Creating…' : 'Create ratio group'}</button>
      </form>}
      {bulkAction === 'collection' && <form className="mux-bulk-simple-form" onSubmit={createCollection}><p>New collection</p><h3>Group this campaign.</h3><label><span>Collection name</span><input autoFocus required value={collectionName} onChange={(event) => setCollectionName(event.target.value)} /></label><small>The selected videos will collapse into one stacked collection card with its own public page.</small><button type="submit" disabled={saving === 'collection'}>{saving === 'collection' ? 'Creating…' : 'Create collection'}</button></form>}
      {bulkAction === 'add-to-collection' && <form className="mux-bulk-simple-form" onSubmit={addToExistingCollection}><p>Add to collection</p><h3>{selectedIds.length} {selectedIds.length === 1 ? 'video' : 'videos'}</h3><label><span>Collection</span><select autoFocus required value={existingCollectionId} onChange={(event) => setExistingCollectionId(event.target.value)}><option value="">Choose a collection</option>{collections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><small>A solo video gets its own shareable page automatically. Selecting one video from a ratio group adds that group’s complete ratio set.</small><button type="submit" disabled={saving === 'collection' || !existingCollectionId}>{saving === 'collection' ? 'Adding…' : 'Add to collection'}</button></form>}
      {bulkAction === 'client' && <form className="mux-bulk-simple-form" onSubmit={assignClient}><p>Client assignment</p><h3>{selectedIds.length} {selectedIds.length === 1 ? 'video' : 'videos'}</h3><label><span>Client name</span><input autoFocus required value={clientAssignment} onChange={(event) => setClientAssignment(event.target.value)} list="mux-client-names" /></label><datalist id="mux-client-names">{assignmentClients.map((name) => <option value={name} key={name} />)}</datalist><button type="submit" disabled={saving === 'client'}>{saving === 'client' ? 'Assigning…' : 'Assign client'}</button></form>}
      {bulkAction === 'detach' && <div className="mux-bulk-delete"><p>Remove from pages</p><h3>Remove {selectedIds.length} {selectedIds.length === 1 ? 'video' : 'videos'}?</h3><span>The selected videos will be removed from their shareable pages but remain safely stored in Mux.</span><button type="button" disabled={saving === 'detach'} onClick={detachSelectedFromPages}>{saving === 'detach' ? 'Removing…' : 'Remove from shareable pages'}</button></div>}
      {bulkAction === 'delete' && <div className="mux-bulk-delete"><p>Permanent deletion</p><h3>Delete {selectedIds.length} {selectedIds.length === 1 ? 'video' : 'videos'}?</h3><span>Shareable pages using these videos will be cleaned up first, then the Mux files will be permanently deleted.</span><button type="button" disabled={saving === 'delete'} onClick={deleteSelected}>{saving === 'delete' ? 'Deleting…' : 'Delete videos and clean up pages'}</button></div>}
    </div></div>}
    {tagsAsset && <div className="mux-bulk-modal" role="dialog" aria-modal="true" onMouseDown={() => !savingAssetId && setTagsAssetId('')}><div onMouseDown={(event) => event.stopPropagation()}><button className="mux-bulk-modal-close" type="button" onClick={() => setTagsAssetId('')} aria-label="Close"><UiIcon name="close" /></button><form className="mux-bulk-simple-form" onSubmit={(event) => void saveTags(event, tagsAsset)}><p>Private tags</p><h3>{tagsAsset.title}</h3><label><span>Comma-separated tags</span><input autoFocus value={tagsDraft} onChange={(event) => setTagsDraft(event.target.value)} /></label>{tagSuggestions(tagsDraft).length > 0 && <div className="mux-tag-suggestions">{tagSuggestions(tagsDraft).map((tag) => <button type="button" key={tag} onClick={() => setTagsDraft((current) => acceptTag(current, tag))}>{tag}</button>)}</div>}<button type="submit" disabled={savingAssetId === tagsAsset.id}>{savingAssetId === tagsAsset.id ? 'Saving…' : 'Save tags'}</button></form></div></div>}
    {tagsProject && <div className="mux-bulk-modal" role="dialog" aria-modal="true" onMouseDown={() => !savingProjectId && setTagsProjectId('')}><div onMouseDown={(event) => event.stopPropagation()}><button className="mux-bulk-modal-close" type="button" onClick={() => setTagsProjectId('')} aria-label="Close"><UiIcon name="close" /></button><form className="mux-bulk-simple-form" onSubmit={(event) => void saveProjectTags(event)}><p>Private tags · shared by all ratios</p><h3>{tagsProject.title}</h3><label><span>Comma-separated tags</span><input autoFocus value={tagsDraft} onChange={(event) => setTagsDraft(event.target.value)} /></label>{tagSuggestions(tagsDraft).length > 0 && <div className="mux-tag-suggestions">{tagSuggestions(tagsDraft).map((tag) => <button type="button" key={tag} onClick={() => setTagsDraft((current) => acceptTag(current, tag))}>{tag}</button>)}</div>}<button type="submit" disabled={savingProjectId === tagsProject.id}>{savingProjectId === tagsProject.id ? 'Saving…' : 'Save tags'}</button></form></div></div>}
    {managingCollection && <div className="mux-bulk-modal mux-collection-manager-modal" role="dialog" aria-modal="true" onMouseDown={() => !savingCollection && setManagingCollectionId('')}><div onMouseDown={(event) => event.stopPropagation()}><button className="mux-bulk-modal-close" type="button" onClick={() => setManagingCollectionId('')} aria-label="Close"><UiIcon name="close" /></button><CollectionRatioManager key={managingCollection.id} collectionId={managingCollection.id} entries={managingCollectionProjects} videoCount={managingCollectionAssets.length} onDelete={() => { setManagingCollectionId(''); setDeleteCollectionId(managingCollection.id); }} onSaved={refreshLibrary} /><form className="mux-collection-tags-form" onSubmit={(event) => void saveCollectionTags(event)}><label><span>Collection name</span><input value={collectionNameDraft} onChange={(event) => setCollectionNameDraft(event.target.value)} /></label><label><span>Collection tags</span><input value={collectionTagsDraft} onFocus={() => setCollectionTagsFocused(true)} onBlur={() => window.setTimeout(() => setCollectionTagsFocused(false), 150)} onChange={(event) => setCollectionTagsDraft(event.target.value)} /></label><button type="submit" disabled={savingCollection}>{savingCollection ? 'Saving…' : 'Save collection'}</button>{collectionTagsFocused && tagSuggestions(collectionTagsDraft).length > 0 && <div className="mux-tag-suggestions">{tagSuggestions(collectionTagsDraft).map((tag) => <button type="button" key={tag} onMouseDown={(event) => event.preventDefault()} onClick={() => setCollectionTagsDraft((current) => acceptTag(current, tag))}>{tag}</button>)}</div>}</form><div className="mux-collection-manager-list">{managingCollectionProjects.map(({ project, assets: projectAssets }) => {
      const representative = projectAssets[0]?.asset;
      const allPublished = projectAssets.every(({ asset }) => asset.libraryStatus === 'published');
      const allHidden = projectAssets.every(({ asset }) => asset.libraryStatus === 'hidden');
      const sharedTags = projectAssets[0]?.asset.localTags ?? [];
      if (!representative) return null;
      return <section className={`mux-collection-project${projectAssets.length > 1 ? ' has-ratios' : ''}`} key={project.id}><header><div><p>{projectAssets.length > 1 ? 'Ratio group' : 'Video'}</p><h4>{project.title}</h4><span>{projectAssets.length > 1 ? `${projectAssets.length} ratio variations` : 'Single version'}</span></div></header><article className="mux-collection-manager-item mux-collection-project-summary"><a className="mux-collection-manager-thumb" href={`/admin/mux/${representative.id}`}>{representative.thumbnailUrl ? <img src={representative.thumbnailUrl} alt="" /> : <span>Preview unavailable</span>}<b>{duration(representative.duration)}</b></a><div className="mux-collection-manager-copy"><p>{project.client || clientName(representative)} · {allPublished ? 'published' : 'unreviewed'}</p><h4>{project.title}</h4><ul className="mux-collection-ratio-list">{projectAssets.map(({ asset, variant }) => <li key={asset.id}><a href={`/admin/mux/${asset.id}`}>{variant.label || friendlyAssetRatio(asset)}</a><span>{friendlyAssetRatio(asset)}</span></li>)}</ul></div><nav className="mux-collection-manager-actions"><a href={`/admin/mux/${representative.id}`}>Manage</a><a href={`/watch/${project.slug}`} target="_blank" rel="noreferrer">Public</a><button type="button" onClick={() => void copyPublicUrl(representative)}>Copy URL</button><button type="button" onClick={() => { setManagingCollectionId(''); setTagsProjectId(project.id); setTagsDraft(sharedTags.join(', ')); }}>Tags</button><button type="button" disabled={savingProjectId === project.id} onClick={() => void changeProjectStatus(project, projectAssets.map(({ asset }) => asset), allPublished ? 'unreviewed' : 'published')}>{allPublished ? 'Unpublish' : 'Publish'}</button><button type="button" disabled={savingProjectId === project.id} onClick={() => void changeProjectStatus(project, projectAssets.map(({ asset }) => asset), allHidden ? 'unreviewed' : 'hidden')}>{allHidden ? 'Unhide' : 'Hide'}</button><button className="danger" type="button" disabled={savingProjectId === project.id} onClick={() => { setManagingCollectionId(''); setDeleteProjectId(project.id); }}>Delete</button></nav></article></section>;
    })}</div></div></div>}
    {deleteCollection && <div className="mux-bulk-modal" role="dialog" aria-modal="true" onMouseDown={() => !savingCollection && setDeleteCollectionId('')}><div onMouseDown={(event) => event.stopPropagation()}><button className="mux-bulk-modal-close" type="button" onClick={() => setDeleteCollectionId('')} aria-label="Close"><UiIcon name="close" /></button><div className="mux-bulk-delete"><p>Delete collection</p><h3>Delete “{deleteCollection.name}”?</h3><span>Choose whether to keep its {deleteCollectionAssets.length} {deleteCollectionAssets.length === 1 ? 'video' : 'videos'} loose in the library or permanently delete them too.</span><div className="mux-collection-delete-actions"><button type="button" disabled={savingCollection} onClick={() => void deleteCollectionAndKeepVideos()}>{savingCollection ? 'Deleting…' : 'Keep videos in library'}</button><button className="danger" type="button" disabled={savingCollection} onClick={() => void deleteCollectionAndVideos()}>{savingCollection ? 'Deleting…' : 'Delete collection and videos'}</button></div></div></div></div>}
    {deleteAsset && <div className="mux-bulk-modal" role="dialog" aria-modal="true" onMouseDown={() => !savingAssetId && setDeleteAssetId('')}><div onMouseDown={(event) => event.stopPropagation()}><button className="mux-bulk-modal-close" type="button" onClick={() => setDeleteAssetId('')} aria-label="Close"><UiIcon name="close" /></button><div className="mux-bulk-delete"><p>Permanent deletion</p><h3>Delete “{deleteAsset.title}”?</h3><span>Any shareable page using this video will be cleaned up first, then its Mux file will be permanently deleted.</span><button type="button" disabled={savingAssetId === deleteAsset.id} onClick={() => void deleteOne(deleteAsset)}>{savingAssetId === deleteAsset.id ? 'Deleting…' : 'Delete video and clean up pages'}</button></div></div></div>}
    {deleteProject && <div className="mux-bulk-modal" role="dialog" aria-modal="true" onMouseDown={() => !savingProjectId && setDeleteProjectId('')}><div onMouseDown={(event) => event.stopPropagation()}><button className="mux-bulk-modal-close" type="button" onClick={() => setDeleteProjectId('')} aria-label="Close"><UiIcon name="close" /></button><div className="mux-bulk-delete"><p>Permanent deletion</p><h3>Delete “{deleteProject.title}”?</h3><span>This removes the single video page and all {deleteProjectAssets.length} ratio versions from Mux. This cannot be undone.</span><button type="button" disabled={savingProjectId === deleteProject.id} onClick={() => void deleteProjectAndAssets()}>{savingProjectId === deleteProject.id ? 'Deleting…' : 'Yes, delete permanently'}</button></div></div></div>}
  </>;
}
function SelectionDrawer({ assets, remove, close, actions }: { assets: MatchedMuxLibraryAsset[]; remove: (id: string) => void; close: () => void; actions: ReactNode }) {
  const drag = useDraggable({ id: 'selection-drawer', data: { selection: true, assetIds: assets.map((a) => a.id), previewAssetId: assets[0]?.id, dragLabel: assets.length + ' selected videos' }, disabled: !assets.length });
  return <aside className="mux-selection-drawer" ref={drag.setNodeRef} aria-label="Selected videos">
    <div className="mux-selection-content">
      <header>
        <button type="button" className="mux-selection-handle" disabled={!assets.length} ref={drag.setActivatorNodeRef} {...drag.attributes} {...drag.listeners}><UiIcon name="drag" />{assets.length} selected · Drag to group</button>
        <button type="button" className="mux-selection-mobile-close" onClick={close} aria-label="Clear selection"><UiIcon name="close" /></button>
      </header>
      {assets.length > 0 ? <div className="mux-selection-thumbnails">
        {assets.map((asset) => <button type="button" key={asset.id} onClick={() => remove(asset.id)} aria-label={'Deselect ' + asset.title} title={asset.title}>
          {asset.thumbnailUrl && <img src={asset.thumbnailUrl} alt="" />}<span>{asset.title}</span><b aria-hidden="true"><UiIcon name="close" /></b>
        </button>)}
      </div> : <p>Select videos to collect them here.</p>}
    </div>
    <details className="mux-selection-mobile-actions"><summary><ChevronDown aria-hidden="true" />Selection actions</summary><nav>{actions}</nav></details>
    <footer className="mux-bulk-bar mux-selection-toolbar">
      <div><strong>{assets.length}</strong><span>{assets.length === 1 ? 'video selected' : 'videos selected'}</span></div>
      <nav aria-label="Selection actions">{actions}</nav>
      <button type="button" className="mux-bulk-close" onClick={close} aria-label="Exit selection mode"><UiIcon name="close" /></button>
    </footer>
  </aside>;
}
