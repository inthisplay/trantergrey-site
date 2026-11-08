import type { MuxLibraryAsset } from './mux-api';
import type { MuxLibraryStatus } from './mux-library-metadata';

export type VimeoMatchCandidate = {
  id: string;
  title: string;
  customTitle?: string | null;
  client?: string | null;
  duration: number;
};

export type VimeoAssetMatch = {
  id: string;
  title: string;
  client: string | null;
  duration: number;
  confidence: number;
  basis: 'embedded-id' | 'title-and-duration';
};

export type MatchedMuxLibraryAsset = MuxLibraryAsset & {
  client: string | null;
  vimeoMatch: VimeoAssetMatch | null;
  vimeoSuggestion: VimeoAssetMatch | null;
  matchIssue: 'ambiguous' | null;
  libraryStatus: MuxLibraryStatus;
  localTags: string[];
};

function inferredClient(assetTitle: string, candidates: VimeoMatchCandidate[]) {
  const normalizedAsset = normalizedTitle(assetTitle);
  const knownClients = [...new Set(candidates.map((video) => video.client?.trim()).filter((client): client is string => Boolean(client)))];
  const known = knownClients
    .sort((first, second) => second.length - first.length)
    .find((client) => normalizedAsset.startsWith(normalizedTitle(client)));
  if (known) return known;

  const prefix = assetTitle.split(/\s+[–—-]\s+/)[0]?.trim();
  return prefix && prefix !== assetTitle && prefix.length >= 3 ? prefix : null;
}

function normalizedTitle(value: string, loose = false) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\[(\d{5,20})\]\s*$/g, ' ')
    .replace(loose ? /\b(?:19|20)\d{2}\b/g : /$^/g, ' ')
    .replace(loose ? /\b\d+\s*(?:sec(?:ond)?s?|min(?:ute)?s?)\b/g : /$^/g, ' ')
    .replace(loose ? /:\d{2}\b/g : /$^/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return normalized;
}

function namesFor(video: VimeoMatchCandidate, loose = false) {
  const titles = [video.customTitle, video.title].filter((title): title is string => Boolean(title?.trim()));
  const names = video.client?.trim() ? [...titles, ...titles.map((title) => `${video.client} ${title}`)] : titles;
  return [...new Set(names.map((name) => normalizedTitle(name, loose)).filter(Boolean))];
}

function tokens(value: string) {
  return new Set(value.split(' ').filter(Boolean));
}

function titleSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  if (shorter.length >= 8 && longer.includes(shorter)) return 0.94;
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  const common = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  if (common < 2) return 0;
  return (2 * common) / (leftTokens.size + rightTokens.size);
}

function titleScore(assetTitle: string, video: VimeoMatchCandidate) {
  const strictAssetTitle = normalizedTitle(assetTitle);
  const looseAssetTitle = normalizedTitle(assetTitle, true);
  const strict = Math.max(0, ...namesFor(video).map((name) => titleSimilarity(strictAssetTitle, name)));
  const loose = Math.max(0, ...namesFor(video, true).map((name) => titleSimilarity(looseAssetTitle, name))) * 0.96;
  return Math.max(strict, loose);
}

function asMatch(video: VimeoMatchCandidate, confidence: number, basis: VimeoAssetMatch['basis']): VimeoAssetMatch {
  return {
    id: video.id,
    title: video.customTitle?.trim() || video.title,
    client: video.client?.trim() || null,
    duration: Math.max(0, Math.round(video.duration)),
    confidence: Math.round(confidence * 100),
    basis,
  };
}

export function matchMuxAssetsToVimeo(assets: MuxLibraryAsset[], rawCandidates: VimeoMatchCandidate[]): MatchedMuxLibraryAsset[] {
  const candidates = rawCandidates.filter((video) => video.id && video.title && Number.isFinite(video.duration));
  const byId = new Map(candidates.map((video) => [video.id, video]));

  return assets.map((asset) => {
    if (asset.vimeoId) {
      const exact = byId.get(asset.vimeoId);
      const vimeoMatch = exact ? asMatch(exact, 1, 'embedded-id') : null;
      return { ...asset, client: asset.historicClient || vimeoMatch?.client || inferredClient(asset.title, candidates), vimeoMatch, vimeoSuggestion: null, matchIssue: null, libraryStatus: 'unreviewed', localTags: [] };
    }

    const ranked = candidates.map((video) => {
      const similarity = titleScore(asset.title, video);
      const durationDifference = Math.abs(asset.duration - Math.round(video.duration));
      const durationClose = durationDifference <= 3;
      const confidence = durationClose ? Math.min(0.99, similarity * 0.94 + 0.05) : similarity * 0.72;
      return { video, confidence, similarity, durationClose };
    }).filter((item) => item.durationClose && item.similarity >= 0.84).sort((a, b) => b.confidence - a.confidence);

    const best = ranked[0];
    if (!best || best.confidence < 0.89) return { ...asset, client: asset.historicClient || inferredClient(asset.title, candidates), vimeoMatch: null, vimeoSuggestion: null, matchIssue: null, libraryStatus: 'unreviewed', localTags: [] };
    const runnerUp = ranked[1];
    if (runnerUp && best.confidence - runnerUp.confidence < 0.03 && runnerUp.video.id !== best.video.id) {
      return { ...asset, client: asset.historicClient || inferredClient(asset.title, candidates), vimeoMatch: null, vimeoSuggestion: null, matchIssue: 'ambiguous', libraryStatus: 'unreviewed', localTags: [] };
    }
    const vimeoSuggestion = asMatch(best.video, best.confidence, 'title-and-duration');
    return { ...asset, client: asset.historicClient || vimeoSuggestion.client || inferredClient(asset.title, candidates), vimeoMatch: null, vimeoSuggestion, matchIssue: null, libraryStatus: 'unreviewed', localTags: [] };
  });
}
