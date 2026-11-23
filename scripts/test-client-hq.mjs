import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir=await mkdtemp(join(tmpdir(),'tg-client-hq-'));
const handlers={};
for(const [name,path] of Object.entries({unbranded:'functions/_lib/unbranded-page.ts',publicLogo:'functions/api/watch/[slug]/logo.ts',publicWatch:'functions/_lib/mux-public.ts',logo:'functions/api/admin/client-logo.ts',preferences:'functions/api/admin/client-preferences.ts',preferenceSort:'lib/client-preferences.ts',internalHQ:'functions/api/internal/v1/client-hq.ts',history:'functions/api/admin/production-board/history.ts',pins:'functions/api/admin/client-drive-pins.ts',hq:'functions/api/admin/client-hq.ts',clients:'functions/api/admin/clients.ts',browse:'functions/_lib/mux-library.ts',drive:'functions/api/admin/client-hq-drive.ts',driveLib:'functions/_lib/client-drive.ts',todo:'lib/client-todo.ts',oauth:'functions/_lib/client-drive-oauth.ts',connection:'functions/api/admin/client-drive-connection.ts'})){
  await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',outfile:join(dir,name+'.mjs')});handlers[name]=await import(pathToFileURL(join(dir,name+'.mjs')));
}
after(()=>rm(dir,{recursive:true,force:true}));
test('Drive thumbnails use edge-compatible redirects and reject unsafe destinations or non-images',async()=>{
  const original=globalThis.fetch;let calls=[];
  try{
    globalThis.fetch=async(url,init)=>{calls.push(String(url));assert.equal(init.redirect,'manual');return calls.length===1?new Response(null,{status:302,headers:{location:'https://lh3.googleusercontent.com/preview'}}):new Response('image',{headers:{'content-type':'image/png'}});};
    const image=await handlers.driveLib.driveThumbnail('token','https://drive.google.com/thumbnail');
    assert.equal(await image.text(),'image');assert.equal(calls.length,2);
    calls=[];globalThis.fetch=async()=>{calls.push('fetch');return new Response(null,{status:302,headers:{location:'https://untrusted.example/preview'}});};
    assert.equal(await handlers.driveLib.driveThumbnail('token','https://drive.google.com/thumbnail'),null);assert.equal(calls.length,1);
    globalThis.fetch=async()=>new Response('<html>Sign in</html>',{headers:{'content-type':'text/html'}});
    assert.equal(await handlers.driveLib.driveThumbnail('token','https://lh3.googleusercontent.com/preview'),null);
  }finally{globalThis.fetch=original;}
});
const itemRequestMigration=await readFile('migrations/0053_mcp_item_requests.sql','utf8');
const logoMigration=await readFile('migrations/0049_client_logos.sql','utf8');
const migration=await readFile('migrations/0026_client_hq.sql','utf8');
const richNoteMigration=(await readFile('migrations/0028_client_note_rich_text.sql','utf8'))+(await readFile('migrations/0029_client_note_editor_json.sql','utf8'))+(await readFile('migrations/0030_client_todo_completed_at.sql','utf8'))+(await readFile('migrations/0031_client_drive_connection.sql','utf8'))+(await readFile('migrations/0032_client_drive_extra_folders.sql','utf8'))+(await readFile('migrations/0033_client_drive_pins.sql','utf8'))+(await readFile('migrations/0034_client_activity.sql','utf8'));
test('Drive OAuth encrypts credentials, binds one-time state to a session, checks scope/account/access',async()=>{
  const {db,env,request}=fixture();const original=globalThis.fetch;
  Object.assign(env,{GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'secret',GOOGLE_DRIVE_ENCRYPTION_KEY:'12'.repeat(32),GOOGLE_REDIRECT_URI:'https://local.test/api/auth/google/callback'});
  const api=req=>handlers.connection.onRequest({env,request:req});
  let failure='',exchanges=0;
  globalThis.fetch=async(url,init)=>{
    const path=new URL(url).pathname;
    if(path==='/token'){exchanges++;assert.ok(init.body.get('code_verifier'));return Response.json({access_token:'access',refresh_token:'refresh-secret',scope:failure==='scope'?'openid':handlers.oauth.DRIVE_SCOPE});}
    if(path.endsWith('/userinfo'))return Response.json({email:failure==='account'?'outsider@example.com':'owner@trantergrey.com',email_verified:true,hd:failure==='account'?'example.com':'trantergrey.com'});
    if(path.includes('/drives/'))return failure==='access'?new Response('',{status:403}):Response.json({id:'shared'});
    throw new Error('Unexpected fetch '+url);
  };
  const start=async()=>{
    const response=await api(request('client-drive-connection',{action:'connect'}));assert.equal(response.status,200);
    const {authorizationUrl}=await response.json();const url=new URL(authorizationUrl);
    assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
    return url.searchParams.get('state');
  };
  const callback=(state,session='test')=>handlers.oauth.driveOAuthCallback(new Request('https://local.test/api/auth/google/callback?code=code&state='+state,{headers:{cookie:'tg_admin='+session}}),env);
  try{
    assert.equal((await api(request('client-drive-connection',{action:'connect'},false))).status,401);
    assert.equal((await api(new Request('https://local.test/api/admin/client-drive-connection',{method:'POST',headers:{cookie:'tg_admin=test',origin:'https://evil.test'},body:'{"action":"connect"}'}))).status,403);
    const cipher=await handlers.oauth.encryptDriveSecret(env,'credential');assert.ok(!cipher.includes('credential'));assert.equal(await handlers.oauth.decryptDriveSecret(env,cipher),'credential');
    await assert.rejects(()=>handlers.oauth.decryptDriveSecret({...env,GOOGLE_DRIVE_ENCRYPTION_KEY:'34'.repeat(32)},cipher));
    const state=await start();
    db.prepare('INSERT INTO admin_sessions VALUES(?,?,?,?)').run('other','Other','other@trantergrey.com','9999-01-01');
    assert.match((await callback(state,'other')).headers.get('location'),/drive=expired/);assert.equal(exchanges,0);
    assert.match((await callback(state)).headers.get('location'),/drive=connected/);assert.equal(exchanges,1);
    assert.match((await callback(state)).headers.get('location'),/drive=expired/);assert.equal(exchanges,1);
    const stored=db.prepare('SELECT * FROM client_drive_connection').get();assert.ok(!stored.refresh_cipher.includes('refresh-secret'));assert.equal(await handlers.oauth.decryptDriveSecret(env,stored.refresh_cipher),'refresh-secret');
    const status=await (await api(request('client-drive-connection'))).json();assert.equal(status.connected,true);assert.equal(status.account,'owner@trantergrey.com');assert.ok(!JSON.stringify(status).includes('refresh'));
    for(failure of ['scope','account','access']){assert.match((await callback(await start())).headers.get('location'),new RegExp('drive='+failure));assert.equal(db.prepare('SELECT refresh_cipher FROM client_drive_connection').get().refresh_cipher,stored.refresh_cipher);}
    failure='';const expired=await start();db.exec("UPDATE client_drive_oauth_states SET expires_at='2000-01-01'");assert.match((await callback(expired)).headers.get('location'),/drive=expired/);
    const cancel=await start();assert.match((await handlers.oauth.driveOAuthCallback(new Request('https://local.test/api/auth/google/callback?error=access_denied&state='+cancel,{headers:{cookie:'tg_admin=test'}}),env)).headers.get('location'),/drive=cancelled/);
    await api(request('client-drive-connection',{action:'disconnect'}));assert.equal(db.prepare('SELECT COUNT(*) n FROM client_drive_connection').get().n,0);
  }finally{db.close();globalThis.fetch=original;}
});

test('Drive folder workflow uses exact IDs, creates one managed folder, browses extra roots, and scopes uploads',async()=>{
  const {db,env,request}=fixture();const original=globalThis.fetch;
  Object.assign(env,{GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'secret',GOOGLE_DRIVE_ENCRYPTION_KEY:'12'.repeat(32),GOOGLE_DRIVE_ID:'root'});
  const id=db.prepare('SELECT id FROM client_directory').get().id;
  const cipher=await handlers.oauth.encryptDriveSecret(env,'refresh-secret');
  db.prepare("INSERT INTO client_drive_connection VALUES('organization',?,?,?,?,0)").run(cipher,'owner@trantergrey.com','root','now');
  const folders=new Map([['root',{id:'root',name:'TranterGrey Media',mimeType:'application/vnd.google-apps.folder'}],['legacy',{id:'legacy',name:'Different client spelling',mimeType:'application/vnd.google-apps.folder',parents:['root']}],['extra',{id:'extra',name:'More assets',mimeType:'application/vnd.google-apps.folder',parents:['root']}],['outside',{id:'outside',name:'Other drive',mimeType:'application/vnd.google-apps.folder',parents:[]}]]);
  let created=0,uploadText='',revoked=false;
  globalThis.fetch=async(url,init={})=>{
    const u=new URL(url);
    if(u.pathname==='/token')return revoked?Response.json({error:'invalid_grant'},{status:400}):Response.json({access_token:'access'});
    if(u.pathname.includes('/upload/')){uploadText=await init.body.text();return Response.json({id:'uploaded'});}
    if(u.pathname.endsWith('/files') && init.method==='POST'){const body=JSON.parse(init.body);const folder={...body,id:'created-'+(++created)};folders.set(folder.id,folder);return Response.json(folder);}
    if(u.pathname.endsWith('/files')){const parent=u.searchParams.get('q').match(/^'([^']+)'/)[1];return Response.json({files:[...folders.values()].filter(f=>f.parents?.includes(parent))});}
    const folder=folders.get(u.pathname.split('/').at(-1));return folder?Response.json(folder):new Response('',{status:404});
  };
  const api=(body,suffix='')=>handlers.drive.onRequest({env,request:request('client-hq-drive?client='+id+suffix,body)});
  try{
    assert.equal((await api({action:'link',folder:'outside'})).status,400);
    assert.equal((await api({action:'link',folder:'root'})).status,400);
    assert.equal((await api({action:'link',folder:'legacy'})).status,200);assert.equal(created,1);
    assert.equal((await api({action:'link',folder:'legacy'})).status,200);assert.equal(created,1);
    const client=db.prepare('SELECT * FROM client_directory').get();assert.equal(client.drive_folder_id,'legacy');assert.equal(client.drive_managed_folder_id,'created-1');
    const managed=await (await api(undefined,'&managed=1')).json();assert.equal(managed.folder.id,'created-1');assert.deepEqual(managed.files,[]);
    assert.equal((await api(undefined,'&managed=1&folder=legacy')).status,400);
    assert.equal((await api({action:'link-extra',folder:'extra'})).status,200);assert.equal(created,1);
    assert.equal((await api(undefined,'&root=extra')).status,200);
    const pins=body=>handlers.pins.onRequest({env,request:request('client-drive-pins?client='+id,body)});
    assert.equal((await handlers.pins.onRequest({env,request:request('client-drive-pins?client='+id,undefined,false)})).status,401);
    assert.equal((await pins({action:'pin',root:'legacy',folder:'outside'})).status,400);
    assert.equal((await pins({action:'pin',root:'outside',folder:'outside'})).status,400);
    assert.equal((await pins({action:'pin',root:'legacy',folder:'created-1'})).status,200);
    await pins({action:'rename',folder:'created-1',name:'Deliverables'});
    await pins({action:'pin',root:'legacy',folder:'created-1'});
    assert.equal((await (await pins()).json()).pins.length,1);
    assert.equal((await (await pins()).json()).pins[0].name,'Deliverables');
    await pins({action:'pin',root:'extra',folder:'extra'});
    await pins({action:'move',folder:'extra',direction:'up'});
    assert.deepEqual((await (await pins()).json()).pins.map(p=>p.folder_id),['extra','created-1']);
    assert.equal(folders.get('created-1').name,'Client HQ');
    await pins({action:'remove',folder:'created-1'});
    assert.equal(folders.has('created-1'),true);

    const hierarchy=await (await api(undefined,'&folder=created-1')).json();
    assert.deepEqual(hierarchy.path.map(f=>f.id),['root','legacy','created-1']);
    assert.equal((await api(undefined,'&root=outside')).status,400);
    const form=new FormData();form.append('file',new File(['test'],'sample.txt',{type:'text/plain'}));
    assert.equal((await handlers.drive.onRequest({env,request:new Request('https://local.test/api/admin/client-hq-drive?client='+id,{method:'POST',headers:{cookie:'tg_admin=test',origin:'https://local.test'},body:form})})).status,200);
    assert.match(uploadText,/"parents":\["created-1"\]/);
    await api({action:'unlink-extra',folder:'extra'});assert.deepEqual((await (await pins()).json()).pins,[]);assert.equal(folders.has('extra'),true);assert.equal((await api(undefined,'&root=extra')).status,400);
    assert.equal((await api({action:'unlink-primary',folder:'wrong'})).status,400);
    assert.equal((await api({action:'unlink-primary',folder:'legacy'})).status,200);
    const unlinked=db.prepare('SELECT drive_folder_id,drive_managed_folder_id FROM client_directory').get();
    assert.equal(unlinked.drive_folder_id,null);assert.equal(unlinked.drive_managed_folder_id,null);
    assert.equal(folders.has('legacy'),true);assert.equal(folders.has('created-1'),true);
    revoked=true;assert.equal((await api()).status,400);assert.equal(db.prepare('SELECT needs_reconnect FROM client_drive_connection').get().needs_reconnect,1);
  }finally{db.close();globalThis.fetch=original;}
});
test('to-do archive begins after 30 days, survives edits, and resets on reopening',async()=>{
  const {db,hq}=fixture();try {
    const workspace_id=db.prepare('SELECT id FROM client_directory').get().id;
    await hq({workspace_id,kind:'todo',title:'Archive test'});
    let item=db.prepare('SELECT * FROM client_workspace_items').get();
    assert.equal(item.completed_at,null);
    await hq({...item,completed:1,completed_at:'2000-01-01'});
    item=db.prepare('SELECT * FROM client_workspace_items').get();
    assert.ok(Date.now()-Date.parse(item.completed_at)<5000);
    const threshold=Date.parse(item.completed_at)+handlers.todo.TODO_ARCHIVE_AFTER_MS;
    assert.equal(handlers.todo.isArchivedTodo(item,threshold),false);
    assert.equal(handlers.todo.isArchivedTodo(item,threshold+1),true);
    assert.equal(handlers.todo.isArchivedTodo({...item,kind:'note'},threshold+1),false);
    const oldDate=new Date(Date.now()-31*86400000).toISOString();
    db.prepare('UPDATE client_workspace_items SET completed_at=? WHERE id=?').run(oldDate,item.id);
    await hq({...item,title:'Edited completed task'});
    item=db.prepare('SELECT * FROM client_workspace_items').get();
    assert.equal(item.completed_at,oldDate);assert.equal(handlers.todo.isArchivedTodo(item),true);
    const other=(await (await hq({action:'client',name:'Other workspace'})).json()).id;
    await hq({...item,workspace_id:other,completed:0});
    assert.equal(db.prepare('SELECT completed_at FROM client_workspace_items WHERE id=?').get(item.id).completed_at,oldDate);
    await hq({...item,completed:0});
    item=db.prepare('SELECT * FROM client_workspace_items').get();
    assert.equal(item.completed_at,null);assert.equal(handlers.todo.isArchivedTodo(item),false);
    await hq({...item,completed:1});
    item=db.prepare('SELECT * FROM client_workspace_items').get();
    assert.ok(Date.now()-Date.parse(item.completed_at)<5000);assert.equal(handlers.todo.isArchivedTodo(item),false);
  } finally { db.close(); }
});
test('Deck editor notes retain Mux embeds and reject unsafe URLs',async()=>{
  const {db,hq}=fixture();try {
    const workspace_id=db.prepare('SELECT id FROM client_directory').get().id;
    const value=[{type:'paragraph',align:'center',children:[{text:'Review this',bold:true}]},{type:'mux-asset',assetId:'abcdef123',title:'Campaign',href:'/watch/abcdef123',media:[{title:'Campaign',playerUrl:'https://player.mux.com/abcdef123'}],children:[{text:''}]}];
    const body_json=JSON.stringify(value);
    assert.equal((await hq({workspace_id,kind:'note',title:'Video review',body_json})).status,200);
    const item=(await (await hq(undefined,`client-hq?id=${workspace_id}`)).json()).items[0];
    assert.equal(item.body_json,body_json);assert.match(item.body,/<strong>Review this<\/strong>/);assert.match(item.body,/text-align:center/);assert.match(item.body,/iframe src="https:\/\/player.mux.com\/abcdef123"/);
    await hq({...item,title:'Updated review'});
    assert.equal(db.prepare('SELECT body_json FROM client_workspace_items WHERE id=?').get(item.id).body_json,body_json);
    value[1].href='javascript:alert(1)';
    assert.equal((await hq({...db.prepare('SELECT * FROM client_workspace_items WHERE id=?').get(item.id),body_json:JSON.stringify(value)})).status,400);
  } finally { db.close(); }
});
test('rich notes retain formatting safely and legacy text remains literal',async()=>{
  const {db,hq}=fixture();try {
    const workspace_id=db.prepare('SELECT id FROM client_directory').get().id;
    await hq({workspace_id,kind:'note',title:'Legacy',body:'<b>literal</b>\nSecond line'});
    await hq({workspace_id,kind:'note',title:'Rich',body_format:'html',body:'<h2 onclick="alert(1)">Heading</h2><p><b>Bold</b></p><script>alert(1)</script><img src=x onerror=alert(1)><ul class="production-note-checklist"><li><input type="checkbox" checked><span>Done</span></li></ul>'});
    const items=(await (await hq(undefined,`client-hq?id=${workspace_id}`)).json()).items;
    const legacy=items.find(i=>i.title==='Legacy');
    assert.equal(legacy.body_format,'text');assert.equal(legacy.body,'<b>literal</b>\nSecond line');
    const rich=items.find(i=>i.title==='Rich');
    assert.equal(rich.body_format,'html');assert.match(rich.body,/<h2>Heading<\/h2>/);assert.match(rich.body,/<input type="checkbox" checked>/);assert.doesNotMatch(rich.body,/script|onclick|onerror|img/);
    await hq({...rich,body:'<p><i>Edited</i></p>'});
    assert.equal(db.prepare('SELECT body FROM client_workspace_items WHERE id=?').get(rich.id).body,'<p><i>Edited</i></p>');
  } finally { db.close(); }
});
function fixture(){
  const db=new DatabaseSync(':memory:');db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE admin_sessions(id TEXT,user_name TEXT,user_email TEXT,expires_at TEXT);
    CREATE TABLE admin_team_directory(nickname TEXT);
    INSERT INTO admin_sessions VALUES('test','Test','test@example.com','9999-01-01');
    CREATE TABLE client_directory(name TEXT PRIMARY KEY COLLATE NOCASE,created_at TEXT NOT NULL);
    INSERT INTO client_directory VALUES('Existing','2026-01-01');
    CREATE TABLE mux_asset_metadata(asset_id TEXT PRIMARY KEY,client TEXT,updated_at TEXT);
    CREATE TABLE production_card_overrides(card_source_id TEXT,client TEXT);
    CREATE TABLE mux_video_projects(id TEXT,value TEXT);
    CREATE TABLE mux_library_browse_state(id TEXT,refreshed_at TEXT,refresh_id TEXT);
    CREATE TABLE mux_library_browse_assets(asset_id TEXT,client TEXT,refresh_id TEXT);
  `);db.exec(migration);db.exec(richNoteMigration);db.exec(itemRequestMigration);db.exec(logoMigration);
  const env={GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',TG_DATA:{prepare(sql){let values=[];const s={bind(...args){values=args;return s;},async first(){return db.prepare(sql).get(...values)??null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){const r=db.prepare(sql).run(...values);return {meta:{changes:r.changes}};}};return s;},async batch(ss){db.exec('BEGIN');try{const result=[];for(const s of ss)result.push(await s.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}}};
  const request=(path='',body,auth=true)=>new Request('https://local.test/api/admin/'+path,{method:body?'POST':'GET',headers:{...(auth?{cookie:'tg_admin=test'}:{}),...(body?{'Content-Type':'application/json',Origin:'https://local.test'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  // Model the current UI contract: creation IDs persist for a retry; edits carry
  // the version read by the caller (delete fixtures fetch it explicitly here).
  const hq=(body,path='client-hq',auth=true)=>{
    if(body?.workspace_id) body={...body,...(!body.id?{requestId:body.requestId||crypto.randomUUID()}:{expectedUpdatedAt:body.expectedUpdatedAt||body.updated_at||(body.action==='delete'?db.prepare('SELECT updated_at FROM client_workspace_items WHERE id=?').get(body.id)?.updated_at:undefined)})};
    return handlers.hq.onRequest({env,request:request(path,body,auth)});
  };
  return {db,env,request,hq};
}
test('migration gives existing and legacy-created clients stable IDs; no status or second client list',async()=>{const {db}=fixture();try{
  assert.ok(db.prepare('SELECT id FROM client_directory').get().id);
  db.prepare('INSERT INTO client_directory(name,created_at) VALUES(?,?)').run('New from Deck','now');
  const id=db.prepare('SELECT id FROM client_directory WHERE name=?').get('New from Deck').id;assert.ok(id);
  db.prepare('UPDATE client_directory SET name=? WHERE id=?').run('Renamed',id);
  assert.equal(db.prepare('SELECT name FROM client_directory WHERE id=?').get(id).name,'Renamed');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM pragma_table_info('client_directory') WHERE name='status'").get().n,0);
}finally{db.close();}});
test('authenticated CRUD persists items, scopes writes to a client, and rejects duplicate names',async()=>{const {db,hq}=fixture();try{
  assert.equal((await hq(undefined,'client-hq',false)).status,401);
  const {id}=await (await hq({action:'client',name:'New client'})).json();
  assert.equal((await hq({action:'client',name:'NEW CLIENT'})).status,409);
  const other=db.prepare("SELECT id FROM client_directory WHERE name='Existing'").get().id;
  await hq({workspace_id:id,kind:'todo',title:'Brief',body:'Confirm scope',due_on:'2026-12-01'});
  let item=(await (await hq(undefined,`client-hq?id=${id}`)).json()).items[0];
  await hq({...item,completed:1});
  assert.equal((await (await hq(undefined,`client-hq?id=${id}`)).json()).items[0].completed,1);
  await hq({...item,workspace_id:other,title:'Wrong client'});
  assert.equal(db.prepare('SELECT title FROM client_workspace_items WHERE id=?').get(item.id).title,'Brief');
  await hq({action:'delete',workspace_id:other,id:item.id});assert.equal(db.prepare('SELECT COUNT(*) n FROM client_workspace_items').get().n,1);
  await hq({workspace_id:id,kind:'note',title:'Meeting notes',body:'Keep this context'});
  assert.equal((await (await hq(undefined,`client-hq?id=${id}`)).json()).items.length,2);
  await hq({action:'delete',workspace_id:id,id:item.id});assert.equal(db.prepare('SELECT COUNT(*) n FROM client_workspace_items').get().n,1);
}finally{db.close();}});
test('shared rename preserves ID, notes, folder and production associations',async()=>{const {db,hq,env,request}=fixture();try{
  const id=db.prepare('SELECT id FROM client_directory').get().id;
  await hq({workspace_id:id,kind:'note',title:'Keep me'});
  db.prepare('UPDATE client_directory SET drive_folder_id=? WHERE id=?').run('folder',id);
  db.exec(`INSERT INTO mux_asset_metadata(asset_id,client) VALUES('asset','Existing'); INSERT INTO production_card_overrides VALUES('card','Existing'); INSERT INTO mux_video_projects VALUES('project','{"client":"Existing"}'); INSERT INTO mux_library_browse_state VALUES('library','now','current'); INSERT INTO mux_library_browse_assets VALUES('inferred','Existing','current');`);
  const response=await handlers.clients.onRequestPost({env,request:request('clients',{oldName:'Existing',newName:'Renamed'})});assert.equal(response.status,200);
  assert.equal(db.prepare('SELECT name FROM client_directory WHERE id=?').get(id).name,'Renamed');
  assert.equal(db.prepare('SELECT drive_folder_id FROM client_directory').get().drive_folder_id,'folder');
  assert.equal(db.prepare('SELECT client FROM mux_asset_metadata').get().client,'Renamed');
  assert.equal(db.prepare('SELECT client FROM production_card_overrides').get().client,'Renamed');
  assert.equal(db.prepare("SELECT client FROM mux_asset_metadata WHERE asset_id='inferred'").get().client,'Renamed');
  assert.equal(JSON.parse(db.prepare('SELECT value FROM mux_video_projects').get().value).client,'Renamed');
  assert.equal((await handlers.clients.onRequestPost({env,request:request('clients',{action:'delete',oldName:'Renamed'})})).status,409);
}finally{db.close();}});
test('Drive requires authentication and reports missing setup without leaking credentials',async()=>{const {db,env,request}=fixture();try{
  assert.equal((await handlers.drive.onRequest({env,request:request('client-hq-drive?status=1',undefined,false)})).status,401);
  assert.deepEqual(await (await handlers.drive.onRequest({env,request:request('client-hq-drive?status=1')})).json(),{connected:false,ready:false,account:null,needsReconnect:false});
  assert.equal((await handlers.drive.onRequest({env,request:request('client-hq-drive')})).status,400);
}finally{db.close();}});
test('Drive listing supports shared drives and ancestry checks reject unrelated items',async()=>{
  const original=globalThis.fetch;const calls=[];
  globalThis.fetch=async(url)=>{const u=new URL(url);calls.push(u);if(u.pathname.endsWith('/files'))return Response.json({files:[]});const id=u.pathname.split('/').at(-1);return Response.json({id,name:id,mimeType:'application/vnd.google-apps.folder',parents:id==='child'?['root']:[]});};
  try{assert.equal((await handlers.driveLib.requireWithin('token','child','root')).id,'child');await assert.rejects(()=>handlers.driveLib.requireWithin('token','outside','root'));
    await handlers.driveLib.listDrive('token',{},'root','next-page');const url=calls.at(-1);assert.equal(url.searchParams.get('supportsAllDrives'),'true');assert.equal(url.searchParams.get('includeItemsFromAllDrives'),'true');assert.equal(url.searchParams.get('pageToken'),'next-page');
  }finally{globalThis.fetch=original;}
});
test('Mux filters exclude empty clients while assignment options retain the master list',async()=>{const {db,env}=fixture();try{
  db.exec('DROP TABLE mux_library_browse_state; DROP TABLE mux_library_browse_assets');db.exec(await readFile('migrations/0019_mux_library_browse_index.sql','utf8'));
  db.prepare('INSERT INTO mux_library_browse_state VALUES(?,?,?,?)').run('library','current',new Date().toISOString(),1);
  db.prepare('INSERT INTO mux_library_browse_assets VALUES(?,?,?,?,?,?,?,?,?)').run('asset','current','A video','Existing','published','2026-01-01',0,'a video',JSON.stringify({id:'asset',title:'A video'}));
  db.prepare('INSERT INTO client_directory(name,created_at) VALUES(?,?)').run('No videos yet','now');
  const data=await handlers.browse.readMuxLibraryBrowsePage(env,{});
  assert.deepEqual(data.facets.clients,['All','Existing']);assert.deepEqual(data.facets.directoryClients,['Existing','No videos yet']);
  await handlers.browse.invalidateMuxBrowseIndex(env);assert.equal(db.prepare('SELECT refreshed_at FROM mux_library_browse_state').get().refreshed_at,null);
}finally{db.close();}});
test('new assignments must belong to the directory',async()=>{const {db,hq}=fixture();try{
  const workspace_id=db.prepare('SELECT id FROM client_directory').get().id;
  db.exec("INSERT INTO admin_team_directory VALUES('Tyler Jackson')");
  assert.equal((await hq({workspace_id,kind:'todo',title:'Test',assignee:'Invented Person'})).status,400);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM client_workspace_items').get().n,0);
  assert.equal((await hq({workspace_id,kind:'todo',title:'Test',assignee:'Tyler Jackson'})).status,200);
  const item=db.prepare('SELECT * FROM client_workspace_items').get();
  assert.equal((await hq({...item,assignee:'Other person'})).status,400);
  assert.equal(db.prepare('SELECT assignee FROM client_workspace_items').get().assignee,'Tyler Jackson');
}finally{db.close();}});

test('client activity isolates clients and paginates merged Deck and workspace history',async()=>{
 const {db,env,request,hq}=fixture();try{
 const client=db.prepare("SELECT id FROM client_directory WHERE name='Existing'").get().id;
 const other=(await (await hq({action:'client',name:'Other'})).json()).id;
 db.exec(`CREATE TABLE production_deck_history(id TEXT,source_kind TEXT,source_id TEXT,card_source_id TEXT,column_source_id TEXT,occurred_at TEXT,actor TEXT,action TEXT,category TEXT,summary TEXT,body_html TEXT,details_json TEXT,redacted INTEGER);
 CREATE TABLE production_cards(id TEXT,source_id TEXT,title TEXT,column_source_id TEXT);
 ALTER TABLE production_card_overrides ADD COLUMN title TEXT;ALTER TABLE production_card_overrides ADD COLUMN column_source_id TEXT;
 CREATE TABLE production_columns(source_id TEXT,name TEXT);CREATE TABLE production_column_overrides(column_source_id TEXT,name TEXT,color TEXT);
 INSERT INTO production_cards VALUES('deck-one','source-one','Linked card',NULL),('deck-other','source-other','Other card',NULL);
 INSERT INTO production_card_overrides(card_source_id,client) VALUES('source-one','Existing'),('source-other','Other');
 INSERT INTO production_deck_history VALUES('deck:one','created','one','source-one',NULL,'2026-01-01T00:00:00.000Z','Tester','card_created','updates','','','{}',0),('deck:other','created','other','source-other',NULL,'2026-01-01T00:00:00.000Z','Tester','card_created','updates','','','{}',0);`);
 await hq({workspace_id:client,kind:'todo',title:'Client task'});
 const item=db.prepare('SELECT * FROM client_workspace_items WHERE workspace_id=?').get(client);
 await hq({...item,completed:1});
 await hq({...db.prepare('SELECT * FROM client_workspace_items WHERE id=?').get(item.id),completed:0});
 await hq({workspace_id:other,kind:'note',title:'Other private note'});
 const api=(query,auth=true)=>handlers.history.onRequestGet({env,request:request('production-board/history?'+query,undefined,auth)});
 assert.equal((await api(`client=${client}`,false)).status,401);
 assert.equal((await api('client=missing')).status,404);
 let cursor='',events=[];do{
 const result=await (await api(`client=${client}&limit=2`+(cursor?'&cursor='+encodeURIComponent(cursor):''))).json();
 events.push(...result.events);cursor=result.nextCursor;
 }while(cursor);
 assert.equal(events.length,4);assert.equal(new Set(events.map(e=>e.id)).size,4);
 assert.ok(events.some(e=>e.cardId==='deck-one'));assert.ok(!events.some(e=>e.cardId==='deck-other'||e.summary==='Other private note'));
 assert.deepEqual(events.filter(e=>e.action.startsWith('todo_')).map(e=>e.action).sort(),['todo_completed','todo_created','todo_reopened']);
 assert.equal((await (await api(`client=${client}&filter=management`)).json()).events.length,0);
 assert.equal((await (await api('')).json()).events.length,2);
 }finally{db.close();}
});


test('internal Client HQ enforces scopes, returns envelopes, and attributes integration edits',async()=>{
  const {db,env}=fixture();
  try {
    db.exec('CREATE TABLE api_integration_credentials(id TEXT,name TEXT,scopes_json TEXT,secret_hash TEXT,revoked_at TEXT,last_used_at TEXT)');
    const credentialId='12345678-1234-1234-1234-123456789012';
    const token=`tg_${credentialId}_${'s'.repeat(24)}`;
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
    const hash=Buffer.from(digest).toString('hex');
    db.prepare('INSERT INTO api_integration_credentials(id,name,scopes_json,secret_hash) VALUES(?,?,?,?)').run(credentialId,'HQ integration','["clients:read"]',hash);
    const api=(body,headers={authorization:`Bearer ${token}`},query='')=>handlers.internalHQ.onRequest({env,request:new Request('https://local.test/api/internal/v1/client-hq'+query,{method:body?'POST':'GET',headers:{...headers,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})});
    assert.equal((await api(undefined,{})).status,401);
    const listing=await api();assert.equal(listing.headers.get('cache-control'),'private, no-store');
    const id=(await listing.json()).data.clients[0].id;
    assert.equal((await api({kind:'todo',title:'Blocked',workspace_id:id})).status,403);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM client_workspace_items').get().n,0);
    db.prepare('UPDATE api_integration_credentials SET scopes_json=?').run('["clients:read","clients:write"]');
    assert.equal((await api({kind:'todo',title:'API task',workspace_id:id,requestId:crypto.randomUUID()})).status,200);
    assert.equal(db.prepare('SELECT actor FROM client_activity').get().actor,'HQ integration');
    const detail=await (await api(undefined,undefined,'?id='+id)).json();assert.equal(detail.data.items[0].title,'API task');
    const missing=await api(undefined,undefined,'?id=missing');assert.equal(missing.status,404);assert.equal((await missing.json()).error.code,'client_hq_failed');
    assert.equal((await api({kind:'todo',title:'Cross origin',workspace_id:id},{cookie:'tg_admin=test',origin:'https://elsewhere.test'})).status,403);
    assert.equal((await api(undefined,{cookie:'tg_admin=test'})).status,200);
    db.exec("UPDATE api_integration_credentials SET revoked_at='now'");
    assert.equal((await api()).status,401);
  } finally {db.close();}
});

test('Drive connection from the PWA stores an in-app return destination',async()=>{
  const {db,env,request}=fixture();
  try {
    Object.assign(env,{GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'secret',GOOGLE_DRIVE_ENCRYPTION_KEY:'12'.repeat(32)});
    const id=db.prepare('SELECT id FROM client_directory').get().id;
    const response=await handlers.connection.onRequest({env,request:request('client-drive-connection',{action:'connect',client:id,teamApp:true})});
    assert.equal(response.status,200);
    assert.equal(db.prepare('SELECT destination FROM client_drive_oauth_states').get().destination,'/app/clients?client='+encodeURIComponent(id));
  } finally {db.close();}
});

test('private Drive previews enforce client roots, export PDFs, stream ranges and isolate active content',async()=>{
 const {db,env,request}=fixture(),original=globalThis.fetch;
 Object.assign(env,{GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'secret',GOOGLE_DRIVE_ENCRYPTION_KEY:'12'.repeat(32),GOOGLE_DRIVE_ID:'root'});
 const id=db.prepare('SELECT id FROM client_directory').get().id;
 db.prepare("UPDATE client_directory SET drive_folder_id='linked'").run();
 db.prepare("INSERT INTO client_drive_connection VALUES('organization',?,?,?,?,0)").run(await handlers.oauth.encryptDriveSecret(env,'refresh'),'owner@trantergrey.com','root','now');
 const files={root:{id:'root'},linked:{id:'linked',parents:['root']},other:{id:'other',parents:['root']},pdf:{id:'pdf',name:'Brief.pdf',mimeType:'application/pdf',parents:['linked']},outside:{id:'outside',parents:['other']},doc:{id:'doc',name:'Brief',mimeType:'application/vnd.google-apps.document',parents:['linked']},html:{id:'html',name:'Page.html',mimeType:'text/html',parents:['linked']},locked:{id:'locked',name:'Locked.pdf',mimeType:'application/pdf',parents:['linked'],capabilities:{canDownload:false}}};
 let contentRequests=0,exported=false,receivedRange;
 globalThis.fetch=async(url,init={})=>{const u=new URL(url);if(u.pathname==='/token')return Response.json({access_token:'server-secret'});
  if(u.searchParams.get('alt')==='media'||u.pathname.endsWith('/export')){contentRequests++;assert.equal(init.headers.Authorization,'Bearer server-secret');assert.equal(init.redirect,'manual');exported=u.pathname.endsWith('/export');receivedRange=init.headers.Range;return new Response('PDF',{status:receivedRange?206:200,headers:{'Content-Type':'text/html','Content-Length':'3',...(receivedRange?{'Content-Range':'bytes 0-2/10','Accept-Ranges':'bytes'}:{})}});}
  const f=files[u.pathname.split('/').at(-1)];return f?Response.json(f):new Response(null,{status:404});};
 const api=(file,suffix='',auth=true,range)=>{const req=request(`client-hq-drive?client=${id}&preview=${file}${suffix}`,undefined,auth);if(range)req.headers.set('Range',range);return handlers.drive.onRequest({env,request:req});};
 try{
  assert.equal((await api('pdf','',false)).status,401);
  assert.equal((await api('outside')).status,400);assert.equal(contentRequests,0);
  assert.equal((await api('pdf','&root=other')).status,400);assert.equal(contentRequests,0);
  assert.equal((await handlers.drive.onRequest({env,request:request('client-hq-drive?preview=pdf')})).status,400);
  const info=await (await api('doc','&info=1')).json();assert.equal(info.kind,'pdf');assert.equal(info.exported,true);assert.equal(contentRequests,0);
  const pdf=await api('pdf','',true,'bytes=0-2');assert.equal(pdf.status,206);assert.equal(receivedRange,'bytes=0-2');assert.equal(pdf.headers.get('Content-Type'),'application/pdf');assert.equal(pdf.headers.get('Content-Range'),'bytes 0-2/10');assert.equal(pdf.headers.get('Cache-Control'),'private, no-store');assert.match(pdf.headers.get('Content-Security-Policy'),/sandbox/);assert.equal(pdf.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(await pdf.text(),'PDF');
  await api('doc');assert.equal(exported,true);assert.equal(receivedRange,undefined);
  assert.equal((await api('html')).status,415);
  const download=await api('html','&download=1');assert.equal(download.headers.get('Content-Type'),'application/octet-stream');assert.match(download.headers.get('Content-Disposition'),/^attachment/);
  assert.equal((await api('locked')).status,403);
  assert.equal((await api('pdf','',true,'bytes=0-2,4-6')).status,416);
 }finally{globalThis.fetch=original;db.close();}
});


test('client pins and colors belong to the signed-in user; archive is shared and non-destructive',async()=>{
 const {db,env,request,hq}=fixture();
 db.exec(await readFile('migrations/0038_client_user_preferences.sql','utf8'));
 db.exec(await readFile('migrations/0039_client_custom_colors.sql','utf8'));
 db.exec(await readFile('migrations/0040_client_card_order.sql','utf8'));
 const id=db.prepare('SELECT id FROM client_directory').get().id;
 const api=(body,auth=true)=>handlers.preferences.onRequest({env,request:request('client-preferences',body,auth)});
 try{
  assert.equal((await api(undefined,false)).status,401);
  assert.equal((await api({clientId:id,pinned:true},false)).status,401);
  assert.equal((await api({clientId:id,pinned:true})).status,200);
  await api({clientId:id,color:'#527fa8'});
  assert.deepEqual((await (await api()).json()).preferences[id],{pinned:true,color:'#527fa8'});
  assert.equal((await api({clientId:id,color:'invalid'})).status,400);
  assert.equal((await api({clientId:id,color:'#ABCDEF'})).status,200);
  assert.equal((await (await api()).json()).preferences[id].color,'#abcdef');
  assert.equal((await api({clientId:id,color:'red; background:url(x)'})).status,400);
  await api({clientId:id,color:'#527fa8'});
  assert.equal((await api({clientId:id,pinned:'yes'})).status,400);
  assert.equal((await api({clientId:'missing',pinned:true})).status,404);
  assert.equal((await api({clientId:id,pinned:true,user_email:'someone@example.com'})).status,400);
  const foreign=request('client-preferences',{clientId:id,pinned:false});foreign.headers.set('Origin','https://other.test');
  assert.equal((await handlers.preferences.onRequest({env,request:foreign})).status,403);
  db.prepare("UPDATE admin_sessions SET user_email='other@example.com'").run();
  assert.deepEqual((await (await api()).json()).preferences,{});
  await api({clientId:id,color:'#b95160'});
  await hq({workspace_id:id,kind:'todo',title:'Keep this task'});
  assert.equal((await hq({action:'archive-client',id,archived:true})).status,200);
  assert.equal((await (await hq()).json()).clients[0].archived,1);
  assert.equal((await (await hq(undefined,'client-hq?id='+id)).json()).items.length,1);
  db.prepare("UPDATE admin_sessions SET user_email='TEST@EXAMPLE.COM'").run();
  assert.deepEqual((await (await api()).json()).preferences[id],{pinned:true,color:'#527fa8'});
  assert.equal((await (await hq()).json()).clients[0].archived,1);
  await hq({action:'archive-client',id,archived:false});
  assert.equal((await (await hq()).json()).clients[0].archived,0);
  assert.equal((await hq({action:'archive-client',id,archived:true},'client-hq',false)).status,401);
  assert.equal((await hq({action:'archive-client',id,archived:'yes'})).status,400);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM client_activity WHERE action IN ('client_archived','client_restored')").get().n,2);
  await api({clientId:id,color:null});
  assert.deepEqual((await (await api()).json()).preferences[id],{pinned:true,color:null});
  db.prepare("UPDATE client_directory SET name='Renamed' WHERE id=?").run(id);
  assert.equal((await (await api()).json()).preferences[id].pinned,true);
  db.prepare('UPDATE admin_sessions SET user_email=NULL').run();
  assert.equal((await api()).status,401);
  assert.equal((await api({clientId:id,pinned:true})).status,401);
 }finally{db.close();}
});

test('client ordering puts active pins first and archived clients last even when pinned',()=>{
 const clients=[{id:'a',name:'Alpha',archived:1},{id:'b',name:'Beta'},{id:'c',name:'Charlie'},{id:'d',name:'Delta',archived:1}];
 const preferences={a:{pinned:true,color:null},c:{pinned:true,color:'#527fa8'}};
 assert.deepEqual([...clients].sort((a,b)=>handlers.preferenceSort.compareClientCards(a,b,preferences)).map(c=>c.id),['c','b','a','d']);
 assert.deepEqual([...clients].sort((a,b)=>handlers.preferenceSort.compareClientCards(a,b,{})).map(c=>c.id),['b','c','a','d']);
});


test('custom client color migration preserves pins and converts existing personal colors',async()=>{
 const {db}=fixture();
 try {
  db.exec(await readFile('migrations/0038_client_user_preferences.sql','utf8'));
  const id=db.prepare('SELECT id FROM client_directory').get().id;
  db.prepare('INSERT INTO client_user_preferences VALUES(?,?,?,?)').run('test@example.com',id,1,'blue');
  db.exec(await readFile('migrations/0039_client_custom_colors.sql','utf8'));
 db.exec(await readFile('migrations/0040_client_card_order.sql','utf8'));
  const row=db.prepare('SELECT pinned,color FROM client_user_preferences').get();
  assert.equal(row.pinned,1);assert.equal(row.color,'#527fa8');
  assert.throws(()=>db.prepare('UPDATE client_user_preferences SET color=?').run('invalid'));
 }finally{db.close();}
});

test('client pins default to yellow and maintain contrast on custom backgrounds',()=>{
 const pin=handlers.preferenceSort.clientPinColor;
 assert.equal(pin(null),'#f5cd38');assert.equal(pin(undefined),'#f5cd38');
 assert.equal(pin('#0000ff'),'#ffff00');
 const luminance=hex=>[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 for(const background of ['#000000','#ffffff','#808080','#f5cd38','#527fa8','#b95160','#ff0000','#00ff00','#0000ff']){
  const color=pin(background);assert.match(color,/^#[0-9a-f]{6}$/);
  const a=luminance(background),b=luminance(color);
  assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=3,`${background} / ${color}`);
 }
});


test('custom client order persists per account without replacing pins or colors',async()=>{
 const {db,env,request}=fixture();
 for(const path of ['0038_client_user_preferences.sql','0039_client_custom_colors.sql','0040_client_card_order.sql'])db.exec(await readFile('migrations/'+path,'utf8'));
 const api=body=>handlers.preferences.onRequest({env,request:request('client-preferences',body)});
 try{
  const a=db.prepare('SELECT id FROM client_directory').get().id;
  db.prepare('INSERT INTO client_directory(id,name,created_at) VALUES(?,?,?)').run('b','Second','now');
  await api({clientId:a,pinned:true,color:'#123456'});
  assert.equal((await api({action:'reorder',ids:['b',a]})).status,200);
  let data=(await (await api()).json()).preferences;
  assert.deepEqual(data[a],{pinned:true,color:'#123456',sortOrder:1});assert.equal(data.b.sortOrder,0);
  const update=await (await api({clientId:a,color:'#abcdef'})).json();assert.equal(update.sortOrder,1);
  assert.equal((await api({action:'reorder',ids:[a,a]})).status,400);
  assert.equal((await api({action:'reorder',ids:[a,'missing']})).status,409);
  assert.equal((await (await api()).json()).preferences[a].sortOrder,1);
  db.prepare("UPDATE admin_sessions SET user_email='other@example.com'").run();
  assert.deepEqual((await (await api()).json()).preferences,{});
  await api({action:'reorder',ids:[a,'b']});
  db.prepare("UPDATE admin_sessions SET user_email='test@example.com'").run();
  assert.equal((await (await api()).json()).preferences[a].sortOrder,1);
 }finally{db.close();}
});

test('drag ordering shifts cards without combining them and preserves filtered-out positions',()=>{
 const reorder=handlers.preferenceSort.reorderVisibleClients;
 assert.deepEqual(reorder(['a','b','c','d'],['a','b','c','d'],'a','c'),['b','c','a','d']);
 assert.deepEqual(reorder(['a','b','c','d'],['a','c','d'],'d','a'),['d','b','a','c']);
 assert.deepEqual(reorder(['a','b'],['a','b'],'a','missing'),['a','b']);
 const compare=handlers.preferenceSort.compareClientCards;
 const cards=[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C',archived:1}];
 const prefs={a:{pinned:false,color:null,sortOrder:2},b:{pinned:false,color:null,sortOrder:1},c:{pinned:true,color:null,sortOrder:0}};
 assert.deepEqual(cards.sort((a,b)=>compare(a,b,prefs)).map(c=>c.id),['b','a','c']);
});

test('client logos require authentication, validate uploads, persist per client, replace and remove', async()=>{
  const {db,env,hq}=fixture();
  const objects=new Map();
  env.PRODUCTION_ARCHIVE={async put(key,bytes,options){objects.set(key,{bytes,...options});},async get(key){const value=objects.get(key);return value?{body:value.bytes,httpMetadata:value.httpMetadata}:null;}};
  const id=db.prepare('SELECT id FROM client_directory').get().id;
  const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'));
  const call=(method='GET',body,options={})=>handlers.logo.onRequest({env,request:new Request('https://local.test/api/admin/client-logo?client='+(options.id||id),{method,headers:{cookie:options.anonymous?'':'tg_admin=test',origin:options.origin||'https://local.test','content-type':options.type||'image/png'},...(body?{body}:{})})});
  try {
    assert.equal((await call('POST',png,{anonymous:true})).status,401);
    assert.equal((await call('POST',png,{origin:'https://evil.test'})).status,403);
    assert.equal((await call('POST',png,{id:'missing'})).status,404);
    assert.equal((await call('POST','<svg/>',{type:'image/svg+xml'})).status,400);
    assert.equal((await call('POST','not an image')).status,400);
    assert.equal((await call('POST',new Uint8Array(5*1024*1024+1))).status,413);
    assert.equal(objects.size,0);
    assert.equal((await call('GET')).status,404);
    const saved=await (await call('POST',png)).json();assert.ok(saved.logo_key);
    const fetched=await call();assert.equal(fetched.headers.get('content-type'),'image/png');assert.equal(fetched.headers.get('cache-control'),'private, no-store');assert.deepEqual(new Uint8Array(await fetched.arrayBuffer()),png);
    const client=(await (await hq(undefined,'client-hq?id='+id)).json()).client;assert.equal(client.logo_key,saved.logo_key);
    const other=(await (await hq({action:'client',name:'Other logo client'})).json()).id;
    assert.equal((await call('GET',undefined,{id:other})).status,404);
    const replacement=await (await call('POST',png)).json();assert.notEqual(replacement.logo_key,saved.logo_key);
    assert.equal((await call('DELETE')).status,200);assert.equal((await call()).status,404);
    assert.equal(db.prepare('SELECT logo_key FROM client_directory WHERE id=?').get(id).logo_key,null);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM client_activity WHERE action LIKE 'client_logo_%'").get().n,3);
  } finally {db.close();}
});

test('unbranded video logos are public only through enabled projects and follow the assigned client', async()=>{
  const {db,env}=fixture();
  db.exec("ALTER TABLE mux_video_projects ADD COLUMN updated_at TEXT; CREATE TABLE mux_video_collections(value TEXT,updated_at TEXT);");
  for (const column of ['title TEXT','tags TEXT','status TEXT','thumbnail_time REAL','downloads_enabled INTEGER']) db.exec('ALTER TABLE mux_asset_metadata ADD COLUMN '+column);
  const project={id:'film',slug:'film',legacySlugs:['old-film'],title:'Film',client:'Existing',unbrandedPublicPage:true,variants:[],collectionIds:[]};
  const save=()=>db.prepare("INSERT OR REPLACE INTO mux_video_projects(rowid,id,value,updated_at) VALUES(1,'film',?,'now')").run(JSON.stringify(project));save();
  db.exec("UPDATE client_directory SET logo_key='logos/one'");
  const objects=new Map([['logos/one','first'],['logos/two','replacement']]);
  env.PRODUCTION_ARCHIVE={async get(key){return objects.has(key)?{body:objects.get(key),httpMetadata:{contentType:'image/png'}}:null;}};
  const get=(slug='film')=>handlers.publicLogo.onRequestGet({env,params:{slug}});
  try {
    let response=await get();assert.equal(response.status,200);assert.equal(await response.text(),'first');assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal((await get('old-film')).status,200);assert.equal((await get('missing')).status,404);
    const video=await handlers.publicWatch.publicWatchData(env,'film');assert.equal(video.clientLogoUrl,'/api/watch/film/logo');assert.ok(!JSON.stringify(video).includes('logos/one'));
    project.unbrandedPublicPage=false;save();assert.equal((await get()).status,404);assert.equal((await handlers.publicWatch.publicWatchData(env,'film')).clientLogoUrl,null);
    project.unbrandedPublicPage=true;project.client='Other client';save();assert.equal((await get()).status,404);
    project.client='existing';save();assert.equal((await get()).status,200);
    project.client=null;project.variants=[{assetId:'imported'}];save();
    db.exec("INSERT INTO mux_library_browse_state(id,refresh_id) VALUES('library','current'); INSERT INTO mux_library_browse_assets(asset_id,client,refresh_id) VALUES('imported','Existing','current'); INSERT INTO mux_library_browse_assets(asset_id,client,refresh_id) VALUES('imported','Wrong stale client','old');");
    assert.equal((await get()).status,200);
    project.variants.push({assetId:'unassigned'});save();assert.equal((await get()).status,404);
    db.exec("INSERT INTO mux_asset_metadata(asset_id,client) VALUES('unassigned','Other client')");assert.equal((await get()).status,404);
    project.variants.pop();save();
    db.exec("INSERT INTO mux_asset_metadata(asset_id,client) VALUES('imported','Other client')");assert.equal((await get()).status,404);
    db.exec("UPDATE mux_asset_metadata SET client='Existing' WHERE asset_id='imported'");assert.equal((await get()).status,200);
    project.variants=[];project.client='Existing';save();
    db.exec("UPDATE client_directory SET logo_key='logos/two'");assert.equal(await (await get()).text(),'replacement');
    db.exec("UPDATE client_directory SET logo_key=NULL");assert.equal((await get()).status,404);assert.equal((await handlers.publicWatch.publicWatchData(env,'film')).clientLogoUrl,null);
  } finally {db.close();}
});

test('standalone videos can enable unbranded sharing and reuse the page when toggled',async()=>{
  const {db,env}=fixture();
  db.exec("DROP TABLE mux_video_projects; CREATE TABLE mux_video_projects(id TEXT PRIMARY KEY,slug TEXT UNIQUE,value TEXT,created_at TEXT,updated_at TEXT); CREATE TABLE mux_video_collections(value TEXT,updated_at TEXT);");
  for(const column of ['title TEXT','tags TEXT','status TEXT','thumbnail_time REAL','downloads_enabled INTEGER'])db.exec('ALTER TABLE mux_asset_metadata ADD COLUMN '+column);
  db.exec("INSERT INTO mux_asset_metadata(asset_id,client,title) VALUES('standalone','Existing','Saved title')");
  const asset={id:'standalone',title:'Upload title',playbackId:'public123',playbackPolicy:'public',aspectRatio:'16:9'};
  try{
    await assert.rejects(()=>handlers.unbranded.setAssetUnbrandedPage(env,asset,false),/no unbranded page/);
    const page=await handlers.unbranded.setAssetUnbrandedPage(env,asset,true);
    assert.equal(page.title,'Saved title');assert.equal(page.client,'Existing');assert.equal(page.unbrandedPublicPage,true);assert.equal(page.variants[0].assetId,asset.id);
    const disabled=await handlers.unbranded.setAssetUnbrandedPage(env,asset,false);assert.equal(disabled.id,page.id);assert.equal(disabled.unbrandedPublicPage,false);
    const enabled=await handlers.unbranded.setAssetUnbrandedPage(env,asset,true);assert.equal(enabled.slug,page.slug);assert.equal(enabled.unbrandedPublicPage,true);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM mux_video_projects').get().n,1);
    await assert.rejects(()=>handlers.unbranded.setAssetUnbrandedPage(env,{...asset,id:'private',playbackPolicy:'signed'},true),/public Mux playback/);
  }finally{db.close();}
});
