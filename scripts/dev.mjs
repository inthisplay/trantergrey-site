import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nextBin = path.join(project, 'node_modules/next/dist/bin/next');
const wranglerBin = path.join(project, 'node_modules/wrangler/bin/wrangler.js');

const children = [];
let stopping = false;

function cloudflareRequest(pathname) {
  return pathname.startsWith('/api/') || pathname.startsWith('/watch/') || /^\/admin\/mux\/.+/.test(pathname);
}

const proxy = createServer((request, response) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  const port = cloudflareRequest(pathname) ? 3102 : 3101;
  const upstream = httpRequest({
    hostname: '127.0.0.1',
    port,
    method: request.method,
    path: request.url,
    headers: request.headers,
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('The local development service is starting. Refresh in a moment.');
  });
  request.pipe(upstream);
});

proxy.on('upgrade', (request, socket, head) => {
  const upstream = connect(3101, '127.0.0.1', () => {
    const headers = Object.entries(request.headers)
      .filter((entry) => entry[1] !== undefined)
      .map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(', ') : value}`)
      .join('\r\n');
    upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headers}\r\n\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
});

function start(command, args) {
  const child = spawn(command, args, { cwd: project, stdio: 'inherit' });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (stopping) return;
    stopping = true;
    for (const sibling of children) {
      if (sibling !== child && !sibling.killed) sibling.kill('SIGTERM');
    }
    process.exitCode = signal ? 1 : (code ?? 1);
  });
  return child;
}

function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
  proxy.close();
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('exit', () => stop());

start(process.execPath, [nextBin, 'dev', '-p', '3101']);
start(process.execPath, [
  wranglerBin,
  'pages',
  'dev',
  'out',
  '--port', '3102',
  '--inspector-port', '9230',
  '--env-file', '.env.local',
  '--persist-to', '.wrangler/state',
  '--show-interactive-dev-session', 'false',
]);
proxy.listen(3100, '127.0.0.1', () => {
  console.log('Local site ready at http://localhost:3100');
});
