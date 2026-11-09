'use client';

import { useEffect, useState } from 'react';

const storageKey = 'tg-mux-theme';
type Theme = 'dark' | 'light';

export function MuxThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [hasLoadedTheme, setHasLoadedTheme] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(storageKey);
    if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);
    setHasLoadedTheme(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedTheme) return;
    const workspace = document.querySelector<HTMLElement>('.mux-theme-workspace');
    if (workspace) workspace.dataset.theme = theme;
    window.localStorage.setItem(storageKey, theme);
  }, [hasLoadedTheme, theme]);

  const isLight = theme === 'light';
  return <button
    type="button"
    className="mux-theme-toggle"
    role="switch"
    aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
    aria-checked={isLight}
    onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
  >
    <span className="mux-theme-toggle-track" aria-hidden="true"><span /></span>
    <span>{isLight ? 'Light' : 'Dark'}</span>
  </button>;
}
