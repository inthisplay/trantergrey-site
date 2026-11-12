#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const videoExtensions = new Set(['.mov', '.mp4', '.m4v']);
const usage = `Usage: node scripts/compress-basecamp-videos.mjs <export-directory> [output-directory] [--overwrite] [--only <relative-video-path>]\n\nCreates H.264/AAC copies of Basecamp-export videos while preserving every relative path, filename, and extension. Originals are never changed.`;
const args = process.argv.slice(2);
const overwrite = args.includes('--overwrite');
const only = [];
const positional = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--overwrite') continue;
  if (args[index] === '--only') {
    if (!args[index + 1]) throw new Error('--only requires a relative video path.');
    only.push(args[index + 1]); index += 1; continue;
  }
  positional.push(args[index]);
}
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

const videos = findVideos(source).filter((input) => !only.length || only.includes(relative(source, input)));
if (videos.length === 0) throw new Error(`No .mov, .mp4, or .m4v videos found under ${source}`);

console.log(`Compressing ${videos.length} videos into ${output}`);
console.log('Codec: H.264 video (CRF 24) + AAC audio. Names and extensions are preserved.');

const inspectMedia = (input) => {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', input], { encoding: 'utf8' });
  if (result.status !== 0) return { audio: null, hdr: false };
  try {
    const streams = JSON.parse(result.stdout).streams || [];
    const video = streams.find((stream) => stream.codec_type === 'video') || null;
    // iPhone spatial audio can precede a normal AAC stream. Prefer the latter.
    const audio = streams.find((stream) => stream.codec_type === 'audio' && ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le'].includes(stream.codec_name))
      || streams.find((stream) => stream.codec_type === 'audio')
      || null;
    const hdr = video?.color_transfer === 'arib-std-b67' || video?.color_transfer === 'smpte2084' || video?.color_primaries === 'bt2020';
    return { audio, hdr };
  } catch { return { audio: null, hdr: false }; }
};

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
  const media = inspectMedia(input);
  const sharedArgs = [
    '-hide_banner', '-loglevel', 'warning', '-y', '-i', input,
    '-map', '0:v:0',
  ];
  const encodingArgs = [
    '-map_metadata', '0',
    // The installed FFmpeg has no zscale filter, so use its built-in
    // colorspace conversion to write broadly playable Rec.709 SDR output.
    ...(media.hdr ? ['-vf', 'colorspace=all=bt709:iall=bt2020:fast=1,format=yuv420p'] : []),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p',
    // Safari is more reliable with a constant frame rate and ISO MP4
    // packaging for all archived mobile footage, even if the preserved
    // filename still ends in .mov.
    '-r', '30', '-fps_mode', 'cfr', '-profile:v', 'main', '-g', '60', '-keyint_min', '60',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
    '-f', 'mp4', target,
  ];
  // Map an explicitly usable stream rather than blindly using audio track 0.
  let result = spawnSync('ffmpeg', [...sharedArgs, ...(media.audio ? ['-map', `0:${media.audio.index}`] : ['-an']), ...encodingArgs], { stdio: 'inherit' });
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
