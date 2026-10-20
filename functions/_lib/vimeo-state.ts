import type { AdminEnvironment } from './admin';

type VimeoState = { value: string };
type VimeoChunk = { value: string };
export type VimeoVideo = Record<string, unknown> & { id: string; libraryStatus: 'unreviewed' | 'published' | 'hidden' };
export type VimeoLibrary = { importedAt: string; source: 'vimeo'; clients?: string[]; videos: VimeoVideo[] };

function fromBase64(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const bytes = atob(padded);
  return Uint8Array.from(bytes, (byte) => byte.charCodeAt(0));
}

async function unpack(value: string) {
  if (!value.startsWith('gzip-base64:')) return value;
  const compressed = fromBase64(value.slice('gzip-base64:'.length));
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

async function pack(value: string) {
  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return `gzip-base64:${base64Url(bytes)}`;
}

function base64Url(bytes: Uint8Array) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function readVimeoLibrary(env: AdminEnvironment): Promise<VimeoLibrary | null> {
  const chunks = await env.TG_DATA.prepare("SELECT value FROM vimeo_state_chunks WHERE state_key = 'library' ORDER BY chunk_index").all<VimeoChunk>();
  const stored = chunks.results.length ? chunks.results.map((chunk) => chunk.value).join('') : (await env.TG_DATA.prepare("SELECT value FROM vimeo_state WHERE key = 'library'").first<VimeoState>())?.value;
  if (!stored) return null;
  try {
    const parsed = JSON.parse(await unpack(stored)) as Partial<VimeoLibrary>;
    if (!Array.isArray(parsed.videos) || typeof parsed.importedAt !== 'string') return null;
    return { importedAt: parsed.importedAt, source: 'vimeo', clients: Array.isArray(parsed.clients) ? parsed.clients.filter((client): client is string => typeof client === 'string') : [], videos: parsed.videos.filter((video): video is VimeoVideo => Boolean(video && typeof video === 'object' && typeof (video as VimeoVideo).id === 'string')) };
  } catch { return null; }
}

export async function writeVimeoLibrary(env: AdminEnvironment, library: VimeoLibrary) {
  const value = await pack(JSON.stringify(library));
  const chunks = Array.from({ length: Math.ceil(value.length / 48_000) }, (_, index) => value.slice(index * 48_000, (index + 1) * 48_000));
  await env.TG_DATA.prepare("DELETE FROM vimeo_state_chunks WHERE state_key = 'library'").run();
  await Promise.all(chunks.map((chunk, index) => env.TG_DATA.prepare('INSERT INTO vimeo_state_chunks (state_key, chunk_index, value) VALUES (?, ?, ?)').bind('library', index, chunk).run()));
  await env.TG_DATA.prepare("INSERT INTO vimeo_state (key, value, updated_at) VALUES ('library', 'chunked-gzip-base64', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(new Date().toISOString()).run();
}
