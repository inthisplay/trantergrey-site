import type { Metadata } from 'next';
import { ShowcaseShell } from '@/components/ShowcaseShell';

export const metadata: Metadata = { title: 'Video Showcase — TranterGrey', description: 'A curated video showcase from TranterGrey.', robots: { index: false, follow: false } };
export default function ShowcasePage() { return <ShowcaseShell />; }
