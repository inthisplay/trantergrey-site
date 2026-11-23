// Owner-only production smoke check. Exercises OAuth and read tools; does not modify business records.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const origin='https://trantergrey-deck-mcp-trial.t-jackson.workers.dev';
const redirectUri='https://chatgpt.com/connector_platform_oauth_redirect';
const accessCode=(await readFile('data/deck-mcp-trial-access.txt','utf8')).trim();
async function request(path,options={}) { return fetch(origin+path,{...options,redirect:'manual',signal:AbortSignal.timeout(30000)}); }
const registration=await request('/register',{method:'POST',body:JSON.stringify({redirect_uris:[redirectUri],token_endpoint_auth_method:'none'})});
assert.equal(registration.status,201,'OAuth registration');
const {client_id}=await registration.json();const verifier=crypto.randomUUID()+crypto.randomUUID();
const challenge=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))).toString('base64url');
const parameters={client_id,redirect_uri:redirectUri,response_type:'code',code_challenge_method:'S256',code_challenge:challenge,resource:origin+'/mcp',scope:'tg:personal'};
const consent=await request('/authorize?'+new URLSearchParams(parameters));assert.equal(consent.status,200,'Consent page');
const cookie=consent.headers.get('set-cookie').split(';')[0];const transaction=(await consent.text()).match(/name="transaction" value="([^"]+)"/)[1];
const approved=await request('/authorize',{method:'POST',headers:{origin,cookie},body:new URLSearchParams({transaction,access_code:accessCode})});assert.equal(approved.status,303,'Consent redirect');
const code=new URL(approved.headers.get('location')).searchParams.get('code');
const token=await request('/token',{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',code,client_id,code_verifier:verifier,redirect_uri:redirectUri,resource:origin+'/mcp'})});assert.equal(token.status,200,'Token exchange');
const initial=await token.json(); assert.ok(initial.refresh_token,'Refresh token issued');
const refreshResponse=await request('/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',refresh_token:initial.refresh_token,client_id,resource:origin+'/mcp'})});
assert.equal(refreshResponse.status,200,'Refresh exchange');
const renewed=await refreshResponse.json();assert.ok(renewed.refresh_token !== initial.refresh_token,'Refresh rotation');
const access_token=renewed.access_token;console.log('Refresh token issued and rotated successfully.');
const client=new Client({name:'tg-owner-readonly-smoke',version:'0.2.0'});
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${access_token}`}}}));
  const {tools}=await client.listTools();assert.equal(tools.length,24);console.log('Discovered 24 authenticated tools.');
  async function call(name,args={}) { const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,`${name} failed`);console.log(`${name}: passed`);return r.structuredContent; }
  const columns=await call('list_deck_columns');
  const cards=await call('search_deck_cards',{limit:1});
  if(cards.data[0]) { await call('get_deck_card',{cardId:cards.data[0].id});await call('get_deck_card_activity',{cardId:cards.data[0].id});await call('get_deck_card_comments',{cardId:cards.data[0].id,limit:2}); }
  const clients=await call('list_clients');
  const firstClient=clients.data.clients.find(c=>c.id);
  if(firstClient) { await call('get_client_workspace',{clientId:firstClient.id});await call('get_client_related',{clientId:firstClient.id}); }
  const videos=await call('search_videos',{limit:10});
  if(videos.data[0]) {await call('get_video',{assetId:videos.data[0].id});await call('list_video_cards',{assetId:videos.data[0].id});}
  await call('get_video_workspace');
  const publicVideo=videos.data.find(v=>v.playbackPolicy==='public'&&v.playbackId);
  if(publicVideo) await call('get_video_share_link',{assetIdOrSlug:publicVideo.id});
  const done=columns.columns.find(c=>/done|complete|delivered/i.test(c.name))||columns.columns[0];
  if(done) await call('report_deck_moves',{columnSourceId:done.id,limit:1});
  console.log('Read-only production smoke passed. No cards, comments, client items or video associations were changed.');
} finally {
  await client.close();
  const revoked=await request('/revoke',{method:'POST',body:new URLSearchParams({token:renewed.refresh_token,client_id})});assert.equal(revoked.status,200);
  const denied=await request('/mcp',{method:'POST',headers:{Authorization:`Bearer ${access_token}`},body:'{}'});assert.equal(denied.status,401,'Revoked access must fail');
  console.log('Smoke connection revoked; access denied as expected.');
}
