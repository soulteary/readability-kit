import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveNpmCommand} from './npm-command.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'readability-wasm-consumer-'));
const {command, prefix} = resolveNpmCommand();
const run = (binary, args, cwd = temporary) => execFileSync(binary, args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});
const npm = (args, cwd) => run(command, [...prefix, ...args], cwd);
let success = false;
try {
  const [packed] = JSON.parse(npm([
    'pack', '--ignore-scripts=false', '--foreground-scripts=false', '--json', '--pack-destination', temporary,
  ], join(root, 'packages/wasm')));
  assert.equal(packed.name, '@soulteary/readability-kit-wasm');
  const files = new Set(packed.files.map(file => file.path));
  for (const name of ['pkg/index.js', 'pkg/index.d.ts', 'pkg/types.d.ts', 'pkg/worker.js',
    'pkg/readability_wasm.js', 'pkg/readability_wasm_bg.wasm', 'LICENSE', 'NOTICE',
    'UPSTREAM.md', 'PATCHES.md', 'upstream.json', 'dependencies.json']) {
    assert.ok(files.has(name), `Missing package file: ${name}`);
  }
  // source/ intentionally contains corresponding dependency source for redistribution.
  for (const file of files) assert.doesNotMatch(file, /^(?:src|test|tests|node_modules)\//);
  await writeFile(join(temporary, 'package.json'), JSON.stringify({
    name: 'wasm-package-consumer', private: true, type: 'module',
    dependencies: {[packed.name]: `file:${join(temporary, packed.filename)}`},
  }));
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund']);
  await writeFile(join(temporary, 'consumer.mjs'), `
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {init, extractHTML, isProbablyReaderable, createWorkerReader} from '@soulteary/readability-kit-wasm';
const entry = new URL(import.meta.resolve('@soulteary/readability-kit-wasm'));
await init(await readFile(new URL('./readability_wasm_bg.wasm', entry)));
assert.equal(typeof createWorkerReader, 'function');
assert.ok(import.meta.resolve('@soulteary/readability-kit-wasm/worker').endsWith('/pkg/worker.js'));
const html = '<article><h1>Installed WASM</h1><p>' + 'Substantial article prose with supporting evidence. '.repeat(30) + '</p></article>';
for (const engine of ['chromium', 'mozilla']) {
  const article = extractHTML(html, {url: 'https://example.test/story', engine});
  assert.ok(article);
  assert.equal(article.engine, engine);
  assert.equal(article.length, article.textContent.length);
  assert.equal(isProbablyReaderable(html, {engine}), true);
}
`);
  run(process.execPath, ['consumer.mjs']);
  await writeFile(join(temporary, 'consumer.mts'), `
import {init, extractHTML, isProbablyReaderable, createWorkerReader, type Article, type HTMLExtractOptions} from '@soulteary/readability-kit-wasm';
const options: HTMLExtractOptions = {url: 'https://example.test/story', engine: 'mozilla'};
const article: Article | null = extractHTML('<p>Text</p>', options);
const hint: boolean = isProbablyReaderable('<p>Text</p>');
const ready: Promise<void> = init(new Uint8Array());
const worker = await createWorkerReader();
const asyncArticle: Article | null = await worker.extractHTML('<p>Text</p>', options);
worker.terminate();
// @ts-expect-error Source URL is required.
extractHTML('<p>Text</p>', {});
// @ts-expect-error Unknown engines must be rejected.
isProbablyReaderable('<p>Text</p>', {engine: 'unknown'});
`);
  run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'),
    '--noEmit', '--strict', '--skipLibCheck', '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext', '--target', 'ES2022', '--lib', 'ES2022,DOM', 'consumer.mts']);
  for (const name of ['index.d.ts', 'types.d.ts']) {
    const declaration = await readFile(join(temporary, 'node_modules', packed.name, 'pkg', name), 'utf8');
    assert.doesNotMatch(declaration, /shared\/src|javascript\/src|workspace:/);
  }
  success = true;
  console.log('WASM package passed: isolated npm install, public exports, both engines, readerability and TypeScript declarations.');
} finally {
  if (success) await rm(temporary, {recursive: true, force: true});
  else console.error(`WASM consumer retained for diagnosis: ${temporary}`);
}
