'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from '@/app/app/inbox.module.css';
type Item={id:string;title:string;body:string;href:string;createdAt:string;readAt:string|null};
type Inbox={items:Item[];unread:number;nextCursor:string|null;publicKey:string|null;email:string};
export async function inboxRequest(body?:unknown,query='') {
  const r=await fetch('/api/admin/inbox'+query,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const json=await r.json();
  if(!r.ok)throw new Error(json.error?.message||'The inbox is temporarily unavailable.');
  return json.data;
}
export function InboxBell() {
  const [unread,setUnread]=useState(0);
  useEffect(()=>{
    let active=true;
    const refresh=()=>{if(document.visibilityState!=='visible')return;void inboxRequest(undefined,'?limit=1').then(data=>{if(active)setUnread(data.unread);}).catch(()=>{if(active)setUnread(0);});};
    const pushed=()=>refresh();navigator.serviceWorker?.addEventListener('message',pushed);
    refresh();const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);window.addEventListener('tg-inbox-changed',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{active=false;clearInterval(timer);navigator.serviceWorker?.removeEventListener('message',pushed);window.removeEventListener('focus',refresh);window.removeEventListener('tg-inbox-changed',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  return <><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span className={styles.srOnly}>Inbox{unread?`, ${unread} unread`:''}</span>{unread>0&&<span className={styles.badge}>{unread>99?'99+':unread}</span>}</>;
}
export function TeamInbox() {
  const [data,setData]=useState<Inbox|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[push,setPush]=useState('Checking this device…'),[enabled,setEnabled]=useState(false);
  const testId=useRef<string|null>(null);
  const load=useCallback(async()=>{const value=await inboxRequest() as Inbox;setData(value);window.dispatchEvent(new Event('tg-inbox-changed'));return value;},[]);
  const checkDevice=useCallback(async()=>{
    if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){setPush('Push is not available here. On iPhone or iPad, add this app to your Home Screen and open it there.');return;}
    if(Notification.permission==='denied'){setPush('Notifications are blocked. Allow them in your browser or device settings, then return here.');return;}
    const registration=await navigator.serviceWorker.getRegistration('/app/');const subscription=await registration?.pushManager.getSubscription();
    const current=subscription?await inboxRequest({action:'subscription-status',endpoint:subscription.endpoint}):null;
    setEnabled(!!current?.enabled);setPush(current?.enabled?'Push is enabled on this device.':'Push is off on this device. Your inbox still saves every update.');
  },[]);
  useEffect(()=>{void load().then(checkDevice).catch(e=>setError(e.message));},[load,checkDevice]);
  useEffect(()=>{const pushed=(event:MessageEvent)=>{if(event.data?.type==='tg-inbox-push')void load().then(()=>setMessage('A new team update just arrived.')).catch(e=>setError(e.message));};navigator.serviceWorker?.addEventListener('message',pushed);return()=>navigator.serviceWorker?.removeEventListener('message',pushed);},[load]);
  async function run(action:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await action();}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}
  async function enable(){
    if(!data?.publicKey)throw new Error('Push is not available yet. Your inbox still works.');
    if(!('Notification' in window)||!('PushManager' in window))throw new Error('Open the installed Home Screen app to enable push on iPhone or iPad.');
    // The permission prompt must follow the user's tap without an earlier network await.
    const permission=await Notification.requestPermission();
    if(permission!=='granted'){await checkDevice();return;}
    await navigator.serviceWorker.register('/sw.js',{scope:'/app/'});
    const registration=await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('The app is updating. Reload and try again.')),10000))]);
    let subscription=await registration.pushManager.getSubscription();
    const key=Uint8Array.from(atob(data.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const oldKey=subscription?.options.applicationServerKey;
    if(subscription&&oldKey&&String(new Uint8Array(oldKey))!==String(key)){await subscription.unsubscribe();subscription=null;}
    if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    await inboxRequest({action:'subscribe',subscription:subscription.toJSON()});await checkDevice();
  }
  async function disable(){
    const registration=await navigator.serviceWorker.getRegistration('/app/');const subscription=await registration?.pushManager.getSubscription();
    if(subscription){await inboxRequest({action:'unsubscribe',endpoint:subscription.endpoint});await subscription.unsubscribe();}
    await checkDevice();
  }
  async function read(item:Item){await inboxRequest({action:'read',id:item.id});await load();}
  return <section className={styles.page}>
    <header className={styles.header}><p>TG TEAM</p><h1>Inbox</h1><span>{data?`${data.unread} unread`:'Your team updates, in one place.'}</span></header>
    <section className={styles.settings} aria-label="Notification settings"><h2>Notifications on this device</h2><p>{push}</p><p className={styles.hint}>Push shows a private “New team update” alert. Open it to read the message here.</p><div className={styles.actions}><button disabled={busy||!data} onClick={()=>void run(enabled?disable:enable)}>{enabled?'Turn off push':'Enable notifications'}</button><button disabled={busy||!data} onClick={()=>void run(async()=>{testId.current ||= crypto.randomUUID();await inboxRequest({action:'test',requestId:testId.current});testId.current=null;await load();setMessage('Test saved to your inbox. If push is enabled, an alert is queued for this device.');})}>Send me a test</button></div></section>
    {error&&<p role="alert" className={styles.error}>{error} {!data&&<a href="/login?next=/app/inbox">Sign in</a>} <button onClick={()=>void run(async()=>{await load();await checkDevice();})}>Retry</button></p>}
    {message&&<p role="status">{message}</p>}
    <div className={styles.list}>{data?.items.length===0&&<p className={styles.empty}>You’re all caught up. Team updates will appear here.</p>}{data?.items.map(item=><article key={item.id} className={`${styles.item} ${item.readAt?'':styles.unread}`}><div><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>{!item.readAt&&<span>Unread</span>}</div><h2>{item.title}</h2><p>{item.body}</p><div className={styles.actions}><a href={item.href} onClick={event=>{event.preventDefault();void run(async()=>{await inboxRequest({action:'read',id:item.id});window.location.assign(item.href);});}}>Open</a>{!item.readAt&&<button disabled={busy} onClick={()=>void run(()=>read(item))}>Mark read</button>}</div></article>)}</div>
    {data?.nextCursor&&<button className={styles.more} disabled={busy} onClick={()=>void run(async()=>{const next=await inboxRequest(undefined,'?cursor='+encodeURIComponent(data.nextCursor!));setData({...data,items:[...data.items,...next.items],nextCursor:next.nextCursor,unread:next.unread});})}>Load older updates</button>}
  </section>;
}
