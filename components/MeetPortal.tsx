'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

type ClientManifest = {
  serverUrl: string;
  staticAssetsPath: string;
  css: string[];
  js: { src: string; module: boolean }[];
  error?: string;
};

declare global {
  interface Window {
    plugNmeetConfig?: {
      serverUrl: string;
      staticAssetsPath: string;
      enableSimulcast: boolean;
      enableDynacast: boolean;
    };
  }
}

function addStylesheet(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function addScript(src: string, module: boolean) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    if (module) script.type = 'module';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('A meeting interface file could not be loaded.'));
    document.body.appendChild(script);
  });
}

export function MeetPortal() {
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [hosting, setHosting] = useState(false);
  const requestedRole = useRef<'guest' | 'host'>('guest');
  const [busy, setBusy] = useState(false);
  const [loadingClient, setLoadingClient] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState('');
  const [fallbackReady, setFallbackReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('access_token') ?? '');
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let fallbackServerUrl = '';
    setLoadingClient(true);

    (async () => {
      const response = await fetch('/api/meet/client-files');
      const manifest = await response.json() as ClientManifest;
      if (!response.ok || manifest.error) throw new Error(manifest.error || 'The meeting interface is unavailable.');
      if (cancelled) return;
      fallbackServerUrl = manifest.serverUrl;
      window.plugNmeetConfig = {
        serverUrl: manifest.serverUrl,
        staticAssetsPath: manifest.staticAssetsPath,
        enableSimulcast: true,
        enableDynacast: true,
      };
      manifest.css.forEach(addStylesheet);
      for (const script of manifest.js) {
        if (cancelled) return;
        await addScript(script.src, script.module);
      }
      if (!cancelled) setLoadingClient(false);
    })().catch((cause) => {
      if (!cancelled) {
        if (fallbackServerUrl) {
          const url = new URL('/', fallbackServerUrl);
          url.searchParams.set('access_token', token);
          setFallbackUrl(url.toString());
        } else {
          setError(cause instanceof Error ? cause.message : 'The meeting interface is unavailable.');
        }
        setLoadingClient(false);
      }
    });

    return () => { cancelled = true; };
  }, [token]);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const joiningAsHost = requestedRole.current === 'host';
    if (joiningAsHost && !password.trim()) {
      setError('Please enter the host password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/meet/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password: joiningAsHost ? password : '', hosting: joiningAsHost, website: '' }),
      });
      const result = await response.json() as { token?: string; error?: string };
      if (!response.ok || !result.token) throw new Error(result.error || 'We could not open the meeting room.');
      window.location.replace(`/meet/?access_token=${encodeURIComponent(result.token)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not open the meeting room.');
      setBusy(false);
    }
  }

  if (token) {
    if (fallbackUrl) {
      return <main className="meet-client-shell">
        {!fallbackReady && <div className="meet-client-status"><span />Opening the meeting room…</div>}
        <iframe
          className="meet-client-frame"
          src={fallbackUrl}
          title="TranterGrey video meeting"
          allow="camera; microphone; display-capture; fullscreen; autoplay; clipboard-read; clipboard-write"
          allowFullScreen
          onLoad={() => setFallbackReady(true)}
        />
      </main>;
    }
    return <main className="meet-client-shell">
      {loadingClient && <div className="meet-client-status"><span />Opening the meeting room…</div>}
      {error && <div className="meet-client-status meet-client-error"><p>{error}</p><a href="/meet/">Return to the meeting page</a></div>}
      <div id="plugNmeet-app" />
    </main>;
  }

  return <main className="meet-entry">
    <a className="meet-wordmark" href="/" aria-label="TranterGrey home"><img src="/assets/tg-logo-white-red.png" alt="TranterGrey" /></a>
    <section className="meet-entry-card">
      <p className="eyebrow">TranterGrey video meeting</p>
      <h1>Let&apos;s<br /><em>Meet</em></h1>
      <p className="meet-intro">Enter your name to join the meeting. You&apos;ll wait here until a host lets you in.</p>
      <form onSubmit={join}>
        <label><span>Your name</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required minLength={2} maxLength={80} autoFocus /></label>
        {hosting && <div className="meet-host-fields" id="meet-host-fields">
          <label><span>Host password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" aria-required="true" maxLength={160} autoFocus /></label>
          <p>Hosts can admit guests and manage the room.</p>
        </div>}
        <input className="meet-honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <div className="meet-role-actions" aria-label="Choose how to join">
          <button
            className={hosting ? 'meet-role-button' : 'meet-role-button is-active'}
            type="submit"
            value="guest"
            disabled={busy}
            onClick={() => {
              requestedRole.current = 'guest';
              setHosting(false);
              setPassword('');
            }}
          >{busy && requestedRole.current === 'guest' ? 'Opening…' : 'Join as guest'} <span aria-hidden="true">↗</span></button>
          <button
            className={hosting ? 'meet-role-button is-active' : 'meet-role-button'}
            type={hosting ? 'submit' : 'button'}
            value="host"
            disabled={busy}
            aria-expanded={hosting}
            aria-controls="meet-host-fields"
            onClick={() => {
              requestedRole.current = 'host';
              if (!hosting) {
                setHosting(true);
                setError('');
              }
            }}
          >{busy && requestedRole.current === 'host' ? 'Opening…' : 'Join as host'} <span aria-hidden="true">↗</span></button>
        </div>
        {error && <p className="meet-error" role="alert">{error}</p>}
      </form>
    </section>
    <p className="meet-footnote">Private link · Not listed in site navigation</p>
  </main>;
}
