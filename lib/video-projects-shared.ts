export type VideoProjectVariant = {
  assetId: string;
  label: string;
  aspectRatio: string | null;
  order: number;
};

export type VideoProject = {
  id: string;
  title: string;
  slug: string;
  legacySlugs?: string[];
  client: string | null;
  description: string | null;
  variants: VideoProjectVariant[];
  collectionIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type VideoProjectCollection = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export function videoProjectSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export function ratioLabel(aspectRatio: string | null) {
  if (!aspectRatio) return 'Main';
  const match = aspectRatio.match(/^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/);
  if (!match) return aspectRatio.slice(0, 20);
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return aspectRatio.slice(0, 20);
  const ratio = width / height;
  if (Math.abs(ratio - 16 / 9) < 0.04) return '16:9';
  if (Math.abs(ratio - 9 / 16) < 0.04) return '9:16';
  if (Math.abs(ratio - 1) < 0.04) return '1:1';
  if (Math.abs(ratio - 4 / 5) < 0.04) return '4:5';
  if (Math.abs(ratio - 5 / 4) < 0.04) return '5:4';
  if (Math.abs(ratio - 3 / 2) < 0.04) return '3:2';
  if (Math.abs(ratio - 2 / 3) < 0.04) return '2:3';
  if (Math.abs(ratio - 4 / 3) < 0.04) return '4:3';
  if (Math.abs(ratio - 3 / 4) < 0.04) return '3:4';
  if (Math.abs(ratio - 21 / 9) < 0.05) return '21:9';
  return `${match[1]}:${match[2]}`;
}
