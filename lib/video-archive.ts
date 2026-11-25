export type ArchiveVideo = { vimeo_id: string; title: string; folder: string; client: string; created_at: string; release_at: string | null; duration: number; description: string; tags: string };
export type ArchiveFile = { id: string; name: string; path: string; mimeType: string; size?: string; version?: string; headRevisionId?: string; videoMediaMetadata?: { durationMillis?: string }; capabilities?: { canDownload?: boolean } };
export type ArchiveLink = { vimeo_id: string; file_id: string; manual: number };
export type ArchiveMatch = { video: ArchiveVideo; file: ArchiveFile | null; candidates: ArchiveFile[]; status: 'available' | 'ambiguous' | 'missing' | 'restricted'; basis: string };

// Keep version numbers, years, ratios and word boundaries. Never fuzzy-match a cut automatically.
export const archiveTitle = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
export const archivePath = (value: string) => value === 'My library' ? '' : value.split(/\s*\/\s*/).map(archiveTitle).join('/');
const stem = (value: string) => value.replace(/\.(mp4|mov|m4v|webm|mxf|avi|mkv|mpeg|mpg)$/i, '');
export function matchArchive(videos: ArchiveVideo[], files: ArchiveFile[], links: ArchiveLink[]): ArchiveMatch[] {
  const byFile = new Map(files.map(file => [file.id, file]));
  const saved = new Map(links.map(link => [link.vimeo_id, link]));
  const ids = new Map<string, ArchiveFile[]>(), names = new Map<string, ArchiveFile[]>();
  for (const file of files) {
    const name = stem(file.name), embedded = name.match(/\[(\d{5,20})\]\s*$/)?.[1];
    if (embedded) ids.set(embedded, [...(ids.get(embedded) || []), file]);
    const key = `${archivePath(file.path)}|${archiveTitle(name.replace(/\s*\[\d{5,20}\]\s*$/, ''))}`;
    names.set(key, [...(names.get(key) || []), file]);
  }
  const matches = videos.map(video => {
    const link = saved.get(video.vimeo_id);
    const candidates = link ? [byFile.get(link.file_id)].filter((file): file is ArchiveFile => Boolean(file))
      : ids.get(video.vimeo_id) || names.get(`${archivePath(video.folder)}|${archiveTitle(video.title)}`) || [];
    // Duration is supporting evidence; never use it to silently resolve duplicate titles.
    const file = candidates.length === 1 ? candidates[0] : null;
    const duration = Number(file?.videoMediaMetadata?.durationMillis) / 1000;
    const conflict = !link?.manual && file && video.duration > 0 && duration > 0 && Math.abs(video.duration - duration) > 3;
    return { video, file: conflict ? null : file, candidates, status: candidates.length > 1 || conflict ? 'ambiguous' : !file ? 'missing' : file.capabilities?.canDownload === false ? 'restricted' : 'available', basis: link ? link.manual ? 'manual' : 'saved ID' : ids.has(video.vimeo_id) ? 'Vimeo ID' : 'title and folder' } as ArchiveMatch;
  });
  // Two CSV records must not silently claim one Drive file.
  const claims = new Map<string, number>();
  for (const match of matches) if (match.file) claims.set(match.file.id, (claims.get(match.file.id) || 0) + 1);
  return matches.map(match => match.file && claims.get(match.file.id)! > 1 ? { ...match, status: 'ambiguous', file: null } : match);
}

export type ArchiveJob = { id: string; vimeo_id: string; file_id: string; title: string; client: string; state: string; asset_id: string | null; bytes_done: number; byte_size: number; error: string | null };
export type ArchiveRow = { id: string; title: string; client: string; uploadDate: string; folder: string; duration: number; status: ArchiveMatch['status']; basis: string; file: ArchiveFile | null; candidates: ArchiveFile[]; job: ArchiveJob | null; muxAssetId: string | null };
