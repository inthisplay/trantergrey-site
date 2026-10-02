import type { Metadata } from 'next';
import { AxisXTracking } from '@/components/AxisXTracking';
import './globals.css';
import './contact-form.css';
import './typography.css';
import './statement-band.css';
import './header.css';
import './library-tags.css';
import './vimeo-import.css';
import './hero-backdrop.css';
import './motion-strips.css';
import './homepage-motion.css';
import './case-studies.css';

export const metadata: Metadata = {
  title: 'TranterGrey — Marketing in motion.',
  description: 'TranterGrey is an award-winning creative agency in Evans, Georgia.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><link rel="preconnect" href="https://player.vimeo.com" /><link rel="preconnect" href="https://i.vimeocdn.com" /></head><body>{children}<AxisXTracking /></body></html>;
}
