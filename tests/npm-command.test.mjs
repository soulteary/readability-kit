import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveNpmCommand} from '../tools/npm-command.mjs';

const execPath = String.raw`C:\Program Files\nodejs\node.exe`;
const cli = String.raw`C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`;
const bun = String.raw`C:\Users\reader\.bun\bin\bun.exe`;

test('Windows Bun invocation launches the npm JS entry with Node, including paths with spaces', () => {
  const invocation = resolveNpmCommand({
    platform: 'win32', execPath, env: {npm_execpath: bun, Path: String.raw`C:\Users\reader\.bun\bin;C:\Program Files\nodejs`},
    exists: file => file === cli,
  });
  assert.deepEqual(invocation, {command: execPath, prefix: [cli]});
});

test('Windows searches PATH before the Node installation for a separately installed npm', () => {
  const globalCLI = String.raw`C:\Users\reader\AppData\Roaming\npm\node_modules\npm\bin\npm-cli.js`;
  assert.deepEqual(resolveNpmCommand({
    platform: 'win32', execPath, env: {PATH: String.raw`C:\Users\reader\AppData\Roaming\npm`},
    exists: file => file === cli || file === globalCLI,
  }), {command: execPath, prefix: [globalCLI]});
});

test('Windows falls back to npm beside Node when PATH does not contain it', () => {
  assert.deepEqual(resolveNpmCommand({
    platform: 'win32', execPath, env: {npm_execpath: bun}, exists: file => file === cli,
  }), {command: execPath, prefix: [cli]});
});

test('npm-run invocation retains the supplied npm CLI script', () => {
  assert.deepEqual(resolveNpmCommand({
    platform: 'win32', execPath, env: {npm_execpath: cli}, exists: file => file === cli,
  }), {command: execPath, prefix: [cli]});
});

test('Windows reports missing npm instead of attempting to execute a cmd shim', () => {
  assert.throws(() => resolveNpmCommand({
    platform: 'win32', execPath, env: {npm_execpath: bun}, exists: () => false,
  }), /Cannot locate npm-cli\.js/);
});

test('POSIX Bun invocation continues to use npm from PATH', () => {
  assert.deepEqual(resolveNpmCommand({
    platform: 'darwin', execPath: '/usr/local/bin/node', env: {npm_execpath: '/usr/local/bin/bun'},
  }), {command: 'npm', prefix: []});
});
