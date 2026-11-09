import type { Metadata } from 'next';
import { ShowcaseShell } from '@/components/ShowcaseShell';

export const metadata: Metadata = { title: 'Video Showcase — TranterGrey', description: 'A curated video showcase from TranterGrey.', robots: { index: false, follow: false }, openGraph: { title: 'Video Showcase — TranterGrey', description: 'A curated video showcase from TranterGrey.', siteName: 'TranterGrey', images: ['https://trantergrey.com/assets/tg-logo-white-red.png'] } };
export default function ShowcasePage() { return <ShowcaseShell />; }
