'use client';

import { useEffect, useState } from 'react';

export function AdminLogin() {
  const [next, setNext] = useState('/admin');
  const [error, setError] = useState('');
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const destination = query.get('next');
    if (destination?.startsWith('/') && !destination.startsWith('//')) setNext(destination);
    if (query.get('error') === '1') setError('That password did not match.');
    if (query.get('error') === 'config') setError('Private access is being configured. Please try again shortly.');
  }, []);
  return <form className="admin-login-form" action="/api/admin/login" method="post"><input type="hidden" name="next" value={next} />{error && <p className="admin-login-error">{error}</p>}<label>Password<input name="password" type="password" autoComplete="current-password" required /></label><button className="connect-button" type="submit">Enter library</button></form>;
}
