'use client';
import { useRef } from 'react';
export function useRetryId() {
  const current = useRef<{ payload: string; id: string } | null>(null);
  return (payload: unknown) => {
    const serialized = JSON.stringify(payload);
    if (!current.current || current.current.payload !== serialized) current.current = { payload: serialized, id: crypto.randomUUID() };
    return current.current.id;
  };
}
