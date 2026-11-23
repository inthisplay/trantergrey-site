'use client';
import { useEffect,useState } from 'react';
import { hqRequest } from './ClientHQ';
import styles from './ClientHQ.module.css';
type Status={connected:boolean;ready:boolean;account:string|null;needsReconnect:boolean};
const outcomes:Record<string,string>={connected:'Google Drive connected.',cancelled:'Connection cancelled. You can try again whenever you’re ready.',expired:'The connection request expired. Start a new connection.', 'session-expired':'Sign in again, then connect Google Drive.',scope:'Google Drive access was not granted. Reconnect and allow the requested Drive access.',account:'Choose a verified trantergrey.com Workspace account.',access:'That account cannot access the TranterGrey Media Shared Drive.',offline:'Google did not return offline access. Try reconnecting with consent.',failed:'Google Drive could not be connected. Please try again.'};
export function ClientDriveConnection({client,onStatus}:{client?:string;onStatus?:(connected:boolean)=>void}) {
  const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function load(){const value=await hqRequest('/api/admin/client-drive-connection');setStatus(value);onStatus?.(value.connected);}
  useEffect(()=>{void load().catch(e=>setError(e.message));const result=new URLSearchParams(location.search).get('drive');if(result)setMessage(outcomes[result] || outcomes.failed);},[]);
  async function connect(){setBusy(true);setError('');try{const result=await hqRequest('/api/admin/client-drive-connection',{action:'connect',client,teamApp:location.pathname.startsWith('/app/')});location.assign(result.authorizationUrl);}catch(e){setError((e as Error).message);setBusy(false);}}
  async function disconnect(){if(!confirm('Disconnect Google Drive for everyone using this environment? Files and client-folder links will stay intact.'))return;setBusy(true);setError('');try{await hqRequest('/api/admin/client-drive-connection',{action:'disconnect'});setMessage('Google Drive disconnected.');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <div className={styles.driveConnection}>
    {message && <p role="status">{message}</p>}{error && <p role="alert" className={styles.error}>{error}</p>}
    {!status ? <p>Checking Google Drive connection…</p> : <>
      <p>{status.connected?`Connected as ${status.account}`:status.needsReconnect?'Google Drive needs to be reconnected.':'Connect Google Drive to browse client files.'}</p>
      {!status.connected && <p className={styles.connectionHint}>Use an organization-controlled account with access to TranterGrey Media. This connection lets all signed-in admins browse linked client folders and add files to their Client HQ subfolders.</p>}
      {!status.ready && <p className={styles.connectionHint}>Google Drive connection setup is incomplete on this server.</p>}
      <div className={styles.actions}><button type="button" disabled={busy || !status.ready} onClick={()=>void connect()}>{busy?'Please wait…':status.account?'Reconnect Google Drive':'Connect Google Drive'}</button>{status.account && <button type="button" disabled={busy} onClick={()=>void disconnect()}>Disconnect</button>}</div>
    </>}
  </div>;
}
