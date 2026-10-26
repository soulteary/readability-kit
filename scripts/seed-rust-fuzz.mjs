#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'fuzz/corpus/extract_html');
await mkdir(output, {recursive: true});
let count = 0;
async function seed(html) {
  const bytes = Buffer.from(html);
  if (bytes.length > 262144) return;
  await writeFile(join(output, createHash('sha256').update(bytes).digest('hex')), bytes);
  count++;
}
for (const item of JSON.parse(await readFile(join(root, 'test/compatibility-fixtures.json'), 'utf8'))) await seed(item.html);
// Retain the UTF-8 video-attribute crash reproducer in every seeded run.
for (const prefix of ['中', 'é', '😀', '中文']) {
  await seed(`<article><p>${'Evidence needs context, careful interpretation, and reproducible observations. '.repeat(20)}</p><iframe title="${prefix}youtube.com"></iframe><p><a href="http-guide.html">Source guide</a></p></article>`);
}
const fixtures = join(root, 'vendor/mozilla/test/test-pages');
for (const entry of await readdir(fixtures, {withFileTypes: true})) {
  if (!entry.isDirectory()) continue;
  try { await seed(await readFile(join(fixtures, entry.name, 'source.html'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
console.log(`Seeded ${count} fixture inputs at ${output} (each <= 262144 bytes).`);
