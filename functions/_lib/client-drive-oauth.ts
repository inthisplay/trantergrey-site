import { adminResponse, isTranterGreyEmail, type AdminEnvironment } from './admin';

export const DRIVE_SCOPE='https://www.googleapis.com/auth/drive';
export const sharedDriveId=(env:AdminEnvironment)=>env.GOOGLE_DRIVE_ID || '0AOX_kevBmpI_Uk9PVA';
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=(text:string)=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const random=()=>encode(crypto.getRandomValues(new Uint8Array(32)));
export const digest=async(text:string)=>encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))));
const sessionId=(request:Request)=>request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('tg_admin='))?.slice(9) || '';
export const driveOAuthReady=(env:AdminEnvironment)=>Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && /^[a-f0-9]{64}$/i.test(env.GOOGLE_DRIVE_ENCRYPTION_KEY || ''));
async function encryptionKey(env:AdminEnvironment) {
  if(!driveOAuthReady(env))throw new Error('Google Drive connection setup is incomplete on this server.');
  const bytes=Uint8Array.from(env.GOOGLE_DRIVE_ENCRYPTION_KEY!.match(/../g)!,n=>parseInt(n,16));
  return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
export async function encryptDriveSecret(env:AdminEnvironment,value:string) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('client-hq-drive-v1')},await encryptionKey(env),new TextEncoder().encode(value));
  return `v1.${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}
export async function decryptDriveSecret(env:AdminEnvironment,value:string) {
  const [version,iv,data]=value.split('.');if(version!=='v1' || !iv || !data)throw new Error('Reconnect Google Drive.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),additionalData:new TextEncoder().encode('client-hq-drive-v1')},await encryptionKey(env),decode(data)));
}
export async function connectionStatus(env:AdminEnvironment) {
  const row=await env.TG_DATA.prepare("SELECT account_email,drive_id,needs_reconnect FROM client_drive_connection WHERE id='organization'").first<{account_email:string;drive_id:string;needs_reconnect:number}>();
  return {connected:Boolean(row && !row.needs_reconnect && row.drive_id===sharedDriveId(env) && driveOAuthReady(env)),ready:driveOAuthReady(env),account:row?.account_email || null,needsReconnect:Boolean(row && (row.needs_reconnect || row.drive_id!==sharedDriveId(env)))};
}
export async function startDriveOAuth(request:Request,env:AdminEnvironment,client?:string) {
  if(!driveOAuthReady(env))throw new Error('Google Drive connection setup is incomplete on this server.');
  const redirect=env.GOOGLE_REDIRECT_URI || new URL('/api/auth/google/callback',request.url).toString();
  if(new URL(redirect).origin!==new URL(request.url).origin)throw new Error('The Google callback must use this website’s origin.');
  let destination='/admin/clients';
  if(client){if(!await env.TG_DATA.prepare('SELECT id FROM client_directory WHERE id=?').bind(client).first())throw new Error('Client not found.');destination+=`?client=${encodeURIComponent(client)}`;}
  const state='drive_'+random(),verifier=random();
  await env.TG_DATA.prepare('DELETE FROM client_drive_oauth_states WHERE expires_at<=?').bind(new Date().toISOString()).run();
  await env.TG_DATA.prepare('INSERT INTO client_drive_oauth_states(state_hash,session_hash,verifier_cipher,redirect_uri,destination,expires_at) VALUES(?,?,?,?,?,?)').bind(await digest(state),await digest(sessionId(request)),await encryptDriveSecret(env,verifier),redirect,destination,new Date(Date.now()+600000).toISOString()).run();
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID!,redirect_uri:redirect,response_type:'code',scope:`openid email ${DRIVE_SCOPE}`,access_type:'offline',prompt:'consent select_account',hd:'trantergrey.com',state,code_challenge:await digest(verifier),code_challenge_method:'S256'}).toString();
  return url.toString();
}
export async function driveOAuthCallback(request:Request,env:AdminEnvironment) {
  const url=new URL(request.url);
  const finish=(destination:string,result:string)=>{const to=new URL(destination,url.origin);to.searchParams.set('drive',result);return new Response(null,{status:303,headers:{Location:to.toString(),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});};
  if(await adminResponse(request,env))return finish('/admin/clients','session-expired');
  // Atomically consume a short-lived state bound to this exact admin session.
  const state=await env.TG_DATA.prepare('DELETE FROM client_drive_oauth_states WHERE state_hash=? AND session_hash=? AND expires_at>? RETURNING verifier_cipher,redirect_uri,destination').bind(await digest(url.searchParams.get('state') || ''),await digest(sessionId(request)),new Date().toISOString()).first<{verifier_cipher:string;redirect_uri:string;destination:string}>();
  if(!state)return finish('/admin/clients','expired');
  if(url.searchParams.has('error'))return finish(state.destination,'cancelled');
  const code=url.searchParams.get('code');if(!code)return finish(state.destination,'failed');
  try {
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID!,client_secret:env.GOOGLE_CLIENT_SECRET!,code,redirect_uri:state.redirect_uri,grant_type:'authorization_code',code_verifier:await decryptDriveSecret(env,state.verifier_cipher)})});
    const tokens=await response.json() as {access_token?:string;refresh_token?:string;scope?:string};
    if(!response.ok || !tokens.access_token)return finish(state.destination,'failed');
    if(!tokens.scope?.split(' ').includes(DRIVE_SCOPE))return finish(state.destination,'scope');
    const profileResponse=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:`Bearer ${tokens.access_token}`}});
    const profile=await profileResponse.json() as {email?:string;email_verified?:boolean;hd?:string};
    if(!profileResponse.ok || typeof profile.email!=='string' || !profile.email_verified || profile.hd!=='trantergrey.com' || !isTranterGreyEmail(profile.email))return finish(state.destination,'account');
    const access=await fetch(`https://www.googleapis.com/drive/v3/drives/${encodeURIComponent(sharedDriveId(env))}?fields=id,name`,{headers:{Authorization:`Bearer ${tokens.access_token}`}});
    if(!access.ok)return finish(state.destination,'access');
    if(!tokens.refresh_token)return finish(state.destination,'offline');
    const encrypted=await encryptDriveSecret(env,tokens.refresh_token);
    await env.TG_DATA.prepare("INSERT INTO client_drive_connection(id,refresh_cipher,account_email,drive_id,connected_at,needs_reconnect) VALUES('organization',?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET refresh_cipher=excluded.refresh_cipher,account_email=excluded.account_email,drive_id=excluded.drive_id,connected_at=excluded.connected_at,needs_reconnect=0").bind(encrypted,profile.email.toLowerCase(),sharedDriveId(env),new Date().toISOString()).run();
    return finish(state.destination,'connected');
  }catch{return finish(state.destination,'failed');}
}
