'use client';

import { useEffect } from 'react';

export function WorkRedirect() {
  useEffect(() => {
    window.location.replace(`/our-work${window.location.search}${window.location.hash}`);
  }, []);
  return <main className="work-route-redirect"><p>Our work has moved.</p><a href="/our-work">Continue to Our Work ↗</a></main>;
}
