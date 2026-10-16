import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dataDirectory } from './data-directory';

type VimeoConnection = { accessToken: string; scope?: string; connectedAt: string };
const connectionFile = path.join(dataDirectory, 'vimeo-connection.json');

export async function saveVimeoConnection(connection: VimeoConnection) {
  await fs.mkdir(path.dirname(connectionFile), { recursive: true, mode: 0o700 });
  await fs.writeFile(connectionFile, JSON.stringify(connection), { encoding: 'utf8', mode: 0o600 });
  await fs.chmod(connectionFile, 0o600);
}

export async function hasVimeoConnection() {
  try { await fs.access(connectionFile); return true; } catch { return false; }
}

export async function getVimeoConnection(): Promise<VimeoConnection | null> {
  try {
    const connection = JSON.parse(await fs.readFile(connectionFile, 'utf8')) as VimeoConnection;
    return connection.accessToken ? connection : null;
  } catch {
    return null;
  }
}
