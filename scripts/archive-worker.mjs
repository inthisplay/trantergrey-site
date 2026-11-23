// Local background driver. Durable progress and locks live in D1, never in this process.
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
const config={...parseEnv(await readFile('.env.local','utf8')),...process.env};
const secret=config.ARCHIVE_WORKER_SECRET;
if(!secret || secret.length<32)throw new Error('Set ARCHIVE_WORKER_SECRET (at least 32 random characters) in .env.local and restart local dev.');
const endpoint='http://127.0.0.1:3100/api/internal/archive-worker';
let stopped=false,lastError='';process.on('SIGTERM',()=>{stopped=true;});process.on('SIGINT',()=>{stopped=true;});
console.log('Local archive worker started.');
while(!stopped) {
  let worked=false;
  try {
    const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(110000)});
    if(!response.ok)throw new Error(`Archive worker returned HTTP ${response.status}.`);
    worked=(await response.json()).worked;lastError='';
  }catch(error){const message=error instanceof Error?error.message:'Archive worker unavailable.';if(message!==lastError)console.error(message);lastError=message;}
  if(!stopped)await new Promise(resolve=>setTimeout(resolve,worked?250:5000));
}
