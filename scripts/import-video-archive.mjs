// Imports only catalog metadata into LOCAL D1. Existing Drive mappings and edits are preserved.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function parseCsv(text) {
  const rows=[]; let row=[], cell='', quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') { if(quoted && text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted; }
    else if(c===',' && !quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw new Error('Unclosed CSV field.');
  if(cell||row.length){row.push(cell);rows.push(row);}
  const header=rows.shift() || [];
  return rows.map(values=>Object.fromEntries(header.map((key,index)=>[key,values[index] || ''])));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source=process.argv[2]; if(!source)throw new Error('Usage: node scripts/import-video-archive.mjs export.csv [video_library_dates.csv]');
  const rows=parseCsv(await readFile(source,'utf8'));
  const old=process.argv[3]?parseCsv(await readFile(process.argv[3],'utf8')):[];
  const clients=new Map(old.map(row=>[row['Vimeo ID'],row.Client]));
  const paths=new Map(old.map(row=>[row['Vimeo ID'],row['Vimeo Folder Path']]));
  const quote=value=>`'${String(value??'').replaceAll("'","''")}'`;
  const seen=new Set();const sql=[]; const now=new Date().toISOString();
  for(const row of rows) {
    const id=row['Video ID'];
    if(!/^\d{5,20}$/.test(id)||!row.Title||!Number.isFinite(Date.parse(row.Created))||seen.has(id))throw new Error(`Invalid or duplicate record: ${id}`);
    seen.add(id);
    const oldPath=paths.get(id)||'';
    const folder=oldPath && oldPath.split(' / ').at(-1)===row.Folder ? oldPath : row.Folder;
    const values=[id,row.Title,folder,clients.get(id)||'',row.Created,row['Release Time']||null,Number(row['Duration (s)'])||0,row.Description,JSON.stringify((row.Tags||'').split(',').map(x=>x.trim()).filter(Boolean)),now];
    sql.push(`INSERT INTO archive_videos(vimeo_id,title,folder,client,created_at,release_at,duration,description,tags,imported_at) VALUES(${values.map(value=>value===null?'NULL':quote(value)).join(',')}) ON CONFLICT(vimeo_id) DO UPDATE SET title=excluded.title,folder=excluded.folder,client=CASE WHEN excluded.client<>'' THEN excluded.client ELSE archive_videos.client END,created_at=excluded.created_at,release_at=excluded.release_at,duration=excluded.duration,description=excluded.description,tags=excluded.tags,imported_at=excluded.imported_at;`);
  }
  await mkdir('data',{recursive:true});const output=path.resolve('data/archive-import.sql');await writeFile(output,sql.join('\n'));
  const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','TG_DATA','--local','--persist-to','.wrangler/state','--file',output],{encoding:'utf8',maxBuffer:32*1024*1024});
  if(result.status!==0){console.error(result.stderr||result.stdout);process.exitCode=result.status||1;}else console.log(`Imported ${rows.length} archive records locally.`);
}
