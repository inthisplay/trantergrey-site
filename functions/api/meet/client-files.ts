import { plugNmeetRequest, publicPlugNmeetConfig, type PlugNmeetEnv } from '../../_lib/plugnmeet';

type Context = { env: PlugNmeetEnv };
type ClientFilesResponse = {
  status?: boolean;
  msg?: string;
  css_files?: string[];
  js_files?: string[];
  static_assets_path?: string;
};

const safeFile = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9._-]+$/.test(value);

export async function onRequestGet({ env }: Context): Promise<Response> {
  try {
    const { serverUrl } = publicPlugNmeetConfig(env);
    const files = await plugNmeetRequest<ClientFilesResponse>(env, '/getClientFiles', {});
    const css = (files.css_files ?? []).filter(safeFile);
    const js = (files.js_files ?? []).filter(safeFile);
    if (!css.length || !js.length) throw new Error('Meeting client files are unavailable.');

    const assets = typeof files.static_assets_path === 'string' && /^https:\/\//.test(files.static_assets_path)
      ? files.static_assets_path.replace(/\/+$/, '')
      : `${serverUrl}/assets`;

    return Response.json({
      serverUrl,
      staticAssetsPath: assets,
      css: css.map((file) => `${assets}/css/${file}`),
      js: js.map((file) => ({ src: `${assets}/js/${file}`, module: file.startsWith('main-module.') })),
    }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch {
    return Response.json({ error: 'The meeting interface is temporarily unavailable.' }, { status: 502 });
  }
}
