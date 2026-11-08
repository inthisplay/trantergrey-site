export type MuxLibraryStatus = 'unreviewed' | 'published' | 'hidden';

export type MuxLibraryAsset = {
  id: string;
  title: string;
  status: string;
  duration: number;
  createdAt: string | null;
  aspectRatio: string | null;
  resolution: string | null;
  maxResolution: string | null;
  playbackId: string | null;
  playbackPolicy: string | null;
  thumbnailUrl: string | null;
  playerUrl: string | null;
  externalId: string | null;
  creatorId: string | null;
  vimeoId: string | null;
  historicTitle: string | null;
  historicCreatedAt: string | null;
  historicClient: string | null;
  historicFolderPath: string | null;
  staticRenditions: Array<{ id: string | null; name: string | null; status: string; resolution: string | null; url: string | null }>;
};
