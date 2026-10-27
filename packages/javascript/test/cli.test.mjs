// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const sourceURL = 'https://example.test/articles/a-useful-page';
const paragraph = 'A useful article explains an observation carefully, connects it to practical work, and gives the reader enough detail to evaluate the conclusion. Its paragraphs should survive extraction without the surrounding navigation. ';
const html = `<!doctype html><html lang="en"><head><title>A useful page</title></head><body><nav>Home and offers</nav><article><h1>A useful page</h1><p>${paragraph.repeat(5)}</p><h2>Keep the details</h2><p>${paragraph.repeat(5)} <a href="../notes">Supporting notes</a></p></article></body></html>`;
const emptyHTML = '<!doctype html><html><head><title>Empty page</title></head><body></body></html>';

function run(args, input) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: projectRoot,
    input,
    encoding: 'utf8',
    timeout: 20_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, 'CLI should exit normally');
  return result;
}

async function withDirectory(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'readability-kit-cli-'));
  try {
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('CLI help and version work without input or source URL', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage: readability-kit/);
  assert.match(help.stdout, /--url/);
  assert.equal(help.stderr, '');

  const version = run(['--version']);
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), metadata.version);
  assert.equal(version.stderr, '');
});

test('CLI extracts a local file as Chromium JSON by default', async () => {
  await withDirectory(async (directory) => {
    const filename = join(directory, 'article.html');
    await writeFile(filename, html);
    const result = run([filename, '--url', sourceURL]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    const article = JSON.parse(result.stdout);
    assert.equal(article.engine, 'chromium');
    assert.equal(article.url, sourceURL);
    assert.equal(article.title, 'A useful page');
    assert.match(article.textContent, /Keep the details/);
    assert.match(article.content, /https:\/\/example\.test\/notes/);
    assert.equal(await readFile(filename, 'utf8'), html, 'input file must remain unchanged');
  });
});

test('CLI reads standard input and selects the Mozilla engine', () => {
  const result = run(['-', '--url', sourceURL, '--engine', 'mozilla'], html);
  assert.equal(result.status, 0, result.stderr);
  const article = JSON.parse(result.stdout);
  assert.equal(article.engine, 'mozilla');
  assert.equal(article.title, 'A useful page');
  assert.match(article.textContent, /A useful article explains/);
});

test('CLI emits standalone HTML and plain text formats', () => {
  const htmlResult = run(['-', `--url=${sourceURL}`, '--format=html'], html);
  assert.equal(htmlResult.status, 0, htmlResult.stderr);
  assert.match(htmlResult.stdout, /<p>/);
  assert.match(htmlResult.stdout, /Supporting notes/);
  assert.doesNotMatch(htmlResult.stdout, /"engine":/);

  const textResult = run(['-', '--url', sourceURL, '--format', 'text'], html);
  assert.equal(textResult.status, 0, textResult.stderr);
  assert.match(textResult.stdout, /A useful article explains/);
  assert.doesNotMatch(textResult.stdout, /<\/?(?:p|div|a|h[1-6])\b/);
});

test('CLI requires a source URL and rejects unsupported arguments', () => {
  for (const args of [
    ['-'],
    ['-', '--url', 'file:///tmp/article.html'],
    ['-', '--url', 'not-a-url'],
    ['-', '--url', sourceURL, '--engine', 'unknown'],
    ['-', '--url', sourceURL, '--format', 'markdown'],
    ['-', '--url', sourceURL, '--unknown'],
  ]) {
    const result = run(args, html);
    assert.equal(result.status, 1, `Expected argument error for ${JSON.stringify(args)}`);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^readability-kit:/);
  }
});

test('CLI returns exit code 2 and no output when there is no article', () => {
  const result = run(['-', '--url', sourceURL], emptyHTML);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /No article was found/);
});

test('CLI writes an output file after successful extraction', async () => {
  await withDirectory(async (directory) => {
    const filename = join(directory, 'article.json');
    await writeFile(filename, 'previous output');
    const result = run(['-', '--url', sourceURL, '--output', filename], html);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(await readFile(filename, 'utf8')).title, 'A useful page');
    assert.deepEqual(await readdir(directory), ['article.json'], 'temporary output must be cleaned up');
  });
});

test('CLI preserves an existing output file when extraction or input fails', async () => {
  await withDirectory(async (directory) => {
    const filename = join(directory, 'article.json');
    const previous = 'Keep this existing result.';
    await writeFile(filename, previous);

    const noArticle = run(['-', '--url', sourceURL, '--output', filename], emptyHTML);
    assert.equal(noArticle.status, 2, noArticle.stderr);
    assert.equal(await readFile(filename, 'utf8'), previous);

    const missingInput = run([join(directory, 'missing.html'), '--url', sourceURL, '--output', filename]);
    assert.equal(missingInput.status, 1);
    assert.equal(missingInput.stdout, '');
    assert.equal(await readFile(filename, 'utf8'), previous);
    assert.deepEqual(await readdir(directory), ['article.json']);
  });
});

test('CLI reports output write errors without leaving temporary files', async () => {
  await withDirectory(async (directory) => {
    // Renaming a complete output file onto a directory must fail safely.
    const result = run(['-', '--url', sourceURL, '--output', directory], html);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^readability-kit:/);
    assert.deepEqual(await readdir(directory), []);
  });
});
