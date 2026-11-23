import type { AdminEnvironment } from './admin';

type Variant = 'thumb' | 'preview' | 'poster';
async function generate(env: AdminEnvironment, key: string, variant: Variant) {
  const optimizer = env.MEDIA_OPTIMIZER;
  if (!optimizer) return;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([(async () => {
    const response = await optimizer.fetch('https://media-optimizer/', {
      method: 'POST', signal: controller.signal, body: JSON.stringify({ key, variant }),
    });
    await response.text();
    })(), new Promise<void>(resolve => { timer = setTimeout(() => { controller.abort(); resolve(); }, 10_000); })]);
  } catch (error) { console.error('Media preview unavailable', error); } finally { clearTimeout(timer); }
}

// Originals are already safely stored before this is called. Preview failure must never fail an upload.
export async function prepareMediaPreviews(env: AdminEnvironment, key: string, contentType: string) {
  for (const variant of contentType.startsWith('video/') ? ['poster'] as const : contentType.startsWith('image/') ? ['thumb', 'preview'] as const : []) {
    await generate(env, key, variant);
  }
}

// Call only AFTER authentication and the source record's access/deletion checks.
export async function mediaPreviewResponse(request: Request, env: AdminEnvironment, key: string, contentType: string | null): Promise<Response | null> {
  const variant = new URL(request.url).searchParams.get('variant');
  if (!variant) return null;
  if (!['thumb', 'preview', 'poster'].includes(variant) || (variant === 'poster' ? !contentType?.startsWith('video/') : !contentType?.startsWith('image/'))) {
    return new Response('Invalid preview', { status: 400 });
  }
  type Preview = { output_key: string; content_type: string; byte_size: number };
  const read = () => env.TG_DATA.prepare("SELECT output_key,content_type,byte_size FROM media_previews WHERE source_key=? AND variant=? AND status='ready'").bind(key, variant).first<Preview>();
  let preview = await read();
  if (!preview) { await generate(env, key, variant as Variant); preview = await read(); }
  if (preview && env.PRODUCTION_ARCHIVE) {
    const file = await env.PRODUCTION_ARCHIVE.get(preview.output_key);
    if (file) return new Response(file.body, { headers: {
      'Content-Type': preview.content_type, 'Content-Length': String(file.size),
      'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    } });
  }
  // A missing poster must not cause every grid tile to download the movie.
  if (variant === 'poster') return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><rect width="640" height="480" fill="#ddd8d9"/><path d="M280 170v140l110-70z" fill="#73666b"/></svg>', { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=60', 'X-Content-Type-Options': 'nosniff' } });
  return null; // The original image remains usable if optimization is unavailable.
}
