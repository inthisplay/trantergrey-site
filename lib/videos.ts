import type { VimeoLibraryVideo } from '@/lib/vimeo-library';

export type Video = {
  id: string; hash?: string; muxPlaybackId?: string; muxProjectSlug?: string; title: string; client: string; year: number; duration: string;
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
  { id: '1221238592', muxPlaybackId: 'E7jyFwEmHOldGdnZHV4oTCDCn5HCxvvbEKXU46Wq3Ic', muxProjectSlug: 'EC6G', title: 'TG Demo Reel 2026', client: 'TranterGrey', year: 2026, duration: '01:18', kind: 'Demo Reel', industry: 'Agency', thumbnail: 'https://image.mux.com/E7jyFwEmHOldGdnZHV4oTCDCn5HCxvvbEKXU46Wq3Ic/thumbnail.jpg?time=20.3&width=1280' },
  { id: '1068124019', muxPlaybackId: 'oImb5K26o6ADuyWIHHaOx01i02atpq013IDMrZ02MfGA7tE', muxProjectSlug: 'H4Lm', title: 'BMW Lifestyle', client: 'BMW', year: 2025, duration: '00:30', kind: 'Commercial', industry: 'Automotive', thumbnail: 'https://image.mux.com/oImb5K26o6ADuyWIHHaOx01i02atpq013IDMrZ02MfGA7tE/thumbnail.jpg?time=1&width=1280' },
  { id: '645302262', muxPlaybackId: 'KQR9DIKy00iSDA81qvi02spCAKfdbolWAw29NI2NIaYj8', muxProjectSlug: 'ff8V', title: 'Center of Excellence', client: 'Taylor BMW', year: 2021, duration: '01:01', kind: 'Brand Film', industry: 'Automotive', thumbnail: 'https://image.mux.com/KQR9DIKy00iSDA81qvi02spCAKfdbolWAw29NI2NIaYj8/thumbnail.jpg?time=1&width=1280' },
  { id: '230989356', muxPlaybackId: 'nh4OAEYPzTcc2I77I3fbM4QJpIx7n02ICWizc8MBLQYM', muxProjectSlug: 'KdIx', title: 'Southeastern Real Estate', client: 'Southeastern', year: 2017, duration: '01:00', kind: 'Commercial', industry: 'Real Estate', thumbnail: 'https://image.mux.com/nh4OAEYPzTcc2I77I3fbM4QJpIx7n02ICWizc8MBLQYM/thumbnail.jpg?time=1&width=1280' },
  { id: '1173033228', muxPlaybackId: 'lpFlMV95tj3vbEMNm022m6XDUlACay1CMLE17zYTOpME', muxProjectSlug: 'kOTO', title: 'Teddy Bear', client: 'The Salvation Army', year: 2026, duration: '01:00', kind: 'Campaign Film', industry: 'Nonprofit', thumbnail: 'https://image.mux.com/lpFlMV95tj3vbEMNm022m6XDUlACay1CMLE17zYTOpME/thumbnail.jpg?time=11.4&width=1280' },
  { id: '859777126', muxPlaybackId: 'vOoCdOnTUK02BbxQCpLS02Di1c00L5kFVqgH01JcGYOZ12o', muxProjectSlug: 'fMCL', title: 'Memories', client: 'Tub Doctor', year: 2023, duration: '00:30', kind: 'Commercial', industry: 'Home Services', thumbnail: 'https://image.mux.com/vOoCdOnTUK02BbxQCpLS02Di1c00L5kFVqgH01JcGYOZ12o/thumbnail.jpg?time=1&width=1280' },
  { id: '586007591', title: "Don't Do It Yourself", client: 'Southern Siding', year: 2021, duration: '01:00', kind: 'Commercial', industry: 'Home Services', thumbnail: 'https://i.vimeocdn.com/video/1212550861-28a562f4a086ea4a4f77bf3d8e29519889e434f6764c4be977de0f92f2ee9894-d_1280?region=us' },
  { id: '1191661277', hash: '67ffd0981a', title: 'Sizzle Reel', client: 'BL Schools', year: 2026, duration: '01:40', kind: 'Demo Reel', industry: 'Education', thumbnail: 'https://i.vimeocdn.com/video/2156731992-37c0250f510acf0bd61bdaf0637f3502fdd3ae6525d14de9bcc8b371bd15cde4-d_1280?region=us' },
  { id: '1212086748', hash: '2090b23001', title: 'Athletics', client: 'BL Schools', year: 2026, duration: '02:28', kind: 'Brand Film', industry: 'Education', thumbnail: 'https://i.vimeocdn.com/video/2182420508-fe16590ebe83f13c772a85e8ef4cc5d4871b4f68b7e56aecb6165004e69f1b2b-d_1280?region=us' },
  { id: '1161563709', hash: '7f196322f2', title: 'Battery', client: 'Kart King', year: 2026, duration: '00:30', kind: 'Commercial', industry: 'Automotive', thumbnail: 'https://i.vimeocdn.com/video/2116993891-be47b61fce50053fbf04ab23cbb721a141817b10a2421dcf61e5314a602bec3e-d_1280?region=us' },
];

export const homepageStripVideos: Video[] = [
  { ...videos[1], client: 'Taylor BMW' },
  { id: 'tg-reel-2022', muxPlaybackId: '2SZMMKsLpu02vxK2Y02kTXG1RFoWXXSc4ZfeZ29PvUynM', muxProjectSlug: 'bC9Y', title: 'TG Reel 2022', client: 'TranterGrey', year: 2022, duration: '01:21', kind: 'Demo Reel', industry: 'Agency', thumbnail: 'https://image.mux.com/2SZMMKsLpu02vxK2Y02kTXG1RFoWXXSc4ZfeZ29PvUynM/thumbnail.jpg?time=44.4&width=1280' },
  { id: 'llj-faces-2018', muxPlaybackId: 'Imn300ybea02auWpGMoG02BhmSM9xziU4zE782HNoUM5Ak', muxProjectSlug: 'tYlc', title: 'Lead Like Jesus - Faces 2018', client: 'Lead Like Jesus', year: 2018, duration: '08:36', kind: 'Brand Film', industry: 'Nonprofit', thumbnail: 'https://image.mux.com/Imn300ybea02auWpGMoG02BhmSM9xziU4zE782HNoUM5Ak/thumbnail.jpg?time=1&width=1280' },
  { id: 'southeastern-home', muxPlaybackId: 'nh4OAEYPzTcc2I77I3fbM4QJpIx7n02ICWizc8MBLQYM', muxProjectSlug: 'KdIx', title: 'Southeastern: This Is Our Home', client: 'Southeastern', year: 2017, duration: '01:00', kind: 'Commercial', industry: 'Real Estate', thumbnail: 'https://image.mux.com/nh4OAEYPzTcc2I77I3fbM4QJpIx7n02ICWizc8MBLQYM/thumbnail.jpg?time=1&width=1280' },
  { id: 'awp-the-visit', muxPlaybackId: 'THYL01LpyJiPUK2602Bbn9KIRCOlbs7C3yeFznvkVeYZU', muxProjectSlug: 'voyQ', title: 'AWP - The Visit', client: 'AWP', year: 2016, duration: '01:00', kind: 'Commercial', industry: '', thumbnail: 'https://image.mux.com/THYL01LpyJiPUK2602Bbn9KIRCOlbs7C3yeFznvkVeYZU/thumbnail.jpg?time=1&width=1280' },
];

export function vimeoPlayerUrl(video: Pick<Video, 'id' | 'hash'>, autoplay = false) {
  const hash = video.hash ? `h=${video.hash}&` : '';
  return `https://player.vimeo.com/video/${video.id}?${hash}autoplay=${autoplay ? '1' : '0'}&title=0&byline=0&portrait=0`;
}

export function videoPlayerUrl(video: Pick<Video, 'id' | 'hash' | 'muxPlaybackId' | 'title'>, autoplay = false) {
  if (!video.muxPlaybackId) return vimeoPlayerUrl(video, autoplay);
  const parameters = new URLSearchParams({
    'metadata-video-id': video.id,
    'metadata-video-title': video.title,
  });
  if (autoplay) parameters.set('autoplay', 'any');
  return `https://player.mux.com/${video.muxPlaybackId}?${parameters}`;
}
