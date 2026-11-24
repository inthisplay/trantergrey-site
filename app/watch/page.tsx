import type { Metadata } from 'next';
import { WatchShell } from '@/components/WatchShell';
import { WatchHeaderLayout } from '@/components/WatchHeader';
import { SiteFooter } from '@/components/SiteFooter';

export const metadata: Metadata = { title: 'Video — TranterGrey', description: 'Watch a film by TranterGrey.', robots: { index: false, follow: false } };
export default function WatchPage() { return <main className="solo-video-page"><WatchHeaderLayout><WatchShell headerActions /></WatchHeaderLayout><SiteFooter variant="video" /></main>; }
