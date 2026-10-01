import { cpSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staging = mkdtempSync(path.join(tmpdir(), 'trantergrey-static-'));
const output = path.join(project, 'out');

function copySource(source, destination) {
  cpSync(source, destination, {
    recursive: true,
    filter: (entry) => {
      const relative = path.relative(source, entry);
      if (!relative) return true;
      const first = relative.split(path.sep)[0];
      return !['.git', '.next', 'node_modules', 'out', '.sites-checkout', '.sites-runtime'].includes(first);
    },
  });
}

try {
  copySource(project, staging);
  symlinkSync(path.join(project, 'node_modules'), path.join(staging, 'node_modules'), 'dir');

  // The public deployment contains the marketing site and work reel. Local-only
  // Vimeo curation and its Node/file-backed routes remain available in this checkout.
  rmSync(path.join(staging, 'app/api'), { recursive: true, force: true });
  rmSync(path.join(staging, 'app/connect-vimeo'), { recursive: true, force: true });
  rmSync(path.join(staging, 'app/library'), { recursive: true, force: true });

  const homePath = path.join(staging, 'app/page.tsx');
  const home = readFileSync(homePath, 'utf8')
    .replace("import { getVimeoLibrary } from '@/lib/vimeo-library';\n", '')
    .replace("export const dynamic = 'force-dynamic';\n\n", '')
    .replace(/  const library = await getVimeoLibrary\(\);\n  const stripVideos = library\?\.videos\n    \.filter\(\(video\) => video\.libraryStatus === 'published' && \(video\.localTags \?\? \[\]\)\.some\(\(tag\) => tag\.toLocaleLowerCase\(\) === 'homepage-strip'\)\)\n    \.map\(toPublicVideo\) \?\? videos\.slice\(0, 5\);/, '  const stripVideos = videos.slice(0, 5);');
  writeFileSync(homePath, home);

  const workPath = path.join(staging, 'app/work/page.tsx');
  const work = readFileSync(workPath, 'utf8')
    .replace("export const dynamic = 'force-dynamic';\n\n", '');
  writeFileSync(workPath, work);

  writeFileSync(path.join(staging, 'next.config.mjs'), "export default { output: 'export', images: { unoptimized: true } };\n");
  const build = spawnSync(process.execPath, [path.join(project, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], { cwd: staging, stdio: 'inherit' });
  if (build.status !== 0) process.exitCode = build.status ?? 1;
  else {
    rmSync(output, { recursive: true, force: true });
    renameSync(path.join(staging, 'out'), output);
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
}
