import type { Metadata } from 'next';
import { WatchShell } from '@/components/WatchShell';

export const metadata: Metadata = { title: 'Video', description: 'Private video viewing page.', robots: { index: false, follow: false } };

export default function UnbrandedWatchPage() {
  return <main className="solo-video-page"><WatchShell unbranded /></main>;
}
