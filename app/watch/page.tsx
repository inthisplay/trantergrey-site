import type { Metadata } from 'next';
import { WatchShell } from '@/components/WatchShell';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

export const metadata: Metadata = { title: 'Video — TranterGrey', description: 'Watch a film by TranterGrey.', robots: { index: false, follow: false } };
export default function WatchPage() { return <main className="solo-video-page"><SiteHeader /><WatchShell /><SiteFooter /></main>; }
