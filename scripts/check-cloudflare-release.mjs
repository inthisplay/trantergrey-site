import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'out/login.html',
  'functions/api/auth/google.ts',
  'functions/api/auth/google/callback.ts',
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

console.log('Cloudflare release checks passed.');
