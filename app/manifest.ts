import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return { name: 'TranterGrey Team', short_name: 'TG Team', description: 'Private TranterGrey production workspace.', start_url: '/app', scope: '/app/', display: 'standalone', background_color: '#000000', theme_color: '#000000', icons: [{ src: '/tg-team-icon.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' }] };
}
