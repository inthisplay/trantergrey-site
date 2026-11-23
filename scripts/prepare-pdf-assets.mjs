import { cpSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const source=path.join(root,'node_modules/pdfjs-dist');
const {version}=JSON.parse(readFileSync(path.join(source,'package.json'),'utf8'));
const destination=path.join(root,'public/vendor/pdfjs',version);
mkdirSync(destination,{recursive:true});
for(const directory of ['cmaps','standard_fonts','wasm'])cpSync(path.join(source,directory),path.join(destination,directory),{recursive:true});
cpSync(path.join(source,'LICENSE'),path.join(destination,'LICENSE'));
