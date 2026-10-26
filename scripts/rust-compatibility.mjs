#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import {createHash} from 'node:crypto';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve, join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const hash = value => createHash('sha256').update(value).digest('hex');
const normalize = value => typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : value;
export function resultOf(fn) {
  try { const article = fn(); return {status: article === null ? 'empty' : 'ok', article}; }
  catch (error) { return {status: 'error', article: null, error: String(error.message ?? error)}; }
}
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (object, key) => Object.hasOwn(object, key);
export function validateSnapshot(snapshot) {
  if (!isObject(snapshot) || snapshot.schema !== 1) throw new Error('Unsupported snapshot schema.');
  if (!Array.isArray(snapshot.cases)) throw new Error('Snapshots must contain case arrays.');
  for (const item of snapshot.cases) {
    if (!isObject(item) || typeof item.id !== 'string' || !item.id ||
        typeof item.html !== 'string' || item.inputHash !== hash(item.html) ||
        !['api', 'raw', 'readerable'].includes(item.layer) || !isObject(item.options) ||
        !['chromium', 'mozilla'].includes(item.options.engine)) throw new Error('Invalid snapshot case or HTML hash.');
    const result = item.result;
    if (!isObject(result) || !['ok', 'empty', 'error'].includes(result.status) || !has(result, 'article')) throw new Error(`Invalid result envelope: ${item.id}`);
    if (result.status !== 'ok') {
      if (result.article !== null || (result.status === 'error' && typeof result.error !== 'string') ||
          (result.status === 'empty' && item.layer === 'readerable')) throw new Error(`Invalid empty/error result: ${item.id}`);
      continue;
    }
    if (item.layer === 'readerable') {
      if (typeof result.article !== 'boolean') throw new Error(`Invalid readerability result: ${item.id}`);
      continue;
    }
    const article = result.article;
    if (!isObject(article)) throw new Error(`Invalid Article: ${item.id}`);
    for (const field of ['title', 'content', 'textContent']) if (typeof article[field] !== 'string') throw new Error(`Invalid Article ${field}: ${item.id}`);
    if (!Number.isSafeInteger(article.length) || article.length < 0) throw new Error(`Invalid Article length: ${item.id}`);
    for (const field of ['byline', 'dir', 'lang', 'excerpt', 'siteName', 'publishedTime']) {
      // Raw upstream omits some metadata; the normalized public API requires it.
      if ((item.layer === 'api' || has(article, field)) && article[field] !== null && typeof article[field] !== 'string') throw new Error(`Invalid Article ${field}: ${item.id}`);
    }
    if (item.layer === 'api' && (typeof article.url !== 'string' || !['chromium', 'mozilla'].includes(article.engine))) throw new Error(`Invalid Article URL/engine: ${item.id}`);
  }
}
export function compareSnapshots(reference, candidate) {
  validateSnapshot(reference);
  validateSnapshot(candidate);
  if (reference.schema !== 1 || candidate.schema !== 1) throw new Error('Unsupported snapshot schema.');
  if (!Array.isArray(reference.cases) || !Array.isArray(candidate.cases)) throw new Error('Snapshots must contain case arrays.');
  const referenceIDs = new Set(reference.cases.map(item => item.id));
  if (referenceIDs.size !== reference.cases.length) throw new Error('Duplicate reference case IDs.');
  const actual = new Map(candidate.cases.map(item => [item.id, item]));
  if (actual.size !== candidate.cases.length) throw new Error('Duplicate candidate case IDs.');
  const differences = [];
  if (reference.cases.length === 0) differences.push({id: 'snapshot', field: 'cases', expected: 'nonempty reference corpus', actual: 0});
  for (const expected of reference.cases) {
    const found = actual.get(expected.id);
    actual.delete(expected.id);
    if (!found) { differences.push({id: expected.id, field: 'case', expected: 'present', actual: 'missing'}); continue; }
    for (const key of ['inputHash', 'options', 'layer']) {
      if (!isDeepStrictEqual(expected[key], found[key])) differences.push({id: expected.id, field: key, expected: expected[key], actual: found[key]});
    }
    if (found.result.transportError === true) differences.push({id: expected.id, field: 'transportError', expected: false, actual: true});
    const fields = new Set([...Object.keys(expected.result), ...Object.keys(found.result)].filter(field => field !== 'transportError'));
    for (const field of fields) {
      if (field === 'article' && expected.result.article && found.result.article) {
        for (const name of new Set([...Object.keys(expected.result.article), ...Object.keys(found.result.article)])) {
          const before = expected.result.article[name], after = found.result.article[name];
          if (has(expected.result.article, name) !== has(found.result.article, name) || !isDeepStrictEqual(before, after)) differences.push({id: expected.id, field: name, expected: before, actual: after, ...(typeof before === 'string' && typeof after === 'string' ? {normalizedEqual: normalize(before) === normalize(after)} : {})});
        }
      } else if (has(expected.result, field) !== has(found.result, field) || !isDeepStrictEqual(expected.result[field], found.result[field])) differences.push({id: expected.id, field, expected: expected.result[field], actual: found.result[field]});
    }
  }
  for (const id of actual.keys()) differences.push({id, field: 'case', expected: 'absent', actual: 'extra'});
  const differingCases = new Set(differences.map(item => item.id));
  const byField = {};
  const byGroup = {};
  for (const item of differences) byField[item.field] = (byField[item.field] ?? 0) + 1;
  for (const item of reference.cases) {
    const group = `${item.options.engine}/${item.layer}`;
    byGroup[group] ??= {cases: 0, differingCases: 0};
    byGroup[group].cases++;
    if (differingCases.has(item.id)) byGroup[group].differingCases++;
  }
  return {schema: 1, compared: reference.cases.length, passed: differences.length === 0,
    summary: {differingCases: differingCases.size, byField, byGroup}, differences};
}
const readerableHTML = '<article><p>' + 'A substantial paragraph explaining the investigation and its findings. '.repeat(20) + '</p><p>' + 'Additional evidence supports the conclusions of this article. '.repeat(20) + '</p></article>';
const readerableFixtures = [
  {id: 'empty', html: '<html><body></body></html>'},
  {id: 'article', html: readerableHTML},
  {id: 'unicode-utf16-threshold', html: '<p>' + '🙂'.repeat(141) + '</p>', options: {minContentLength: 140, minScore: 1}},
  {id: 'hidden', html: `<article hidden>${readerableHTML}</article>`},
  {id: 'custom-thresholds', html: readerableHTML, options: {minContentLength: 10, minScore: 1}},
  {id: 'high-threshold', html: readerableHTML, options: {minContentLength: 100000}},
  ...[{minScore: -1}, {minScore: null}, {minContentLength: 1.5}, {minContentLength: null}, {flattenShadowRoots: 'yes'}].map((options, index) => ({id: `invalid-${index}`, html: readerableHTML, options})),
];
async function capture(readerable = false) {
  const {JSDOM, VirtualConsole} = await import('jsdom');
  const {extractHTML, isProbablyReaderable} = await import('../dist/node.js');
  const engines = Object.fromEntries(['chromium', 'mozilla'].map(engine => [engine, require(join(root, `vendor/${engine}/Readability.js`))]));
  const cases = [];
  async function add(id, html, options) {
    for (const engine of ['chromium', 'mozilla']) for (const layer of readerable ? ['readerable'] : ['api', 'raw']) {
      const opts = {...options, engine};
      let result;
      if (layer === 'readerable') {
        const dom = new JSDOM(html, {url: 'https://example.com/test/page.html', virtualConsole: new VirtualConsole()});
        try { result = resultOf(() => isProbablyReaderable(dom.window.document, opts)); }
        finally { dom.window.close(); }
      } else if (layer === 'api') result = resultOf(() => extractHTML(html, opts));
      else {
        let dom;
        try {
          result = resultOf(() => {
            dom = new JSDOM(html, {url: opts.url, virtualConsole: new VirtualConsole()});
            return new engines[engine](dom.window.document, opts).parse();
          });
        } finally { dom?.window.close(); }
      }
      cases.push({id: `${id}/${engine}/${layer}`, layer, html, inputHash: hash(html), options: opts, result});
    }
  }
  const directory = join(root, 'vendor/mozilla/test/test-pages');
  for (const entry of (await readdir(directory, {withFileTypes: true})).sort((a,b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    let html;
    try { html = await readFile(join(directory, entry.name, 'source.html'), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    await add(`upstream/${entry.name}`, html, readerable ? {} : {url: 'https://example.com/test/page.html'});
  }
  const fixtures = JSON.parse(await readFile(join(root, 'test/compatibility-fixtures.json'), 'utf8'));
  for (const fixture of readerable ? readerableFixtures : fixtures) await add(`project/${fixture.id}`, fixture.html, readerable ? (fixture.options ?? {}) : {url: 'https://example.com/articles/page', ...fixture.options});
  return {schema: 1, provenance: {runtime: {node: process.version, jsdom: require('jsdom/package.json').version}, package: JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version, upstream: JSON.parse(await readFile(join(root, 'upstream.json'), 'utf8')), sources: Object.fromEntries(await Promise.all(['dist/node.js', 'src/clone.ts', 'src/index.ts', 'src/cleanup.ts', 'src/validation.ts', 'src/node.ts', 'package-lock.json', 'vendor/chromium/Readability.js', 'vendor/mozilla/Readability.js', 'vendor/chromium/Readability-readerable.js', 'vendor/mozilla/Readability-readerable.js'].map(async path => [path, hash(await readFile(join(root, path)))])))}, cases};
}
async function main(argv) {
  const [mode, ...args] = argv;
  if (!mode || mode === '--help') { console.log('Usage: node scripts/rust-compatibility.mjs capture|capture-readerable --output FILE\n       node scripts/rust-compatibility.mjs compare --baseline FILE --candidate FILE [--output FILE]\n       node scripts/rust-compatibility.mjs run --baseline FILE --command EXEC [--arg ARG] [--output FILE] [--candidate-output FILE]\nStrict comparison: every missing case, status, field, text, HTML or error difference fails.\nrun sends JSON {html, options, layer} on stdin; expects Article|null or a result envelope on stdout.'); return; }
  const opts = {arg: []};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    if (!['output', 'baseline', 'candidate', 'candidate-output', 'command', 'arg'].includes(key) || args[i+1] === undefined) throw new Error(`Invalid argument ${args[i]}`);
    if (key === 'arg') opts.arg.push(args[i+1]); else { if (opts[key]) throw new Error(`Duplicate --${key}`); opts[key] = args[i+1]; }
  }
  let report;
  if (mode === 'capture' || mode === 'capture-readerable') { if (!opts.output) throw new Error('capture requires --output'); report = await capture(mode === 'capture-readerable'); }
  else if (mode === 'compare' || mode === 'run') {
    if (!opts.baseline) throw new Error('--baseline required');
    const baseline = JSON.parse(await readFile(resolve(opts.baseline), 'utf8'));
    validateSnapshot(baseline);
    let candidate;
    if (mode === 'compare') { if (!opts.candidate) throw new Error('--candidate required'); candidate = JSON.parse(await readFile(resolve(opts.candidate), 'utf8')); }
    else {
      if (!opts.command) throw new Error('--command required');
      candidate = {schema: 1, provenance: {command: opts.command, args: opts.arg,
        executableSha256: hash(await readFile(resolve(opts.command)))}, cases: baseline.cases.map(item => {
        const child = spawnSync(opts.command, opts.arg, {input: JSON.stringify({html: item.html, options: item.options, layer: item.layer}), encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024});
        let result;
        try {
          if (child.error) throw child.error;
          if (child.status !== 0) throw new Error(`candidate exit ${child.status}: ${child.stderr}`);
          const value = JSON.parse(child.stdout);
          result = value && ['ok', 'empty', 'error'].includes(value.status) ? value : {status: value === null ? 'empty' : 'ok', article: value};
        } catch (error) { result = {status: 'error', article: null, error: String(error.message), transportError: true}; }
        return {...item, result};
      })};
      if (opts['candidate-output']) await writeFile(resolve(opts['candidate-output']), `${JSON.stringify(candidate, null, 2)}\n`);
    }
    report = compareSnapshots(baseline, candidate);
    report.provenance = {reference: baseline.provenance, candidate: candidate.provenance};
    if (!report.passed) process.exitCode = 1;
    console.error(`${report.compared} cases; ${report.differences.length} differences; ${report.passed ? 'PASS' : 'FAIL'}`);
  } else throw new Error(`Unknown mode ${mode}`);
  if (opts.output) await writeFile(resolve(opts.output), `${JSON.stringify(report, null, 2)}\n`);
  else console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => {console.error(error.message); process.exitCode = 2;});
