#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const videoExtensions = new Set(['.mov', '.mp4', '.m4v']);
const usage = `Usage: node scripts/compress-basecamp-videos.mjs <export-directory> [output-directory] [--overwrite]\n\nCreates H.264/AAC copies of Basecamp-export videos while preserving every relative path, filename, and extension. Originals are never changed.`;
const args = process.argv.slice(2);
const overwrite = args.includes('--overwrite');
const positional = args.filter((arg) => arg !== '--overwrite');
const [sourceArg, outputArg] = positional;

if (!sourceArg) throw new Error(usage);
const source = resolve(sourceArg);
const output = resolve(outputArg || `${source}-compressed-videos`);
if (!existsSync(source) || !statSync(source).isDirectory()) throw new Error(`Source directory does not exist: ${source}`);
if (output === source || output.startsWith(`${source}/`)) throw new Error('Output must be outside the source directory to protect original files.');

const ensureFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
if (ensureFfmpeg.status !== 0) throw new Error('ffmpeg was not found. Install it first with: brew install ffmpeg');

const findVideos = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return findVideos(path);
  return entry.isFile() && videoExtensions.has(extname(entry.name).toLowerCase()) ? [path] : [];
});

const videos = findVideos(source);
if (videos.length === 0) throw new Error(`No .mov, .mp4, or .m4v videos found under ${source}`);

console.log(`Compressing ${videos.length} videos into ${output}`);
console.log('Codec: H.264 video (CRF 24) + AAC audio. Names and extensions are preserved.');

let complete = 0;
let skipped = 0;
const failures = [];
for (const input of videos) {
  const target = join(output, relative(source, input));
  if (existsSync(target) && !overwrite) {
    skipped += 1;
    console.log(`Skipping existing: ${relative(source, input)}`);
    continue;
  }
  mkdirSync(dirname(target), { recursive: true });
  console.log(`[${complete + skipped + 1}/${videos.length}] ${relative(source, input)}`);
  const sharedArgs = [
    '-hide_banner', '-loglevel', 'warning', '-y', '-i', input,
    '-map', '0:v:0',
  ];
  const encodingArgs = [
    '-map_metadata', '0',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', target,
  ];
  // Some older iPhone recordings include a secondary Apple spatial-audio
  // stream that FFmpeg cannot decode. Use the principal audio stream only.
  let result = spawnSync('ffmpeg', [...sharedArgs, '-map', '0:a:0?', ...encodingArgs], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.warn(`Audio was incompatible; retrying video-only: ${basename(input)}`);
    result = spawnSync('ffmpeg', [...sharedArgs, '-an', ...encodingArgs], { stdio: 'inherit' });
  }
  if (result.status !== 0) {
    failures.push(relative(source, input));
    console.error(`Could not compress: ${relative(source, input)}`);
  } else {
    complete += 1;
  }
}

console.log(`Done. ${complete} compressed, ${skipped} skipped. Output: ${output}`);
if (failures.length > 0) {
  console.error(`Failed files (${failures.length}):\n${failures.join('\n')}`);
  process.exitCode = 1;
}
