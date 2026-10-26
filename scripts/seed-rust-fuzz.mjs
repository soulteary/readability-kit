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
const fixtures = join(root, 'vendor/mozilla/test/test-pages');
for (const entry of await readdir(fixtures, {withFileTypes: true})) {
  if (!entry.isDirectory()) continue;
  try { await seed(await readFile(join(fixtures, entry.name, 'source.html'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
console.log(`Seeded ${count} fixture inputs at ${output} (each <= 262144 bytes).`);
