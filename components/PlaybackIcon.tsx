import { Pause, Play } from 'pixelarticons/react';

export function PlaybackIcon({ playing = false, className }: { playing?: boolean; className?: string }) {
  const Icon = playing ? Pause : Play;
  return <Icon className={className} aria-hidden="true" width={24} height={24} />;
}
