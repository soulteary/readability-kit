// SPDX-License-Identifier: Apache-2.0

import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const projectRoot = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
]);

let demoPort;
try {
  const { values } = parseArgs({
    options: { port: { type: 'string', default: process.env.READABILITY_DEMO_PORT || '4173' } },
    strict: true,
    allowPositionals: false,
  });
  demoPort = Number(values.port);
  if (!Number.isInteger(demoPort) || demoPort < 1 || demoPort > 65535) {
    throw new Error('--port must be an integer between 1 and 65535.');
  }
} catch (error) {
  console.error(`readability-kit demo: ${error.message}`);
  process.exit(1);
}

function isAllowedPath(filename) {
  const pathFromRoot = relative(projectRoot, filename);
  if (!pathFromRoot || pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`)) return false;
  const parts = pathFromRoot.split(sep);
  if (parts.some((part) => part.startsWith('.'))) return false;
  return parts[0] === 'dist' || (parts[0] === 'examples' && parts[1] === 'reader');
}

function respond(response, code, message) {
  response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(`${message}\n`);
}

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    respond(response, 405, 'Method not allowed.');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
  } catch {
    respond(response, 400, 'Invalid request path.');
    return;
  }
  if (pathname.includes('\0') || pathname.includes('\\')) {
    respond(response, 400, 'Invalid request path.');
    return;
  }
  if (pathname === '/') {
    response.writeHead(302, { Location: '/examples/reader/' });
    response.end();
    return;
  }

  try {
    let filename = resolve(projectRoot, `.${pathname}`);
    if (!isAllowedPath(filename)) {
      respond(response, 404, 'Not found.');
      return;
    }
    filename = await realpath(filename);
    if (!isAllowedPath(filename)) {
      respond(response, 404, 'Not found.');
      return;
    }
    let information = await stat(filename);
    if (information.isDirectory()) {
      filename = await realpath(join(filename, 'index.html'));
      if (!isAllowedPath(filename)) {
        respond(response, 404, 'Not found.');
        return;
      }
      information = await stat(filename);
    }
    if (!information.isFile()) {
      respond(response, 404, 'Not found.');
      return;
    }
    const body = request.method === 'HEAD' ? null : await readFile(filename);
    response.writeHead(200, {
      'Content-Type': mimeTypes.get(extname(filename)) || 'application/octet-stream',
      'Content-Length': information.size,
    });
    response.end(body);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) {
      respond(response, 404, 'Not found.');
    } else {
      console.error('readability-kit demo: Unable to serve a requested file.');
      respond(response, 500, 'Unable to serve this file.');
    }
  }
});

server.on('error', (error) => {
  const message = error.code === 'EADDRINUSE'
    ? `Port ${demoPort} is busy. Try bun run demo --port ${demoPort + 1 <= 65535 ? demoPort + 1 : 4173}.`
    : error.message;
  console.error(`readability-kit demo: ${message}`);
  process.exitCode = 1;
});

server.listen(demoPort, '127.0.0.1', () => {
  console.log(`readability-kit demo: http://127.0.0.1:${demoPort}/examples/reader/`);
  console.log('Press Ctrl+C to stop.');
});
