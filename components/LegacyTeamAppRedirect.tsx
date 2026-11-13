'use client';

import { useEffect } from 'react';

export function LegacyTeamAppRedirect({ destination }: { destination: string }) {
  useEffect(() => {
    window.location.replace(`${destination}${window.location.search}`);
  }, [destination]);

  return null;
}
