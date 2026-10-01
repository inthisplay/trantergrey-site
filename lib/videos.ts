import type { VimeoLibraryVideo } from '@/lib/vimeo-library';

export type Video = {
  id: string; hash?: string; title: string; client: string; year: number; duration: string;
  kind: string; industry: string; thumbnail: string; searchTerms?: string;
};

function duration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function vimeoHash(video: VimeoLibraryVideo) {
  try {
    const embedHash = video.embedUrl ? new URL(video.embedUrl).searchParams.get('h') : null;
    if (embedHash) return embedHash;
    const parts = video.url ? new URL(video.url).pathname.split('/').filter(Boolean) : [];
    return parts.length > 1 ? parts.at(-1) : undefined;
  } catch {
    return undefined;
  }
}

export function toPublicVideo(video: VimeoLibraryVideo): Video {
  return {
    id: video.id,
    hash: vimeoHash(video),
    title: video.customTitle || video.title,
    client: video.client || '',
    year: video.createdAt ? new Date(video.createdAt).getFullYear() : new Date().getFullYear(),
    duration: duration(video.duration),
    kind: '',
    industry: '',
    thumbnail: video.thumbnailUrl || '',
    searchTerms: [video.description, ...video.tags, ...(video.localTags ?? [])].filter(Boolean).join(' '),
  };
}

export const videos: Video[] = [
  { id: '1221238592', hash: '04f77f8a73', title: 'TG Demo Reel 2026', client: 'TranterGrey', year: 2026, duration: '01:18', kind: 'Demo Reel', industry: 'Agency', thumbnail: 'https://i.vimeocdn.com/video/2193888254-11cecd3270145a1706d00e2d55db85822d0a7a2a97e3ef8f256033af31534b20-d_1280?region=us' },
  { id: '1068124019', hash: '518b536a19', title: 'BMW Lifestyle', client: 'BMW', year: 2025, duration: '00:30', kind: 'Commercial', industry: 'Automotive', thumbnail: 'https://i.vimeocdn.com/video/1996170478-ddc01c34ddaaf95c98b4b410583acd8a23fe046cf5bb0856a560ecf0ec03de87-d_1280?region=us' },
  { id: '645302262', title: 'Center of Excellence', client: 'Taylor BMW', year: 2021, duration: '01:01', kind: 'Brand Film', industry: 'Automotive', thumbnail: 'https://i.vimeocdn.com/video/1297962153-439ab8499ea3c47474ee793f39f42633a92b4f0b0342276d3_1280?region=us' },
  { id: '230989356', title: 'Southeastern Real Estate', client: 'Southeastern', year: 2017, duration: '01:00', kind: 'Commercial', industry: 'Real Estate', thumbnail: 'https://i.vimeocdn.com/video/651687320-f2e14f0e86e6cc575a9705d36a85c533e3bbed83e1ee60ed532851124642143e-d_1280?region=us' },
  { id: '1173033228', hash: '0ecfe40fd0', title: 'Teddy Bear', client: 'The Salvation Army', year: 2026, duration: '01:00', kind: 'Campaign Film', industry: 'Nonprofit', thumbnail: 'https://i.vimeocdn.com/video/2133078712-1b6e9e3d2b01f14f534f02285f925ab3ff7bd516c8e2a0e5c7366a84695cf7ec-d_1280?region=us' },
  { id: '859777126', title: 'Memories', client: 'Tub Doctor', year: 2023, duration: '00:29', kind: 'Commercial', industry: 'Home Services', thumbnail: 'https://i.vimeocdn.com/video/1717830924-3371e33a9cb0d24dd6c676d7ce37ad604778c23de258e6e3b574146c1f16b81a-d_1280?region=us' },
  { id: '586007591', title: "Don't Do It Yourself", client: 'Southern Siding', year: 2021, duration: '01:00', kind: 'Commercial', industry: 'Home Services', thumbnail: 'https://i.vimeocdn.com/video/1212550861-28a562f4a086ea4a4f77bf3d8e29519889e434f6764c4be977de0f92f2ee9894-d_1280?region=us' },
  { id: '1191661277', hash: '67ffd0981a', title: 'Sizzle Reel', client: 'BL Schools', year: 2026, duration: '01:40', kind: 'Demo Reel', industry: 'Education', thumbnail: 'https://i.vimeocdn.com/video/2156731992-37c0250f510acf0bd61bdaf0637f3502fdd3ae6525d14de9bcc8b371bd15cde4-d_1280?region=us' },
  { id: '1212086748', hash: '2090b23001', title: 'Athletics', client: 'BL Schools', year: 2026, duration: '02:28', kind: 'Brand Film', industry: 'Education', thumbnail: 'https://i.vimeocdn.com/video/2182420508-fe16590ebe83f13c772a85e8ef4cc5d4871b4f68b7e56aecb6165004e69f1b2b-d_1280?region=us' },
  { id: '1161563709', hash: '7f196322f2', title: 'Battery', client: 'Kart King', year: 2026, duration: '00:30', kind: 'Commercial', industry: 'Automotive', thumbnail: 'https://i.vimeocdn.com/video/2116993891-be47b61fce50053fbf04ab23cbb721a141817b10a2421dcf61e5314a602bec3e-d_1280?region=us' },
];

export function vimeoPlayerUrl(video: Pick<Video, 'id' | 'hash'>, autoplay = false) {
  const hash = video.hash ? `h=${video.hash}&` : '';
  return `https://player.vimeo.com/video/${video.id}?${hash}autoplay=${autoplay ? '1' : '0'}&title=0&byline=0&portrait=0`;
}
