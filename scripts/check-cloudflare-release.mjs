import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'out/login.html',
  'functions/api/auth/google.ts',
  'functions/api/auth/google/callback.ts',
  'functions/api/auth/config.ts',
  'functions/api/admin/session.ts',
  'out/admin/mux.html',
  'out/mux-asset.html',
  'out/showcase.html',
  'out/watch.html',
  'functions/api/mux/library.ts',
  'functions/api/mux/playback-map.ts',
  'functions/api/admin/mux-uploads.ts',
  'functions/api/admin/mux-assets/client.ts',
  'functions/api/admin/mux-assets/delete.ts',
  'functions/api/admin/mux-assets/metadata.ts',
  'functions/api/admin/mux-assets/playback.ts',
  'functions/api/admin/mux-assets/static-rendition.ts',
  'functions/api/admin/mux-assets/thumbnail.ts',
  'functions/api/admin/video-projects.ts',
  'functions/api/admin/video-collections.ts',
  'functions/api/watch/[slug].ts',
  'functions/api/watch/collection/[slug].ts',
  'functions/api/watch/download.ts',
  'functions/api/showcase.ts',
  'functions/watch/[slug].ts',
  'functions/watch/collection/[slug].ts',
  'functions/admin/mux/[id].ts',
  'migrations/0005_mux_library.sql',
  'migrations/0006_seed_mux_workspace.sql',
];

for (const file of requiredFiles) {
  if (!existsSync(file)) throw new Error(`Required release file is missing: ${file}`);
}

const loginPage = readFileSync('out/login.html', 'utf8');
if (!loginPage.includes('/api/auth/google')) throw new Error('The static login page does not link to Google sign-in.');

const callback = readFileSync('functions/api/auth/google/callback.ts', 'utf8');
if (!callback.includes("profile.hd !== 'trantergrey.com'") || !callback.includes('profile.email_verified !== true')) throw new Error('The Google callback must verify both the Workspace domain and the email.');

const gallery = readFileSync('components/VideoGallery.tsx', 'utf8');
for (const parameter of ['search', 'format', 'industry', 'client']) {
  if (!gallery.includes(`params.get('${parameter}')`) || !gallery.includes(`updateFilterUrl('${parameter}'`)) {
    throw new Error(`The public work gallery must read and write the ${parameter} URL parameter.`);
  }
}
if (!gallery.includes('window.history.replaceState')) throw new Error('The public work gallery must preserve shareable filters in the URL.');
if (!gallery.includes("fetch('/api/mux/playback-map'") || !gallery.includes('videoPlayerUrl(active, true)')) {
  throw new Error('The public work gallery must prefer approved Mux playback while retaining its Vimeo fallback.');
}

const muxPlaybackEndpoint = readFileSync('functions/api/mux/playback-map.ts', 'utf8');
if (!muxPlaybackEndpoint.includes('getAutoApprovedMuxPlaybackMap') || !muxPlaybackEndpoint.includes("'Cache-Control': 'public")) {
  throw new Error('The Cloudflare Mux playback map endpoint must expose cached, explicitly matched public playback IDs.');
}
const muxPlayback = readFileSync('lib/mux-playback.ts', 'utf8');
if (!muxPlayback.includes("'654278945': '8A029oWR01MXttjFbExkobOa2cvLmpKCPOAtZM7bAW4X00'")) {
  throw new Error('The approved Taylor BMW Center Of Excellence Mux asset mapping is missing.');
}

const header = readFileSync('components/SiteHeader.tsx', 'utf8');
if (!header.includes("fetch('/api/admin/session'") || !header.includes('showAdmin &&') || !header.includes('href="/admin">Admin')) {
  throw new Error('The site navigation must show the Admin link only for an authenticated session.');
}
if (!header.includes('nav-admin-group') || !header.includes('href="/admin/mux">Mux</a>')) {
  throw new Error('The authenticated Admin navigation must include the Mux dropdown link.');
}

const adminHub = readFileSync('components/AdminHub.tsx', 'utf8');
const adminCss = readFileSync('app/admin.css', 'utf8');
if (!adminHub.includes('admin-hub-link-title') || !adminHub.includes("title: 'Mux library'")) {
  throw new Error('The Admin control room must render the Mux library title with the standard hub title style.');
}
if (!adminCss.includes('.admin-hub-link-title .axis-tracked-text') || !adminCss.includes('.admin-hub-link-title .axis-tracked-glyph')) {
  throw new Error('Axis glyph wrappers inside Admin hub titles must inherit the title typography.');
}

const workerFiles = requiredFiles.filter((file) => file.startsWith('functions/') && existsSync(file));
for (const file of workerFiles) {
  const source = readFileSync(file, 'utf8');
  if (/from ['"]node:|process\.env|server-only/.test(source)) throw new Error(`Cloudflare Function contains a Node-only dependency: ${file}`);
}

for (const file of [
  'functions/api/mux/library.ts',
  'functions/api/admin/mux-uploads.ts',
  'functions/api/admin/mux-assets/client.ts',
  'functions/api/admin/mux-assets/delete.ts',
  'functions/api/admin/mux-assets/metadata.ts',
  'functions/api/admin/mux-assets/playback.ts',
  'functions/api/admin/mux-assets/static-rendition.ts',
  'functions/api/admin/mux-assets/thumbnail.ts',
  'functions/api/admin/video-projects.ts',
  'functions/api/admin/video-collections.ts',
]) {
  if (!readFileSync(file, 'utf8').includes('adminResponse(')) throw new Error(`Mux admin Function is missing the session guard: ${file}`);
}

for (const legacyPath of [
  'app/admin/mux/[id]/page.tsx',
  'app/watch/[slug]/page.tsx',
  'app/watch/collection/[slug]/page.tsx',
  'app/api/mux/library/route.ts',
  'app/api/admin/mux-uploads/route.ts',
  'app/api/watch/download/route.ts',
]) {
  if (existsSync(legacyPath)) throw new Error(`Node-only Mux route must not return: ${legacyPath}`);
}

const adminEnvironment = readFileSync('functions/_lib/admin.ts', 'utf8');
if (!adminEnvironment.includes('MUX_TOKEN_ID?: string') || !adminEnvironment.includes('MUX_TOKEN_SECRET?: string')) throw new Error('Cloudflare Mux credentials are missing from the Function environment contract.');
if (/hasAdminSession[\s\S]{0,200}!env\.ADMIN_PASSWORD/.test(adminEnvironment) || /adminCookie[\s\S]{0,200}!env\.ADMIN_PASSWORD/.test(adminEnvironment)) throw new Error('Google-created admin sessions must not depend on ADMIN_PASSWORD.');

const adminLogin = readFileSync('components/AdminLogin.tsx', 'utf8');
if (!adminLogin.includes("fetch('/api/auth/config'") || !adminLogin.includes('passwordEnabled &&')) throw new Error('The password fallback must only appear when it is configured.');

const muxMigration = readFileSync('migrations/0005_mux_library.sql', 'utf8');
for (const table of ['mux_asset_metadata', 'mux_video_projects', 'mux_video_collections']) {
  if (!muxMigration.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) throw new Error(`D1 migration is missing ${table}.`);
}

console.log('Cloudflare release checks passed.');
