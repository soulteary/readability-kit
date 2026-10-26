import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rename, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageJSON = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const workspace = await mkdtemp(path.join(os.tmpdir(), 'readability-kit-package-'));
// Bun also sets npm_execpath, but its executable is not an npm CLI script.
const npmCLI = /(?:^|[/\\])npm-cli\.js$/.test(process.env.npm_execpath ?? '')
  ? process.env.npm_execpath : null;
const npmCommand = npmCLI ? process.execPath :
  (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const npmPrefix = npmCLI ? [npmCLI] : [];
let success = false;

function run(command, args, cwd = workspace) {
  try {
    return execFileSync(command, args, {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024,
    }).trim();
  } catch (error) {
    const details = [error.stdout, error.stderr].filter(Boolean).join('\n');
    throw new Error(`${path.basename(command)} ${args.join(' ')} failed:\n${details}`, {cause: error});
  }
}

function npm(args, cwd) {
  return run(npmCommand, [...npmPrefix, ...args], cwd);
}

try {
  const [packed] = JSON.parse(npm([
    'pack', '--ignore-scripts', '--json', '--pack-destination', workspace,
  ], root));
  assert.ok(packed?.filename && packed?.integrity, 'npm pack must produce one tarball with integrity');
  const files = new Set(packed.files.map(file => file.path));
  const required = [
    'package.json', 'LICENSE', 'NOTICE', 'upstream.json',
    'LICENSES/Apache-2.0.txt', 'LICENSES/BSD-3-Clause-Chromium.txt',
    'LICENSES/DOMPurify-LICENSE.txt',
    'dist/index.js', 'dist/index.cjs', 'dist/node.js', 'dist/node.cjs', 'dist/cli.js',
    'dist/index.d.ts', 'dist/index.d.cts', 'dist/node.d.ts', 'dist/node.d.cts',
    'dist/types.d.ts', 'dist/types.d.cts',
    'dist/index.js.LEGAL.txt', 'dist/index.cjs.LEGAL.txt',
  ];
  for (const file of required) assert.ok(files.has(file), `Tarball is missing ${file}`);
  for (const file of files) {
    assert.doesNotMatch(file, /^(?:vendor|src|test|tests|node_modules|examples|scripts|\.github)\//,
      `Source or development content leaked into the tarball: ${file}`);
    assert.doesNotMatch(file, /(?:^|\/)fixtures(?:\/|$)/,
      `A test fixture leaked into the tarball: ${file}`);
  }

  const tarball = path.join(workspace, packed.filename);
  const dependency = `file:${tarball}`;
  const consumer = {
    name: 'readability-kit-package-smoke', version: '1.0.0', private: true, type: 'module',
    dependencies: {[packageJSON.name]: dependency},
  };
  await writeFile(path.join(workspace, 'package.json'), JSON.stringify(consumer, null, 2));

  // Exercise a real npm consumer install. Bun's cache and lockfile are separate
  // from npm's, so this check requires registry access on a cold npm cache.
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund'], workspace);

  const prose = 'A portable reader preserves useful paragraphs, resolves source links, ' +
    'and provides a stable result without executing the original page. ';
  const html = `<!doctype html><title>Package smoke article</title><article><h1>Package smoke article</h1>` +
    `<p>${prose.repeat(5)}<a href="../guide">Read the guide</a></p></article>`;
  const assertionSource = `
assert.equal(typeof core.extractDocument, 'function');
assert.equal(typeof core.isProbablyReaderable, 'function');
for (const engine of ['chromium', 'mozilla']) {
  const article = node.extractHTML(${JSON.stringify(html)}, {
    url: 'https://example.test/news/story', engine,
  });
  assert.ok(article);
  assert.equal(article.engine, engine);
  assert.equal(article.title, 'Package smoke article');
  assert.ok(article.content.includes('href="https://example.test/guide"'));
  assert.equal(article.length, article.textContent.length);
}
`;
  const esm = `import assert from 'node:assert/strict';
import * as core from ${JSON.stringify(packageJSON.name)};
import * as node from ${JSON.stringify(`${packageJSON.name}/node`)};
${assertionSource}`;
  const cjs = `const assert = require('node:assert/strict');
const core = require(${JSON.stringify(packageJSON.name)});
const node = require(${JSON.stringify(`${packageJSON.name}/node`)});
${assertionSource}`;
  await writeFile(path.join(workspace, 'consumer.mjs'), esm);
  await writeFile(path.join(workspace, 'consumer.cjs'), cjs);
  run(process.execPath, ['consumer.mjs']);
  run(process.execPath, ['consumer.cjs']);

  const esmTypes = `import {extractDocument, isProbablyReaderable, type Article, type Engine, type ExtractOptions} from ${JSON.stringify(packageJSON.name)};
import {extractHTML, type HTMLExtractOptions} from ${JSON.stringify(`${packageJSON.name}/node`)};
const options: ExtractOptions = {engine: 'chromium', sanitize: true, charThreshold: 100};
const htmlOptions: HTMLExtractOptions = {...options, url: 'https://example.test/story'};
declare const document: Document;
const hint: boolean = isProbablyReaderable(document);
const documentArticle: Article | null = extractDocument(document, options);
const htmlArticle: Article | null = extractHTML('<p>A paragraph</p>', htmlOptions);
if (htmlArticle) {
  const engine: Engine = htmlArticle.engine;
  const length: number = htmlArticle.length;
}
// @ts-expect-error An unknown engine must not silently become any.
extractHTML('<p>A paragraph</p>', {url: 'https://example.test/', engine: 'unknown'});
// @ts-expect-error The Node entry requires a source URL.
extractHTML('<p>A paragraph</p>', {});
`;
  const cjsTypes = `import core = require(${JSON.stringify(packageJSON.name)});
import node = require(${JSON.stringify(`${packageJSON.name}/node`)});
const options: core.ExtractOptions = {engine: 'mozilla', flattenShadowRoots: true};
declare const document: Document;
const hint: boolean = core.isProbablyReaderable(document);
const documentArticle: core.Article | null = core.extractDocument(document, options);
const htmlOptions: node.HTMLExtractOptions = {...options, url: 'https://example.test/story'};
const htmlArticle: core.Article | null = node.extractHTML('<p>A paragraph</p>', htmlOptions);
// @ts-expect-error Unknown engines must be rejected by the CJS declarations too.
core.extractDocument(document, {engine: 'unknown'});
`;
  await writeFile(path.join(workspace, 'consumer.mts'), esmTypes);
  await writeFile(path.join(workspace, 'consumer.cts'), cjsTypes);
  run(process.execPath, [
    path.join(root, 'node_modules/typescript/bin/tsc'),
    '--noEmit', '--strict', '--skipLibCheck', '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext', '--target', 'ES2022', '--lib', 'ES2022,DOM',
    'consumer.mts', 'consumer.cts',
  ]);

  const installedPackage = path.join(workspace, 'node_modules', packageJSON.name);
  const cli = process.platform === 'win32' ?
    run(process.execPath, [path.join(installedPackage, packageJSON.bin['readability-kit']), '--version']) :
    run(path.join(workspace, 'node_modules/.bin/readability-kit'), ['--version']);
  assert.match(cli, new RegExp(`(?:^|\\s)${packageJSON.version.replaceAll('.', '\\.')}\\s*$`));

  // The browser entry must remain usable without the Node adapter's DOM package.
  // This is a fresh process, so an earlier import cannot hide a leaked dependency.
  const jsdom = path.join(workspace, 'node_modules/jsdom');
  const parkedJsdom = path.join(workspace, 'node_modules/jsdom-unused-by-browser');
  await rename(jsdom, parkedJsdom);
  try {
    run(process.execPath, ['--input-type=module', '-e',
      `import {extractDocument} from ${JSON.stringify(packageJSON.name)}; if (typeof extractDocument !== 'function') throw new Error('Missing browser export');`]);
    run(process.execPath, ['-e',
      `if (typeof require(${JSON.stringify(packageJSON.name)}).extractDocument !== 'function') throw new Error('Missing CJS browser export');`]);
  } finally {
    await rename(parkedJsdom, jsdom);
  }

  success = true;
  console.log(`Package smoke passed: ${files.size} packed files; isolated npm install; ESM/CJS extraction; ESM/CJS types; CLI; browser entry without jsdom.`);
} finally {
  if (success) await rm(workspace, {recursive: true, force: true});
  else console.error(`Package smoke workspace retained for diagnosis: ${workspace}`);
}
