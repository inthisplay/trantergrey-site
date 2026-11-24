'use client';

import { useState } from 'react';

export function MuxCacheRefreshButton() {
  const [refreshing, setRefreshing] = useState(false);
  return <button className="admin-cache-refresh" type="button" disabled={refreshing} onClick={() => {
    setRefreshing(true);
    // The library rebuilds its cache on every page load. Avoid two rebuilds.
    window.location.reload();
  }}>{refreshing ? 'Refreshing cache…' : 'Refresh cache'}</button>;
}
