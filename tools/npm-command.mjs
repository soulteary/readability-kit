import {existsSync} from 'node:fs';
import path from 'node:path';

export function resolveNpmCommand({
  env = process.env, platform = process.platform, execPath = process.execPath,
  exists = existsSync,
} = {}) {
  // Bun sets npm_execpath to its binary, which Node cannot execute as a script.
  if (/(?:^|[/\\])npm-cli\.js$/.test(env.npm_execpath ?? '') && exists(env.npm_execpath)) {
    return {command: execPath, prefix: [env.npm_execpath]};
  }
  if (platform !== 'win32') return {command: 'npm', prefix: []};

  // Windows npm.cmd shims cannot be spawned directly by execFileSync. Locate
  // npm's JS entry beside a PATH shim or the Node installation instead.
  const searchPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  const directories = [...searchPath.split(';').filter(Boolean), path.win32.dirname(execPath)];
  for (const directory of directories) {
    const cli = path.win32.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (exists(cli)) return {command: execPath, prefix: [cli]};
  }
  throw new Error('Cannot locate npm-cli.js. Install npm with Node.js and add its directory to PATH.');
}
