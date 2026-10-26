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
import './navy-mutual-brief-tuning.css';
import './case-study-content.css';
import './navy-mutual-story.css';
import './navy-mutual-full-bleed.css';
import './navy-mutual-full-bleed-tuning.css';
import './navy-mutual-flow-tuning.css';
import './navy-mutual-flow-tuning-2.css';
import './navy-mutual-flow-tuning-3.css';
import './navy-mutual-title-scale.css';
import './vimeo-play-gate.css';
import './navy-mutual-video-caption.css';
import './navy-mutual-video-caption-tuning.css';
import './navy-mutual-full-bleed-followup.css';
import './navy-mutual-first-story-rule.css';
import './navy-mutual-film-pairs.css';
import './navy-mutual-interlude.css';
import './batesburg-story.css';
import './taylor-bmw-story.css';
import './case-studies-list.css';
import './admin.css';
import './collections.css';
import './meet.css';
import './footer.css';

export const metadata: Metadata = {
  title: 'TranterGrey — Marketing in motion.',
  description: 'TranterGrey is an award-winning creative agency in Evans, Georgia.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><link rel="preconnect" href="https://player.vimeo.com" /><link rel="preconnect" href="https://i.vimeocdn.com" /></head><body>{children}<AxisXTracking /></body></html>;
}
