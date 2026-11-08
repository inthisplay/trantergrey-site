'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import type { MatchedMuxLibraryAsset } from '@/lib/mux-matching';
import { ratioLabel, videoProjectSlug, type VideoProject, type VideoProjectCollection } from '@/lib/video-projects-shared';

type LibraryStatus = MatchedMuxLibraryAsset['libraryStatus'];
type StatusFilter = LibraryStatus | 'all';
type GroupMode = 'date' | 'client';
type BulkAction = 'project' | 'collection' | 'client' | 'delete' | null;
type LibraryDisplayItem =
  | { kind: 'asset'; asset: MatchedMuxLibraryAsset }
  | { kind: 'collection'; collection: VideoProjectCollection; assets: MatchedMuxLibraryAsset[]; representative: MatchedMuxLibraryAsset }
  | { kind: 'project'; project: VideoProject; assets: MatchedMuxLibraryAsset[]; representative: MatchedMuxLibraryAsset };
type UploadState = { id: string; name: string; title: string; client: string; tags: string; variantLabel: string; assetId?: string; progress: number; state: 'uploading' | 'complete' | 'error'; error?: string; saving?: boolean; thumbnailFailed?: boolean };
type UploadGrouping = 'none' | 'collection' | 'existingCollection' | 'variants';
type UploadPlan = { client: string; tags: string[]; grouping: UploadGrouping; name: string; collectionId: string };

function duration(value: number) {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function clientName(asset: MatchedMuxLibraryAsset) {
  return asset.client?.trim() || 'Unassigned';
}

function publicationLabel(status: LibraryStatus) {
  return status === 'published' ? 'Published' : 'Unpublished';
}

function hasMuxError(asset: MatchedMuxLibraryAsset) {
  return /(?:error|fail)/i.test(asset.status);
}

function dateParts(createdAt: string | null) {
  if (!createdAt) return { key: 'undated', eyebrow: 'Date unavailable', title: 'Undated' };
  const dateOnly = createdAt.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month] = dateOnly;
    return {
      key: `${year}-${month}`,
      eyebrow: year,
      title: new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date(`${year}-${month}-15T12:00:00Z`)),
    };
  }
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return { key: 'undated', eyebrow: 'Date unavailable', title: 'Undated' };
  return {
    key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    eyebrow: String(date.getFullYear()),
    title: new Intl.DateTimeFormat('en', { month: 'long' }).format(date),
  };
}

function libraryDate(asset: MatchedMuxLibraryAsset) {
  return asset.historicCreatedAt || asset.createdAt;
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

export function MuxLibraryPanel() {
  const uploadInput = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<MatchedMuxLibraryAsset[] | null>(null);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [collections, setCollections] = useState<VideoProjectCollection[]>([]);
  const [query, setQuery] = useState('');
  const [client, setClient] = useState('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [groupMode, setGroupMode] = useState<GroupMode>('date');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkAction>(null);
  const [variantLabels, setVariantLabels] = useState<Record<string, string>>({});
  const [projectTitle, setProjectTitle] = useState('');
  const [projectClient, setProjectClient] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectCollectionIds, setProjectCollectionIds] = useState<string[]>([]);
  const [collectionName, setCollectionName] = useState('');
  const [clientAssignment, setClientAssignment] = useState('');
  const [saving, setSaving] = useState<'project' | 'collection' | 'client' | 'delete' | ''>('');
  const [workspaceMessage, setWorkspaceMessage] = useState('');
  const [copiedAssetId, setCopiedAssetId] = useState('');
  const [copiedCollectionId, setCopiedCollectionId] = useState('');
  const [showcaseCopied, setShowcaseCopied] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [tagsAssetId, setTagsAssetId] = useState('');
  const [tagsDraft, setTagsDraft] = useState('');
  const [tagsProjectId, setTagsProjectId] = useState('');
  const [managingCollectionId, setManagingCollectionId] = useState('');
  const [collectionTagsDraft, setCollectionTagsDraft] = useState('');
  const [savingCollection, setSavingCollection] = useState(false);
  const [deleteAssetId, setDeleteAssetId] = useState('');
  const [deleteProjectId, setDeleteProjectId] = useState('');
  const [savingAssetId, setSavingAssetId] = useState('');
  const [savingProjectId, setSavingProjectId] = useState('');
  const [error, setError] = useState('');
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [uploadDrawerOpen, setUploadDrawerOpen] = useState(false);
  const [uploadClient, setUploadClient] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadGrouping, setUploadGrouping] = useState<UploadGrouping>('none');
  const [uploadGroupName, setUploadGroupName] = useState('');
  const [uploadCollectionId, setUploadCollectionId] = useState('');
  const [startingUploads, setStartingUploads] = useState(false);
  const [clientPickerUploadId, setClientPickerUploadId] = useState('');
  const [tagPickerUploadId, setTagPickerUploadId] = useState('');
  const [savingUploadDetails, setSavingUploadDetails] = useState(false);

  async function refreshLibrary() {
    try {
      const response = await fetch('/api/mux/library', { cache: 'no-store' });
      if (response.status === 401) { window.location.replace('/login?next=/admin/mux'); return; }
      const payload = await jsonResponse<{ assets?: MatchedMuxLibraryAsset[]; projects?: VideoProject[]; collections?: VideoProjectCollection[]; error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || 'Unable to open the Mux library.');
      setAssets(payload.assets ?? []);
      setProjects(payload.projects ?? []);
      setCollections(payload.collections ?? []);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to open the Mux library.');
    }
  }

  useEffect(() => {
    void refreshLibrary();
  }, []);

  useEffect(() => {
    if (!workspaceMessage) return;
    const timeout = window.setTimeout(() => setWorkspaceMessage(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [workspaceMessage]);

  async function waitForMuxAsset(uploadId: string) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await fetch(`/api/admin/mux-uploads?uploadId=${encodeURIComponent(uploadId)}`, { cache: 'no-store' });
      const payload = await jsonResponse<{ assetId?: string | null; error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || 'Could not check the Mux upload.');
      if (payload.assetId) return payload.assetId;
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }
    throw new Error('Mux is still preparing this upload. Its client and tags will need to be added from the library.');
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
      const assetId = await waitForMuxAsset(payload.id);
      await saveUploadMetadata(assetId, plan);
      update({ assetId, progress: 100, state: 'complete' });
      window.setTimeout(() => void refreshLibrary(), 2500);
      return assetId;
    } catch (reason) {
      update({ state: 'error', error: reason instanceof Error ? reason.message : 'Could not upload that file.' });
      return null;
    }
  }

  function addFiles(files: FileList | File[]) {
    const videos = Array.from(files).filter((file) => file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name));
    if (!videos.length) { setWorkspaceMessage('Choose a video file to upload.'); return; }
    setUploads([]);
    setPendingUploadFiles(videos);
    setUploadGrouping('none');
    setUploadGroupName(uploadBaseTitle(videos[0].name));
    setUploadCollectionId('');
    setUploadClient('');
    setUploadTags('');
    setClientPickerUploadId('');
    setTagPickerUploadId('');
    setUploadDrawerOpen(true);
    const plan: UploadPlan = { client: '', tags: [], grouping: 'none', name: '', collectionId: '' };
    void Promise.all(videos.map((file) => uploadFile(file, plan))).then(() => void refreshLibrary());
  }

  function updateUpload(id: string, patch: Partial<UploadState>) {
    setUploads((current) => current.map((upload) => upload.id === id ? { ...upload, ...patch } : upload));
  }

  async function saveUploadDetails() {
    const readyUploads = uploads.filter((upload): upload is UploadState & { assetId: string } => Boolean(upload.assetId));
    if (!readyUploads.length || readyUploads.length !== uploads.length) {
      setWorkspaceMessage('Wait for every video to finish preparing in Mux before saving its details.');
      return;
    }
    if ((uploadGrouping === 'collection' || uploadGrouping === 'variants') && !uploadGroupName.trim()) {
      setWorkspaceMessage(uploadGrouping === 'variants' ? 'Give this video page a title.' : 'Give this collection a name.');
      return;
    }
    if (uploadGrouping === 'existingCollection' && !uploadCollectionId) {
      setWorkspaceMessage('Choose the collection to add these videos to.');
      return;
    }
    setSavingUploadDetails(true);
    setUploads((current) => current.map((upload) => ({ ...upload, saving: true, error: undefined })));
    try {
      const sharedDetails = uploadGrouping !== 'none';
      const responses = await Promise.all(readyUploads.flatMap((upload) => {
        const client = sharedDetails ? uploadClient.trim() : upload.client.trim();
        const tags = sharedDetails ? parseTags(uploadTags) : parseTags(upload.tags);
        return [
          ...(client ? [fetch('/api/admin/mux-assets/client', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetIds: [upload.assetId], client }) })] : []),
          fetch('/api/admin/mux-assets/metadata', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: upload.assetId, title: upload.title.trim() || upload.name.replace(/\.[^.]+$/, ''), tags }) }),
        ];
      }));
      const failed = responses.find((response) => !response.ok);
      if (failed) { const payload = await jsonResponse<{ error?: string }>(failed); throw new Error(payload.error || 'Could not save these video details.'); }
      await applyUploadGrouping(readyUploads, { client: uploadClient.trim(), tags: parseTags(uploadTags), grouping: uploadGrouping, name: uploadGroupName.trim(), collectionId: uploadCollectionId });
      setUploads((current) => current.map((upload) => ({ ...upload, saving: false })));
      setUploadDrawerOpen(false);
      setUploads([]);
      setPendingUploadFiles([]);
      setWorkspaceMessage(`Saved upload details for ${readyUploads.length} ${readyUploads.length === 1 ? 'video' : 'videos'}.`);
      await refreshLibrary();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not save these video details.';
      setUploads((current) => current.map((upload) => ({ ...upload, saving: false, error: message })));
      setWorkspaceMessage(message);
    } finally { setSavingUploadDetails(false); }
  }

  async function applyUploadGrouping(uploadsToGroup: Array<Pick<UploadState, 'assetId' | 'variantLabel'>>, plan: UploadPlan) {
    const assetIds = uploadsToGroup.map((upload) => upload.assetId).filter((assetId): assetId is string => Boolean(assetId));
    if (plan.grouping === 'none' || !assetIds.length) return;
    const existingCollection = plan.grouping === 'existingCollection' ? collections.find((collection) => collection.id === plan.collectionId) : undefined;
    if (plan.grouping === 'existingCollection' && !existingCollection) throw new Error('That collection could not be found. Choose it again and save.');
    const isCollection = plan.grouping === 'collection' || plan.grouping === 'existingCollection';
    const url = isCollection ? '/api/admin/video-collections' : '/api/admin/video-projects';
    const body = isCollection
      ? { name: existingCollection?.name || plan.name, assetIds, clientsByAssetId: Object.fromEntries(assetIds.map((assetId) => [assetId, plan.client])) }
      : { title: plan.name, slug: videoProjectSlug(plan.name), client: plan.client, collectionIds: plan.collectionId ? [plan.collectionId] : [], variants: uploadsToGroup.flatMap((upload) => upload.assetId ? [{ assetId: upload.assetId, label: upload.variantLabel }] : []) };
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (response.ok) return;
      await new Promise((resolve) => window.setTimeout(resolve, 3000));
    }
    throw new Error('Videos uploaded, but Mux is still preparing them. Create the group from Select videos once they are ready.');
  }

  async function startUploads() {
    const clientValue = uploadClient.trim();
    if (!clientValue) { setWorkspaceMessage('Choose or enter a client before uploading.'); return; }
    if ((uploadGrouping === 'collection' || uploadGrouping === 'variants') && !uploadGroupName.trim()) { setWorkspaceMessage('Give the new group a name.'); return; }
    if (uploadGrouping === 'existingCollection' && !uploadCollectionId) { setWorkspaceMessage('Choose a collection to add these videos to.'); return; }
    const plan: UploadPlan = { client: clientValue, tags: parseTags(uploadTags), grouping: uploadGrouping, name: uploadGroupName.trim(), collectionId: uploadCollectionId };
    setStartingUploads(true);
    setUploadDrawerOpen(false);
    const assetIds = (await Promise.all(pendingUploadFiles.map((file) => uploadFile(file, plan)))).filter((assetId): assetId is string => Boolean(assetId));
    try {
      await applyUploadGrouping(assetIds.map((assetId) => ({ assetId, variantLabel: '' })), plan);
      setWorkspaceMessage(`${assetIds.length} ${assetIds.length === 1 ? 'video was' : 'videos were'} sent to Mux${plan.grouping === 'none' ? '' : ' and grouped'}.`);
    } catch (reason) { setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not finish organizing the uploaded videos.'); }
    finally { setPendingUploadFiles([]); setStartingUploads(false); void refreshLibrary(); }
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

  const clients = useMemo(() => ['All', ...Array.from(new Set((assets ?? []).map(clientName))).sort()], [assets]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (assets ?? []).filter((asset) => {
      const searchable = [asset.title, asset.historicTitle, asset.historicFolderPath, asset.id, asset.externalId, asset.creatorId, asset.vimeoId, clientName(asset), ...asset.localTags, asset.vimeoMatch?.title, asset.vimeoSuggestion?.title].filter(Boolean).join(' ').toLowerCase();
      return (!needle || searchable.includes(needle))
        && (client === 'All' || clientName(asset) === client)
        && (statusFilter === 'all' || asset.libraryStatus === statusFilter);
    });
  }, [assets, query, client, statusFilter]);
  const statusCounts = useMemo(() => ({
    unreviewed: (assets ?? []).filter((asset) => asset.libraryStatus === 'unreviewed').length,
    published: (assets ?? []).filter((asset) => asset.libraryStatus === 'published').length,
    hidden: (assets ?? []).filter((asset) => asset.libraryStatus === 'hidden').length,
    all: (assets ?? []).length,
  }), [assets]);
  const hasFilters = Boolean(query.trim()) || client !== 'All' || statusFilter !== 'all';
  const assetsById = useMemo(() => new Map((assets ?? []).map((asset) => [asset.id, asset])), [assets]);
  const projectByAssetId = useMemo(() => {
    const map = new Map<string, VideoProject>();
    projects.forEach((project) => project.variants.forEach((variant) => map.set(variant.assetId, project)));
    return map;
  }, [projects]);
  const displayItems = useMemo<LibraryDisplayItem[]>(() => {
    if (selectionMode) return matches.map((asset) => ({ kind: 'asset', asset }));

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
    for (const item of displayItems) {
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
  const selectedAssets = selectedIds.map((id) => assetsById.get(id)).filter((asset): asset is MatchedMuxLibraryAsset => Boolean(asset));
  const tagsAsset = tagsAssetId ? assetsById.get(tagsAssetId) : undefined;
  const deleteAsset = deleteAssetId ? assetsById.get(deleteAssetId) : undefined;
  const tagsProject = projects.find((project) => project.id === tagsProjectId);
  const deleteProject = projects.find((project) => project.id === deleteProjectId);
  const deleteProjectAssets = deleteProject?.variants.map((variant) => assetsById.get(variant.assetId)).filter((asset): asset is MatchedMuxLibraryAsset => Boolean(asset)) ?? [];
  const knownTags = useMemo(() => Array.from(new Set([
    ...(assets ?? []).flatMap((asset) => asset.localTags),
    ...collections.flatMap((collection) => collection.tags ?? []),
  ])).sort((first, second) => first.localeCompare(second)), [assets, collections]);
  const managingCollection = collections.find((collection) => collection.id === managingCollectionId);
  const managingCollectionAssets = useMemo(() => {
    if (!managingCollectionId) return [];
    const ids = new Set<string>();
    projects.forEach((project) => {
      if (project.collectionIds.includes(managingCollectionId)) project.variants.forEach((variant) => ids.add(variant.assetId));
    });
    return [...ids].map((id) => assetsById.get(id)).filter((asset): asset is MatchedMuxLibraryAsset => Boolean(asset));
  }, [assetsById, managingCollectionId, projects]);

  function tagSuggestions(value: string) {
    const needle = currentTagNeedle(value);
    const selected = new Set(parseTags(value).map((tag) => tag.toLowerCase()));
    return knownTags.filter((tag) => !selected.has(tag.toLowerCase()) && (!needle || tag.toLowerCase().includes(needle))).slice(0, 8);
  }

  function publicPath(asset: MatchedMuxLibraryAsset) {
    return `/watch/${projectByAssetId.get(asset.id)?.slug ?? asset.id}`;
  }

  async function copyPublicUrl(asset: MatchedMuxLibraryAsset) {
    const publicUrl = new URL(publicPath(asset), window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedAssetId(asset.id);
      setWorkspaceMessage(`Copied the public URL for “${asset.title}.”`);
      window.setTimeout(() => setCopiedAssetId((current) => current === asset.id ? '' : current), 1800);
    } catch {
      setWorkspaceMessage('That URL could not be copied. Open the public page and copy it from the address bar.');
    }
  }

  async function copyShowcaseUrl() {
    if (!selectedIds.length) return;

    const showcasePath = `/showcase?videos=${selectedIds
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
        body: JSON.stringify({ collectionId: managingCollection.id, tags: parseTags(collectionTagsDraft) }),
      });
      const payload = await jsonResponse<{ collection?: VideoProjectCollection; error?: string }>(response);
      if (!response.ok || !payload.collection) throw new Error(payload.error || 'Could not update collection tags.');
      const updated = payload.collection;
      setCollections((current) => current.map((item) => item.id === updated.id ? updated : item));
      setWorkspaceMessage(`Updated tags for “${updated.name}.”`);
    } catch (reason) {
      setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not update collection tags.');
    } finally {
      setSavingCollection(false);
    }
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
      const response = await fetch('/api/admin/mux-assets/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetIds: [asset.id] }) });
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
      const responses = await Promise.all(projectAssets.map((asset) => fetch('/api/admin/mux-assets/metadata', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetId: asset.id, ...patch }),
      })));
      if (responses.some((response) => !response.ok)) throw new Error('Could not update every ratio version.');
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
      const response = await fetch('/api/admin/mux-assets/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetIds: selectedIds }) });
      const payload = await jsonResponse<{ deleted?: string[]; error?: string }>(response);
      if (!response.ok || !payload.deleted) throw new Error(payload.error || 'Could not delete the selected videos.');
      const deleted = new Set(payload.deleted);
      setAssets((current) => current?.filter((asset) => !deleted.has(asset.id)) ?? null);
      setBulkAction(null); setSelectedIds([]); setSelectionMode(false);
      setWorkspaceMessage(`Deleted ${payload.deleted.length} ${payload.deleted.length === 1 ? 'video' : 'videos'} from Mux.`);
    } catch (reason) { setWorkspaceMessage(reason instanceof Error ? reason.message : 'Could not delete the selected videos.'); }
    finally { setSaving(''); }
  }

  function exitSelectionMode() {
    setSelectionMode(false); setSelectedIds([]); setVariantLabels({}); setBulkAction(null);
  }

  if (error) return <p className="admin-empty">{error}</p>;
  if (!assets) return <p className="admin-empty">Reading the Mux library…</p>;

  const sharedMatchingClients = clients.filter((name) => name !== 'All' && name !== 'Unassigned' && name.toLowerCase().includes(uploadClient.trim().toLowerCase())).slice(0, 8);
  const sharedSuggestedTags = tagSuggestions(uploadTags);

  return <>
    {workspaceMessage && <div className="mux-workspace-message" role="status" aria-live="polite">{workspaceMessage}</div>}
    <section className={`mux-upload-zone${isDraggingUpload ? ' is-dragging' : ''}`} onDragEnter={(event) => { event.preventDefault(); setIsDraggingUpload(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDraggingUpload(false); }} onDrop={dropUpload}>
      <input ref={uploadInput} className="mux-upload-input" type="file" accept="video/*,.m4v,.mkv" multiple onChange={chooseUpload} />
      <div><p>Upload to Mux</p><h2>Drop videos here.</h2><span>Direct to Mux.</span></div>
      <button type="button" onClick={() => uploadInput.current?.click()}>Choose videos</button>
      {uploads.length > 0 && <div className="mux-upload-queue" aria-live="polite">{uploads.map((upload) => <div key={upload.id} className={upload.state}><span>{upload.name}</span><b>{upload.state === 'uploading' ? `${upload.progress}%` : upload.state === 'complete' ? 'Sent to Mux' : 'Could not upload'}</b>{upload.state === 'uploading' && <i><i style={{ width: `${upload.progress}%` }} /></i>}{upload.error && <small>{upload.error}</small>}</div>)}</div>}
    </section>
    {uploadDrawerOpen && <aside className="mux-upload-drawer" aria-label="Upload details">
      <header><div><p>Uploads in progress</p><h2>{uploads.length} {uploads.length === 1 ? 'video' : 'videos'}</h2></div><button type="button" onClick={() => setUploadDrawerOpen(false)} aria-label="Close upload details">×</button></header>
      <div className="mux-upload-drawer-body">
        <fieldset><legend>Organize this batch</legend><label><input type="radio" checked={uploadGrouping === 'none'} onChange={() => setUploadGrouping('none')} />Keep as solo videos</label><label><input type="radio" checked={uploadGrouping === 'collection'} onChange={() => setUploadGrouping('collection')} />Create a collection</label>{collections.length > 0 && <label><input type="radio" checked={uploadGrouping === 'existingCollection'} onChange={() => { setUploadGrouping('existingCollection'); setUploadCollectionId((current) => current || collections[0].id); }} />Add to an existing collection</label>}<label><input type="radio" checked={uploadGrouping === 'variants'} onChange={() => setUploadGrouping('variants')} />Group as Vert / Sqr / Horiz</label></fieldset>
        {uploadGrouping !== 'none' && <section className="mux-upload-shared-details">
          <p>{uploadGrouping === 'variants' ? 'One video page · shared details' : uploadGrouping === 'existingCollection' ? 'Existing collection · shared client and tags' : 'New collection · shared client and tags'}</p>
          {uploadGrouping === 'existingCollection' ? <label><span>Collection</span><select value={uploadCollectionId} onChange={(event) => setUploadCollectionId(event.target.value)}>{collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}</select></label> : <label><span>{uploadGrouping === 'variants' ? 'Video title' : 'Collection name'}</span><input value={uploadGroupName} onChange={(event) => setUploadGroupName(event.target.value)} placeholder={uploadGrouping === 'variants' ? 'Campaign video' : 'Collection name'} /></label>}
          <label className="mux-upload-client-picker"><span>Client</span><input value={uploadClient} onFocus={() => setClientPickerUploadId('shared')} onBlur={() => window.setTimeout(() => setClientPickerUploadId((current) => current === 'shared' ? '' : current), 150)} onChange={(event) => { setUploadClient(event.target.value); setClientPickerUploadId('shared'); }} placeholder="Search or add a client" />{clientPickerUploadId === 'shared' && <div role="listbox">{sharedMatchingClients.map((name) => <button type="button" role="option" key={name} onMouseDown={(event) => event.preventDefault()} onClick={() => { setUploadClient(name); setClientPickerUploadId(''); }}>{name}</button>)}{uploadClient.trim() && !sharedMatchingClients.some((name) => name.toLowerCase() === uploadClient.trim().toLowerCase()) && <button type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => setClientPickerUploadId('')}>Use “{uploadClient.trim()}” as a new client</button>}</div>}</label>
          <label><span>Tags</span><input value={uploadTags} onFocus={() => setTagPickerUploadId('shared')} onBlur={() => window.setTimeout(() => setTagPickerUploadId((current) => current === 'shared' ? '' : current), 150)} onChange={(event) => { setUploadTags(event.target.value); setTagPickerUploadId('shared'); }} placeholder="Campaign, social" /></label>
          {tagPickerUploadId === 'shared' && <div className="mux-upload-tag-suggestions"><button className="mux-upload-tag-dismiss" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setTagPickerUploadId('')}>Done with tags ×</button>{sharedSuggestedTags.map((tag) => <button type="button" key={tag} onMouseDown={(event) => event.preventDefault()} onClick={() => { setUploadTags((current) => acceptTag(current, tag)); setTagPickerUploadId('shared'); }}>{tag}</button>)}</div>}
        </section>}
        {uploads.map((upload) => {
          const matchingClients = clients.filter((name) => name !== 'All' && name !== 'Unassigned' && name.toLowerCase().includes(upload.client.trim().toLowerCase())).slice(0, 8);
          const suggestedTags = tagSuggestions(upload.tags);
          return <article className="mux-upload-card" key={upload.id}>
            <div className="mux-upload-card-preview">{upload.assetId && assetsById.get(upload.assetId)?.thumbnailUrl && !upload.thumbnailFailed ? <img src={assetsById.get(upload.assetId)?.thumbnailUrl || ''} alt="" onError={() => updateUpload(upload.id, { thumbnailFailed: true })} /> : <span>{upload.state === 'uploading' ? `${upload.progress}%` : 'Mux preparing preview'}</span>}</div>
            {uploadGrouping === 'variants' && <p className="mux-upload-source-title">{upload.title}</p>}
            {uploadGrouping !== 'variants' ? <label><span>Title</span><input value={upload.title} onChange={(event) => updateUpload(upload.id, { title: event.target.value })} /></label> : <label><span>Ratio version</span><select value={upload.variantLabel} onChange={(event) => updateUpload(upload.id, { variantLabel: event.target.value })}><option>Horiz</option><option>Sqr</option><option>Vert</option><option>Main</option></select></label>}
            {uploadGrouping === 'none' && <><label className="mux-upload-client-picker"><span>Client</span><input value={upload.client} onFocus={() => setClientPickerUploadId(upload.id)} onBlur={() => window.setTimeout(() => setClientPickerUploadId((current) => current === upload.id ? '' : current), 150)} onChange={(event) => { updateUpload(upload.id, { client: event.target.value }); setClientPickerUploadId(upload.id); }} placeholder="Search or add a client" />{clientPickerUploadId === upload.id && <div role="listbox">{matchingClients.map((name) => <button type="button" role="option" key={name} onMouseDown={(event) => event.preventDefault()} onClick={() => { updateUpload(upload.id, { client: name }); setClientPickerUploadId(''); }}>{name}</button>)}{upload.client.trim() && !matchingClients.some((name) => name.toLowerCase() === upload.client.trim().toLowerCase()) && <button type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => setClientPickerUploadId('')}>Use “{upload.client.trim()}” as a new client</button>}</div>}</label><label><span>Tags</span><input value={upload.tags} onFocus={() => setTagPickerUploadId(upload.id)} onBlur={() => window.setTimeout(() => setTagPickerUploadId((current) => current === upload.id ? '' : current), 150)} onChange={(event) => { updateUpload(upload.id, { tags: event.target.value }); setTagPickerUploadId(upload.id); }} placeholder="Campaign, social" /></label>{tagPickerUploadId === upload.id && suggestedTags.length > 0 && <div className="mux-upload-tag-suggestions"><button className="mux-upload-tag-dismiss" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setTagPickerUploadId('')}>Done with tags ×</button>{suggestedTags.map((tag) => <button type="button" key={tag} onMouseDown={(event) => event.preventDefault()} onClick={() => { updateUpload(upload.id, { tags: acceptTag(upload.tags, tag) }); setTagPickerUploadId(upload.id); }}>{tag}</button>)}</div>}</>}
            {upload.state === 'uploading' && <i className="mux-upload-card-progress"><i style={{ width: `${upload.progress}%` }} /></i>}
            {upload.error && <small>{upload.error}</small>}
          </article>;
        })}
      </div>
      <footer><button type="button" onClick={() => setUploadDrawerOpen(false)}>Keep browsing</button><button className="primary" type="button" disabled={savingUploadDetails || !uploads.length || uploads.some((upload) => !upload.assetId)} onClick={() => void saveUploadDetails()}>{savingUploadDetails ? 'Saving…' : 'Save upload details'}</button></footer>
    </aside>}
    <div className="mux-library-toolbar">
      <label className="mux-search"><span>Search title, client, or Mux ID</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Mux" /></label>
      <label className="mux-select"><span>Client</span><select value={client} onChange={(event) => setClient(event.target.value)}>{clients.map((item) => <option value={item} key={item}>{item === 'All' ? 'All clients' : item}</option>)}</select></label>
    </div>
    <div className="mux-library-subtoolbar">
      <div className="mux-filter-set mux-status-filter"><span>Status</span>{(['all', 'published', 'unreviewed', 'hidden'] as StatusFilter[]).map((item) => <button className={statusFilter === item ? 'active' : ''} onClick={() => setStatusFilter(item)} key={item}><span>{item === 'unreviewed' ? 'unpublished' : item}</span><b>{statusCounts[item].toLocaleString()}</b></button>)}</div>
      <div className="mux-filter-set"><span>Index by</span>{(['date', 'client'] as GroupMode[]).map((item) => <button className={groupMode === item ? 'active' : ''} onClick={() => setGroupMode(item)} key={item}>{item === 'date' ? 'Timeline' : 'Client'}</button>)}</div>
      {hasFilters && <button className="mux-clear-filters" onClick={() => { setQuery(''); setClient('All'); setStatusFilter('all'); }}>Clear filters</button>}
      <button className={`mux-selection-toggle${selectionMode ? ' active' : ''}`} onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}>{selectionMode ? 'Cancel selection' : 'Select videos'}</button>
    </div>
    <p className="mux-library-result-count"><strong>{matches.length.toLocaleString()}</strong> of {assets.length.toLocaleString()} assets</p>
    {!assets.length ? <p className="admin-empty">No Mux assets were found in this environment.</p> : !matches.length ? <p className="admin-empty">No videos match those filters.</p> : <div className="mux-library-grid mux-library-flow">{groups.map((group) => group.items.map((item, index) => {
      const asset = item.kind === 'asset' ? item.asset : item.representative;
      const marker = index === 0 && <div className="mux-library-time-marker"><span>{groupMode === 'date' ? <><strong>{group.title}</strong><small>{group.eyebrow}</small></> : <strong>{group.title}</strong>}</span><i aria-hidden="true" /></div>;

      if (item.kind === 'collection') {
        const publicHref = `/watch/collection/${item.collection.slug}`;
        const previews = [item.representative, ...item.assets.filter((preview) => preview.id !== item.representative.id)].slice(0, 3);
        return <div className="mux-library-flow-cell mux-library-collection-cell" key={`collection-${item.collection.id}`}>
          {marker}
          <article className="mux-collection-card">
            <div className="mux-library-thumb mux-library-thumb-with-actions mux-collection-stack">
              <a className="mux-library-thumb-primary mux-collection-stack-primary" href={publicHref} target="_blank" rel="noreferrer" aria-label={`Open ${item.collection.name}`}>
                {previews.map((preview, previewIndex) => <span className={`mux-collection-stack-frame ${previewIndex === 0 ? 'front' : previewIndex === 1 ? 'middle' : 'back'}`} key={preview.id}>{preview.thumbnailUrl ? <img src={preview.thumbnailUrl} alt="" /> : <span>Preview unavailable</span>}</span>)}
                <b>{item.assets.length} videos</b>
              </a>
              <div className="mux-library-hover-actions mux-collection-hover-actions" role="group" aria-label={`Actions for ${item.collection.name}`}><button type="button" onClick={() => { setManagingCollectionId(item.collection.id); setCollectionTagsDraft((item.collection.tags ?? []).join(', ')) }}>Manage</button><a href={publicHref} target="_blank" rel="noreferrer">Public page</a><button type="button" onClick={() => void copyCollectionUrl(item.collection)}>{copiedCollectionId === item.collection.id ? 'Copied' : 'Copy URL'}</button></div>
            </div>
            <div className="mux-library-card-copy mux-collection-card-copy"><p>Collection · {item.assets.length} videos</p><h2><a href={publicHref} target="_blank" rel="noreferrer">{item.collection.name}</a></h2></div>
          </article>
        </div>;
      }

      if (item.kind === 'project') {
        const publicHref = `/watch/${item.project.slug}`;
        const allPublished = item.assets.every((asset) => asset.libraryStatus === 'published');
        const allHidden = item.assets.every((asset) => asset.libraryStatus === 'hidden');
        const sharedTags = item.assets[0]?.localTags ?? [];
        return <div className="mux-library-flow-cell" key={`project-${item.project.id}`}>
          {marker}
          <article>
            <div className="mux-library-thumb mux-library-thumb-with-actions">
              <a className="mux-library-thumb-primary" href={`/admin/mux/${item.representative.id}`} aria-label={`Manage ${item.project.title}`}>
                {item.representative.thumbnailUrl ? <img src={item.representative.thumbnailUrl} alt="" /> : <span>Preview unavailable</span>}
                <span className="mux-library-ratio-count">{item.assets.length} ratios</span>
                <b>{duration(item.representative.duration)}</b>
              </a>
              <div className="mux-library-hover-actions" role="group" aria-label={`Actions for ${item.project.title}`}><a href={`/admin/mux/${item.representative.id}`}>Manage</a><a href={publicHref} target="_blank" rel="noreferrer">Public page</a><button type="button" onClick={() => void copyPublicUrl(item.representative)}>{copiedAssetId === item.representative.id ? 'Copied' : 'Copy URL'}</button><button type="button" onClick={() => openClientAssignment(item.assets)}>Add client</button><button type="button" onClick={() => { setTagsProjectId(item.project.id); setTagsDraft(sharedTags.join(', ')); }}>Tags</button><button type="button" disabled={savingProjectId === item.project.id} onClick={() => void changeProjectStatus(item.project, item.assets, allPublished ? 'unreviewed' : 'published')}>{allPublished ? 'Unpublish' : 'Publish'}</button><button type="button" disabled={savingProjectId === item.project.id} onClick={() => void changeProjectStatus(item.project, item.assets, allHidden ? 'unreviewed' : 'hidden')}>{allHidden ? 'Unhide' : 'Hide'}</button><button type="button" className="danger" disabled={savingProjectId === item.project.id} onClick={() => setDeleteProjectId(item.project.id)}>Delete</button></div>
            </div>
            <div className="mux-library-card-copy"><p className="mux-library-card-meta"><span>{item.project.client || clientName(item.representative)}{item.assets.some(hasMuxError) && <em> · Error</em>}</span><b>{publicationLabel(allPublished ? 'published' : 'unreviewed')}</b></p><h2><a href={publicHref} target="_blank" rel="noreferrer">{item.project.title}</a></h2></div>
          </article>
        </div>;
      }

      return <div className={`mux-library-flow-cell${selectedIds.includes(asset.id) ? ' selected' : ''}`} key={asset.id}>
          {marker}
          <article>
          {selectionMode ? <button className="mux-library-thumb mux-selectable-thumb" type="button" onClick={() => toggleAsset(asset)} aria-pressed={selectedIds.includes(asset.id)} aria-label={`${selectedIds.includes(asset.id) ? 'Deselect' : 'Select'} ${asset.title}`}>{asset.thumbnailUrl ? <img src={asset.thumbnailUrl} alt="" /> : <span>Preview unavailable</span>}<b>{duration(asset.duration)}</b><i>{selectedIds.includes(asset.id) ? '✓' : '+'}</i></button> : <div className="mux-library-thumb mux-library-thumb-with-actions"><a className="mux-library-thumb-primary" href={`/admin/mux/${asset.id}`} aria-label={`Manage ${asset.title}`}>{asset.thumbnailUrl ? <img src={asset.thumbnailUrl} alt="" /> : <span>Preview unavailable</span>}<b>{duration(asset.duration)}</b></a><div className="mux-library-hover-actions" role="group" aria-label={`Actions for ${asset.title}`}><a href={`/admin/mux/${asset.id}`}>Manage</a><a href={publicPath(asset)} target="_blank" rel="noreferrer">Public page</a><button type="button" onClick={() => void copyPublicUrl(asset)}>{copiedAssetId === asset.id ? 'Copied' : 'Copy URL'}</button><button type="button" onClick={() => openClientAssignment([asset])}>Add client</button><button type="button" onClick={() => { setTagsAssetId(asset.id); setTagsDraft(asset.localTags.join(', ')); }}>Tags</button><button type="button" disabled={savingAssetId === asset.id} onClick={() => void changeStatus(asset, asset.libraryStatus === 'published' ? 'unreviewed' : 'published')}>{asset.libraryStatus === 'published' ? 'Unpublish' : 'Publish'}</button><button type="button" disabled={savingAssetId === asset.id} onClick={() => void changeStatus(asset, asset.libraryStatus === 'hidden' ? 'unreviewed' : 'hidden')}>{asset.libraryStatus === 'hidden' ? 'Unhide' : 'Hide'}</button><button type="button" className="danger" disabled={savingAssetId === asset.id} onClick={() => setDeleteAssetId(asset.id)}>Delete</button></div></div>}
          <div className="mux-library-card-copy"><p className="mux-library-card-meta"><span>{clientName(asset)}{hasMuxError(asset) && <em> · Error</em>}</span><b>{publicationLabel(asset.libraryStatus)}</b></p>{editingTitleId === asset.id ? <form className="mux-title-edit" onSubmit={(event) => void saveTitle(event, asset)}><input autoFocus value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} /><button type="submit" disabled={savingAssetId === asset.id}>{savingAssetId === asset.id ? 'Saving…' : 'Save'}</button><button type="button" onClick={() => setEditingTitleId('')}>Cancel</button></form> : <div className="mux-library-title-line"><h2><a href={`/admin/mux/${asset.id}`}>{asset.title}</a></h2><button type="button" className="mux-title-pencil" title="Edit title" aria-label={`Edit title for ${asset.title}`} onClick={() => { setEditingTitleId(asset.id); setTitleDraft(asset.title); }}>✎</button></div>}</div>
          </article>
        </div>;
    }))}</div>}
      {selectionMode && <div className="mux-bulk-bar"><div><strong>{selectedIds.length}</strong><span>{selectedIds.length === 1 ? 'video selected' : 'videos selected'}</span></div><nav><button disabled={!selectedIds.length} onClick={() => void copyShowcaseUrl()}>{showcaseCopied ? 'Showcase link copied' : 'Create showcase link'}</button><button disabled={!selectedIds.length} onClick={() => setBulkAction('collection')}>Create collection</button><button disabled={!selectedIds.length} onClick={() => { setClientAssignment(selectedAssets.map(clientName).find((name) => name !== 'Unassigned') || ''); setBulkAction('client'); }}>Add to client</button><button className="danger" disabled={!selectedIds.length} onClick={() => setBulkAction('delete')}>Delete</button></nav><button className="mux-bulk-close" onClick={exitSelectionMode} aria-label="Exit selection mode">×</button></div>}
    {bulkAction && <div className="mux-bulk-modal" role="dialog" aria-modal="true" onMouseDown={() => !saving && setBulkAction(null)}><div onMouseDown={(event) => event.stopPropagation()}>
      <button className="mux-bulk-modal-close" type="button" onClick={() => setBulkAction(null)} aria-label="Close">×</button>
      {bulkAction === 'project' && <form className="mux-project-builder" onSubmit={createProject}><div className="mux-builder-head"><div><p>New solo page</p><h3>{selectedAssets.length} {selectedAssets.length === 1 ? 'asset' : 'ratio variants'}</h3></div></div><div className="mux-builder-fields"><label><span>Title</span><input required value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} /></label><label><span>Client</span><input value={projectClient} onChange={(event) => setProjectClient(event.target.value)} /></label><label className="wide"><span>Short description (optional)</span><textarea value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} rows={2} /></label></div><div className="mux-builder-variants">{selectedAssets.map((asset) => <div key={asset.id}><img src={asset.thumbnailUrl || ''} alt="" /><span><strong>{asset.title}</strong><small>{asset.aspectRatio || 'Ratio unavailable'}</small></span><input value={variantLabels[asset.id] || ratioLabel(asset.aspectRatio)} onChange={(event) => setVariantLabels((current) => ({ ...current, [asset.id]: event.target.value }))} aria-label={`Label for ${asset.title}`} /></div>)}</div>{collections.length > 0 && <fieldset className="mux-builder-collections"><legend>Add to collections</legend>{collections.map((item) => <label key={item.id}><input type="checkbox" checked={projectCollectionIds.includes(item.id)} onChange={() => setProjectCollectionIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />{item.name}</label>)}</fieldset>}<div className="mux-builder-submit"><span>URL: /watch/{videoProjectSlug(projectTitle) || 'your-video'}</span><button type="submit" disabled={saving === 'project'}>{saving === 'project' ? 'Building page…' : 'Create video page'}</button></div></form>}
      {bulkAction === 'collection' && <form className="mux-bulk-simple-form" onSubmit={createCollection}><p>New collection</p><h3>Group this campaign.</h3><label><span>Collection name</span><input autoFocus required value={collectionName} onChange={(event) => setCollectionName(event.target.value)} /></label><small>The selected videos will collapse into one stacked collection card with its own public page.</small><button type="submit" disabled={saving === 'collection'}>{saving === 'collection' ? 'Creating…' : 'Create collection'}</button></form>}
      {bulkAction === 'client' && <form className="mux-bulk-simple-form" onSubmit={assignClient}><p>Client assignment</p><h3>{selectedIds.length} {selectedIds.length === 1 ? 'video' : 'videos'}</h3><label><span>Client name</span><input autoFocus required value={clientAssignment} onChange={(event) => setClientAssignment(event.target.value)} list="mux-client-names" /></label><datalist id="mux-client-names">{clients.filter((name) => name !== 'All' && name !== 'Unassigned').map((name) => <option value={name} key={name} />)}</datalist><button type="submit" disabled={saving === 'client'}>{saving === 'client' ? 'Assigning…' : 'Assign client'}</button></form>}
      {bulkAction === 'delete' && <div className="mux-bulk-delete"><p>Permanent deletion</p><h3>Delete {selectedIds.length} {selectedIds.length === 1 ? 'video' : 'videos'}?</h3><span>This removes the selected assets and their video data from Mux. This cannot be undone.</span><button type="button" disabled={saving === 'delete'} onClick={deleteSelected}>{saving === 'delete' ? 'Deleting…' : 'Yes, delete permanently'}</button></div>}
    </div></div>}
    {tagsAsset && <div className="mux-bulk-modal" role="dialog" aria-modal="true" onMouseDown={() => !savingAssetId && setTagsAssetId('')}><div onMouseDown={(event) => event.stopPropagation()}><button className="mux-bulk-modal-close" type="button" onClick={() => setTagsAssetId('')} aria-label="Close">×</button><form className="mux-bulk-simple-form" onSubmit={(event) => void saveTags(event, tagsAsset)}><p>Private tags</p><h3>{tagsAsset.title}</h3><label><span>Comma-separated tags</span><input autoFocus value={tagsDraft} onChange={(event) => setTagsDraft(event.target.value)} /></label>{tagSuggestions(tagsDraft).length > 0 && <div className="mux-tag-suggestions">{tagSuggestions(tagsDraft).map((tag) => <button type="button" key={tag} onClick={() => setTagsDraft((current) => acceptTag(current, tag))}>{tag}</button>)}</div>}<button type="submit" disabled={savingAssetId === tagsAsset.id}>{savingAssetId === tagsAsset.id ? 'Saving…' : 'Save tags'}</button></form></div></div>}
    {tagsProject && <div className="mux-bulk-modal" role="dialog" aria-modal="true" onMouseDown={() => !savingProjectId && setTagsProjectId('')}><div onMouseDown={(event) => event.stopPropagation()}><button className="mux-bulk-modal-close" type="button" onClick={() => setTagsProjectId('')} aria-label="Close">×</button><form className="mux-bulk-simple-form" onSubmit={(event) => void saveProjectTags(event)}><p>Private tags · shared by all ratios</p><h3>{tagsProject.title}</h3><label><span>Comma-separated tags</span><input autoFocus value={tagsDraft} onChange={(event) => setTagsDraft(event.target.value)} /></label>{tagSuggestions(tagsDraft).length > 0 && <div className="mux-tag-suggestions">{tagSuggestions(tagsDraft).map((tag) => <button type="button" key={tag} onClick={() => setTagsDraft((current) => acceptTag(current, tag))}>{tag}</button>)}</div>}<button type="submit" disabled={savingProjectId === tagsProject.id}>{savingProjectId === tagsProject.id ? 'Saving…' : 'Save tags'}</button></form></div></div>}
    {managingCollection && <div className="mux-bulk-modal mux-collection-manager-modal" role="dialog" aria-modal="true" onMouseDown={() => !savingCollection && setManagingCollectionId('')}><div onMouseDown={(event) => event.stopPropagation()}><button className="mux-bulk-modal-close" type="button" onClick={() => setManagingCollectionId('')} aria-label="Close">×</button><header className="mux-collection-manager-head"><div><p>Collection manager</p><h3>{managingCollection.name}</h3></div><span>{managingCollectionAssets.length} videos</span></header><form className="mux-collection-tags-form" onSubmit={(event) => void saveCollectionTags(event)}><label><span>Collection tags</span><input value={collectionTagsDraft} onChange={(event) => setCollectionTagsDraft(event.target.value)} /></label><button type="submit" disabled={savingCollection}>{savingCollection ? 'Saving…' : 'Save tags'}</button>{tagSuggestions(collectionTagsDraft).length > 0 && <div className="mux-tag-suggestions">{tagSuggestions(collectionTagsDraft).map((tag) => <button type="button" key={tag} onClick={() => setCollectionTagsDraft((current) => acceptTag(current, tag))}>{tag}</button>)}</div>}</form><div className="mux-collection-manager-list">{managingCollectionAssets.map((asset) => <article className="mux-collection-manager-item" key={asset.id}><a className="mux-collection-manager-thumb" href={`/admin/mux/${asset.id}`}>{asset.thumbnailUrl ? <img src={asset.thumbnailUrl} alt="" /> : <span>Preview unavailable</span>}<b>{duration(asset.duration)}</b></a><div className="mux-collection-manager-copy"><p>{clientName(asset)} · {asset.libraryStatus}</p><h4>{asset.title}</h4></div><nav className="mux-collection-manager-actions"><a href={`/admin/mux/${asset.id}`}>Manage</a><a href={publicPath(asset)} target="_blank" rel="noreferrer">Public</a><button type="button" onClick={() => void copyPublicUrl(asset)}>Copy URL</button><button type="button" onClick={() => { setManagingCollectionId(''); setTagsAssetId(asset.id); setTagsDraft(asset.localTags.join(', ')) }}>Tags</button><button type="button" onClick={() => void changeStatus(asset, asset.libraryStatus === 'published' ? 'unreviewed' : 'published')}>{asset.libraryStatus === 'published' ? 'Unpublish' : 'Publish'}</button><button type="button" onClick={() => void changeStatus(asset, asset.libraryStatus === 'hidden' ? 'unreviewed' : 'hidden')}>{asset.libraryStatus === 'hidden' ? 'Unhide' : 'Hide'}</button><button className="danger" type="button" onClick={() => { setManagingCollectionId(''); setDeleteAssetId(asset.id) }}>Delete</button></nav></article>)}</div></div></div>}
    {deleteAsset && <div className="mux-bulk-modal" role="dialog" aria-modal="true" onMouseDown={() => !savingAssetId && setDeleteAssetId('')}><div onMouseDown={(event) => event.stopPropagation()}><button className="mux-bulk-modal-close" type="button" onClick={() => setDeleteAssetId('')} aria-label="Close">×</button><div className="mux-bulk-delete"><p>Permanent deletion</p><h3>Delete “{deleteAsset.title}”?</h3><span>This removes the asset and its video data from Mux. This cannot be undone.</span><button type="button" disabled={savingAssetId === deleteAsset.id} onClick={() => void deleteOne(deleteAsset)}>{savingAssetId === deleteAsset.id ? 'Deleting…' : 'Yes, delete permanently'}</button></div></div></div>}
    {deleteProject && <div className="mux-bulk-modal" role="dialog" aria-modal="true" onMouseDown={() => !savingProjectId && setDeleteProjectId('')}><div onMouseDown={(event) => event.stopPropagation()}><button className="mux-bulk-modal-close" type="button" onClick={() => setDeleteProjectId('')} aria-label="Close">×</button><div className="mux-bulk-delete"><p>Permanent deletion</p><h3>Delete “{deleteProject.title}”?</h3><span>This removes the single video page and all {deleteProjectAssets.length} ratio versions from Mux. This cannot be undone.</span><button type="button" disabled={savingProjectId === deleteProject.id} onClick={() => void deleteProjectAndAssets()}>{savingProjectId === deleteProject.id ? 'Deleting…' : 'Yes, delete permanently'}</button></div></div></div>}
  </>;
}
