'use client';

import { useLayoutEffect, useRef } from 'react';

export function ProductionCardTitle({ value, disabled, onChange, onSave }: { value: string; disabled: boolean; onChange: (value: string) => void; onSave: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const field = ref.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  };
  useLayoutEffect(resize, [value]);
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    let width = 0;
    const observer = new ResizeObserver(entries => {
      const next = entries[0].contentRect.width;
      if (next !== width) { width = next; resize(); }
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, []);
  return <textarea ref={ref} rows={1} className="production-inline-title" aria-label="Card title" value={value} maxLength={240} disabled={disabled}
    onChange={event => onChange(event.target.value.replace(/[\r\n]+/g, ' '))}
    onBlur={onSave} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur(); } }} />;
}
