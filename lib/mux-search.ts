import Fuse from 'fuse.js';
import type { MatchedMuxLibraryAsset } from './mux-matching';

const tagAliases = [
  ['education', 'school', 'schools', 'k-12', 'k12'],
];

function normalizeSearch(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/['’‘]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function createMuxSearch(assets: MatchedMuxLibraryAsset[]) {
  const entries = assets.map((asset) => {
    const tags = asset.localTags.map(normalizeSearch);
    const aliases = tagAliases.flatMap((group) => {
      const terms = group.map(normalizeSearch);
      return terms.some((term) => tags.includes(term)) ? terms : [];
    });
    const fields = [asset.title, asset.historicTitle, asset.historicFolderPath, asset.client || 'Unassigned', asset.vimeoMatch?.title, asset.vimeoSuggestion?.title]
      .flatMap((value) => value ? [normalizeSearch(value)] : [])
      .concat(tags, aliases);
    const ids = [asset.id, asset.externalId, asset.creatorId, asset.vimeoId].flatMap((value) => value ? [value.toLowerCase()] : []);
    return { asset, fields, ids };
  });
  const fuse = new Fuse(entries, {
    keys: ['fields'],
    threshold: 0.32,
    ignoreLocation: true,
    includeScore: true,
  });

  return (query: string) => {
    const literal = query.trim().toLowerCase();
    if (!literal) return assets;
    const needle = normalizeSearch(literal);
    const exact = entries.filter(({ fields, ids }) => ids.some((id) => id.includes(literal)) || (needle && fields.some((field) => field.includes(needle))));
    if (needle.length < 3 || /^[a-z0-9]{20,}$/i.test(literal)) return exact.map(({ asset }) => asset);

    const exactIds = new Set(exact.map(({ asset }) => asset.id));
    const words = [...new Set(needle.split(' '))];
    const wordMatches = words.map((word) => {
      const scores = new Map(entries.filter(({ fields }) => fields.some((field) => field.includes(word))).map(({ asset }) => [asset.id, 0]));
      if (word.length >= 4) {
        // Adjacent swaps count as two edits in Fuse, even in short names.
        const swaps = Array.from({ length: word.length - 1 }, (_, index) =>
          word.slice(0, index) + word[index + 1] + word[index] + word.slice(index + 2)
        );
        for (const { asset, fields } of entries) {
          if (!scores.has(asset.id) && swaps.some((swap) => fields.some((field) => field.includes(swap)))) scores.set(asset.id, 0.1);
        }
        for (const { item, score } of fuse.search(word)) {
          if (!scores.has(item.asset.id)) scores.set(item.asset.id, score ?? 1);
        }
      }
      return scores;
    });
    const approximate = entries.flatMap(({ asset }) => {
      if (exactIds.has(asset.id) || wordMatches.some((scores) => !scores.has(asset.id))) return [];
      return [{ asset, score: wordMatches.reduce((sum, scores) => sum + (scores.get(asset.id) ?? 0), 0) }];
    }).sort((first, second) => first.score - second.score);
    return [...exact, ...approximate].map(({ asset }) => asset);
  };
}
