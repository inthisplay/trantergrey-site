import type { AdminEnvironment } from './admin';

type VimeoState = { value: string };
type VimeoChunk = { value: string };

function fromBase64(value: string) {
  const bytes = atob(value);
  return Uint8Array.from(bytes, (byte) => byte.charCodeAt(0));
}

async function unpack(value: string) {
  if (!value.startsWith('gzip-base64:')) return value;
  const compressed = fromBase64(value.slice('gzip-base64:'.length));
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export async function readVimeoLibrary(env: AdminEnvironment) {
  const chunks = await env.TG_DATA.prepare("SELECT value FROM vimeo_state_chunks WHERE state_key = 'library' ORDER BY chunk_index").all<VimeoChunk>();
  const stored = chunks.results.length ? chunks.results.map((chunk) => chunk.value).join('') : (await env.TG_DATA.prepare("SELECT value FROM vimeo_state WHERE key = 'library'").first<VimeoState>())?.value;
  if (!stored) return null;
  try { return JSON.parse(await unpack(stored)) as { videos?: unknown[]; importedAt?: string }; } catch { return null; }
}
