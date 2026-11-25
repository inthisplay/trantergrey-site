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
    if (query.get('error') === 'google-config') setError('Google sign-in is still being configured.');
    if (query.get('error') === 'google') setError('Google sign-in could not be verified. Please try again.');
    if (query.get('error') === 'access') setError('Your access is not active. Ask the site owner to enable your team account.');
    if (query.get('error') === 'domain') setError('Please sign in with your @trantergrey.com account.');
  }, []);
  return <div className="admin-login-options">
    {error && <p className="admin-login-error" role="alert">{error}</p>}
    <a className="connect-button admin-google-login" href={`/api/auth/google?next=${encodeURIComponent(next)}`}>Sign in with Google</a>
  </div>;
}
