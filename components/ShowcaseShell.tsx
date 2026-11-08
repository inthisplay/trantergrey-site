'use client';

import { useEffect, useState } from 'react';
import { SiteHeader } from './SiteHeader';
import styles from '@/app/showcase/showcase.module.css';

type Asset = { id: string; title: string; client: string; playerUrl: string };
export function ShowcaseShell() {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch(`/api/showcase${window.location.search}`, { cache: 'no-store' }).then(async (response) => {
      const payload = await response.json() as { assets?: Asset[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'This showcase is unavailable.');
      setAssets(payload.assets ?? []);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'This showcase is unavailable.'));
  }, []);
  return <main className={styles.page}><SiteHeader /><section className={styles.shell}><header className={styles.intro}><div><p>TranterGrey showcase</p><h1>Selected work.</h1></div>{assets && assets.length > 0 && <span>{assets.length} {assets.length === 1 ? 'film' : 'films'}</span>}</header>
    {assets === null ? <div className={styles.empty}><p>TranterGrey showcase</p><h1>{error || 'Opening showcase…'}</h1></div> : assets.length ? <div className={styles.grid}>{assets.map((asset) => <article className={styles.card} key={asset.id}><div className={styles.player}><iframe src={asset.playerUrl} title={asset.title} loading="lazy" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div><div className={styles.copy}>{asset.client && <p>{asset.client}</p>}<h2>{asset.title}</h2></div></article>)}</div> : <div className={styles.empty}><p>TranterGrey showcase</p><h1>This showcase has no available videos.</h1></div>}
    <p className={styles.end}>TranterGrey · Marketing in motion.</p></section></main>;
}
