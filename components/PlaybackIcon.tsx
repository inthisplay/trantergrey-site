// Play and pause shapes adapted from the supplied Streamline icon.
export function PlaybackIcon({ playing = false, className }: { playing?: boolean; className?: string }) {
  return <svg className={className} aria-hidden="true" width="24" height="24" viewBox="6 6 12 12" fill="currentColor">
    <path d={playing ? 'M9.25 8h1.5v8h-1.5zM13.25 8h1.5v8h-1.5z' : 'M9.25 15.7V8.3L14.75 12z'} />
  </svg>;
}
