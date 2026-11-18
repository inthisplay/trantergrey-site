'use client';

import { useEffect, useState } from 'react';

export function AdminLogin() {
  const [next, setNext] = useState('/admin');
  const [error, setError] = useState('');
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const destination = query.get('next');
    if (destination?.startsWith('/') && !destination.startsWith('//')) setNext(destination);
    if (query.get('error') === '1') { setError('That password did not match.'); setOwnerOpen(true); }
    if (query.get('error') === 'config') setError('Private access is being configured. Please try again shortly.');
    if (query.get('error') === 'google-config') setError('Google sign-in is still being configured.');
    if (query.get('error') === 'google') setError('Google sign-in could not be verified. Please try again.');
    if (query.get('error') === 'domain') setError('Please sign in with your @trantergrey.com account.');
    const controller = new AbortController();
    fetch('/api/auth/config', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((config: { password?: boolean } | null) => setPasswordEnabled(config?.password === true))
      .catch(() => setPasswordEnabled(false));
    return () => controller.abort();
  }, []);
  return <div className="admin-login-options">
    {error && <p className="admin-login-error" role="alert">{error}</p>}
    <a className="connect-button admin-google-login" href={`/api/auth/google?next=${encodeURIComponent(next)}`}>Sign in with Google</a>
    {passwordEnabled && <>
      <button type="button" className="admin-owner-login-link" aria-expanded={ownerOpen} aria-controls="owner-login-form" onClick={() => setOwnerOpen(!ownerOpen)}>{ownerOpen ? 'Hide owner login' : 'Owner login'}</button>
      {ownerOpen && <form id="owner-login-form" className="admin-login-form" action="/api/admin/login" method="post">
        <input type="hidden" name="next" value={next} />
        <label>Password<input autoFocus name="password" type="password" autoComplete="current-password" required /></label>
        <button className="connect-button" type="submit">Enter library</button>
      </form>}
    </>}
  </div>;
}
