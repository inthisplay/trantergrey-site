import type { Metadata } from 'next';
import { MeetPortal } from '@/components/MeetPortal';

export const metadata: Metadata = {
  title: 'Meeting Room — TranterGrey',
  description: 'Join a TranterGrey video meeting.',
  robots: { index: false, follow: false },
};

export default function MeetPage() {
  return <MeetPortal />;
}
