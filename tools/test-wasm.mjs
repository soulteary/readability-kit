#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, mkdtemp, rm, stat, copyFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {tmpdir, cpus, platform, release} from 'node:os';
import {join, resolve, extname, sep} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync, brotliCompressSync, constants} from 'node:zlib';
import {chromium, firefox, webkit} from '@playwright/test';
import {compareSnapshots, validateSnapshot} from './compatibility.mjs';
import {resolveNpmCommand} from './npm-command.mjs';
const output = resolve(process.env.WASM_REPORT_DIR ?? 'wasm-reports');
await mkdir(output, {recursive: true});
console.log(process.env.WASM_REUSE_BASELINES === '1' ? 'Checking existing JavaScript references against source hashes...' : 'Capturing fresh JavaScript references...');
// Capture fresh reference outputs; no dependency on ignored snapshots from prior runs.
for (const [mode, filename] of process.env.WASM_REUSE_BASELINES === '1' ? [] : [['capture', 'javascript.json'], ['capture-readerable', 'readerable-javascript.json']]) {
  execFileSync(process.execPath, ['tools/compatibility.mjs', mode, '--output', join(output, filename)], {stdio: 'inherit'});
}
console.log('JavaScript extraction and readerability references ready.');
const snapshots = await Promise.all(['javascript.json', 'readerable-javascript.json'].map(async file => JSON.parse(await readFile(join(output, file), 'utf8'))));
for (const snapshot of snapshots) {
  validateSnapshot(snapshot);
  for (const [path, expected] of Object.entries(snapshot.provenance.sources)) {
    assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), expected, `Stale JavaScript reference: ${path}`);
  }
}
const temporary = await mkdtemp(join(tmpdir(), 'readability-wasm-'));
let browser, server;
try {
  const {command: npm, prefix} = resolveNpmCommand();
  const [packed] = JSON.parse(execFileSync(npm, [...prefix, 'pack', '--ignore-scripts', '--json', '--pack-destination', temporary], {cwd: 'packages/wasm', encoding: 'utf8', env: {...process.env, npm_config_cache: join(temporary, 'npm-cache')}}));
  await copyFile(join(temporary, packed.filename), join(output, packed.filename));
  execFileSync('tar', ['-xzf', join(temporary, packed.filename), '-C', temporary]);
  const packageRoot = join(temporary, 'package');
  for (const file of ['pkg/index.js', 'pkg/index.d.ts', 'pkg/types.d.ts', 'pkg/worker.js', 'pkg/readability_wasm.js', 'pkg/readability_wasm_bg.wasm', 'LICENSE', 'NOTICE', 'dependencies.json']) {
    assert.ok(packed.files.some(entry => entry.path === file), `Missing package file: ${file}`);
  }
  const packedPaths = new Set(packed.files.map(file => file.path));
  const dependencies = JSON.parse(await readFile(join(packageRoot, 'dependencies.json'), 'utf8'));
  for (const pkg of dependencies.packages) for (const notice of pkg.notices) assert.ok(packedPaths.has(notice), `Missing dependency notice: ${notice}`);
  const rawWorker = `import init,{request_json} from '/pkg/readability_wasm.js'; const ready=init(); self.onmessage=async({data})=>{await ready; self.postMessage(JSON.parse(request_json(JSON.stringify(data))));};`;
  server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>WASM validation</title>'); return; }
      if (url.pathname === '/raw-worker.js' || url.pathname === '/stall-worker.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(url.pathname === '/raw-worker.js' ? rawWorker : 'self.onmessage=()=>{};'); return; }
      const base = url.pathname.startsWith('/pkg/') ? packageRoot : process.cwd();
      if (!url.pathname.startsWith('/pkg/') && !url.pathname.startsWith('/packages/javascript/dist/')) throw new Error('Not found');
      const file = resolve(base, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(base + sep)) throw new Error('Invalid path');
      const bytes = await readFile(file);
      res.setHeader('Content-Type', ({'.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json'})[extname(file)] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(bytes);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless: true, ...(process.env.READABILITY_TEST_CHROMIUM ? {executablePath: process.env.READABILITY_TEST_CHROMIUM} : {})});
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(origin);
  await page.evaluate(async () => {
    window.api = await import('/pkg/index.js');
    let missingInit = false;
    try { api.extractHTML('<p>hello</p>', {url: 'https://example.com'}); } catch (error) { missingInit = error.message.includes('await init'); }
    if (!missingInit) throw new Error('Extraction before init must fail');
    const invalid = await fetch('/missing.wasm');
    let failed = false;
    try { await api.init(invalid); } catch { failed = true; }
    if (!failed) throw new Error('Invalid module must reject');
    await Promise.all([api.init(), api.init()]);
    window.raw = await import('/pkg/readability_wasm.js');
    window.reader = await api.createWorkerReader();
    window.rawWorker = new Worker('/raw-worker.js', {type: 'module'});
    window.runCase = async (item, worker) => {
      try {
        if (item.layer === 'raw') {
          if (!worker) return JSON.parse(raw.request_json(JSON.stringify({html: item.html, options: item.options, layer: item.layer})));
          return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Raw worker timeout')), 30000);
            rawWorker.onmessage = ({data}) => { clearTimeout(timer); resolve(data); };
            rawWorker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
            rawWorker.postMessage({html: item.html, options: item.options, layer: item.layer});
          });
        }
        const module = worker ? reader : api;
        const article = await (item.layer === 'readerable' ? module.isProbablyReaderable(item.html, item.options) : module.extractHTML(item.html, item.options));
        return {status: article === null ? 'empty' : 'ok', article};
      } catch (error) { return {status: 'error', article: null, error: error.message}; }
    };
  });
  const compatibility = [];
  for (const worker of [false, true]) for (let group = 0; group < snapshots.length; group++) {
    const baseline = snapshots[group];
    const cases = [];
    for (let offset = 0; offset < baseline.cases.length; offset += 20) {
      const batch = baseline.cases.slice(offset, offset + 20);
      const results = await page.evaluate(async ({batch, worker}) => {
        const values = [];
        for (const item of batch) values.push(await runCase(item, worker));
        return values;
      }, {batch, worker});
      cases.push(...batch.map((item, i) => ({...item, result: results[i]})));
    }
    const report = compareSnapshots(baseline, {schema: 1, cases});
    const name = `${worker ? 'worker' : 'browser'}-${group ? 'readerable' : 'extraction'}`;
    await writeFile(join(output, `${name}.json`), JSON.stringify(report, null, 2) + '\n');
    compatibility.push({name, compared: report.compared, passed: report.passed, differences: report.differences.length});
    console.log(`${name}: ${report.compared} cases, ${report.differences.length} differences`);
    assert.ok(report.passed, `${name} failed; see ${output}`);
  }
  // JS-only boundary cases are not representable by the JSON corpus.
  const boundary = await page.evaluate(async () => {
    const expectReject = async (fn, text) => {
      try { await fn(); } catch (error) { if (error.message.includes(text)) return; throw error; }
      throw new Error(`Expected rejection: ${text}`);
    };
    for (const module of [api, reader]) {
      await expectReject(() => module.extractHTML('', {url: 'https://example.com', charThreshold: NaN}), 'charThreshold');
      await expectReject(() => module.extractHTML('', {url: 'https://example.com', linkDensityModifier: Infinity}), 'linkDensityModifier');
      await expectReject(() => module.isProbablyReaderable('', {minScore: NaN}), 'minScore');
      await expectReject(() => module.extractHTML(null, {url: 'https://example.com'}), 'html must be a string');
    }
    const cyclic = {}; cyclic.self = cyclic;
    for (const module of [api, reader]) {
      const value = await module.isProbablyReaderable('', {unknown: cyclic, ignored: 1n});
      if (value !== false) throw new Error('Unknown options must be ignored');
    }
    const items = await Promise.all(Array.from({length: 8}, (_, i) => reader.isProbablyReaderable(i % 2 ? '<p>' + 'substantial article prose '.repeat(100) + '</p>' : '', {minContentLength: 5, minScore: 1})));
    if (items.some((value, i) => value !== Boolean(i % 2))) throw new Error('Concurrent request correlation failed');
    await expectReject(() => api.createWorkerReader({wasmURL: '/missing.wasm'}), 'HTTP status code');
    await expectReject(() => api.createWorkerReader({workerURL: '/stall-worker.js', timeoutMs: 100}), 'timed out');
    const owned = await api.createWorkerReader();
    const pending = owned.isProbablyReaderable('');
    owned.terminate();
    await expectReject(() => pending, 'terminated');
    await expectReject(() => owned.isProbablyReaderable(''), 'terminated');
    return {passed: true};
  });
  // Same browser, input, engine and pipeline. Main-thread timings exclude RPC;
  // Worker timings include structured clone, queueing and response delivery.
  const names = ['rtl-4', 'ehow-2', 'schema-org-context-object'];
  const samples = names.map(name => snapshots[0].cases.find(item => item.id === `upstream/${name}/chromium/api`));
  assert.ok(samples.every(Boolean));
  const performance = await page.evaluate(async samples => {
    const js = await import('/packages/javascript/dist/index.js');
    const rows = [];
    const sorted = values => [...values].sort((a,b) => a-b);
    const stats = values => ({p50Ms: sorted(values)[Math.floor(values.length / 2)], p95Ms: sorted(values)[Math.ceil(values.length * .95) - 1], minMs: Math.min(...values), maxMs: Math.max(...values), samplesMs: values});
    for (const sample of samples) for (const engine of ['chromium', 'mozilla']) {
      const options = {...sample.options, engine};
      const methods = {
        javascript: () => js.extractDocument(new DOMParser().parseFromString(sample.html, 'text/html'), options),
        wasm: () => api.extractHTML(sample.html, options),
        worker: () => reader.extractHTML(sample.html, options),
      };
      const values = Object.fromEntries(Object.keys(methods).map(name => [name, []]));
      for (let warm = 0; warm < 3; warm++) for (const method of Object.values(methods)) await method();
      let signature;
      for (let iteration = 0; iteration < 15; iteration++) {
        const order = ['javascript', 'wasm', 'worker'];
        for (let k = 0; k < order.length; k++) {
          const name = order[(iteration + k) % order.length];
          const start = performance.now();
          const article = await methods[name]();
          values[name].push(performance.now() - start);
          const current = JSON.stringify([article?.title, article?.textContent, article?.length]);
          if (signature === undefined) signature = current;
          if (current !== signature) throw new Error(`Benchmark output differs: ${sample.id}/${engine}/${name}`);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      rows.push({id: sample.id, engine, inputBytes: new TextEncoder().encode(sample.html).length, timings: Object.fromEntries(Object.entries(values).map(([name, samples]) => [name, stats(samples)]))});
    }
    return rows;
  }, samples);
  const startup = [];
  for (let i = 0; i < 9; i++) {
    const fresh = await browser.newPage();
    await fresh.goto(origin);
    startup.push(await fresh.evaluate(async () => {
      const start = performance.now();
      const api = await import('/pkg/index.js');
      const imported = performance.now();
      await api.init();
      const initialized = performance.now();
      const worker = await api.createWorkerReader();
      const workerReady = performance.now();
      worker.terminate();
      return {importMs: imported - start, initMs: initialized - imported, workerCreateAndInitMs: workerReady - initialized};
    }));
    await fresh.close();
  }
  await page.evaluate(() => {reader.terminate(); rawWorker.terminate();});
  assert.deepEqual(pageErrors, []);
  const sizes = [];
  for (const name of ['index.js', 'worker.js', 'readability_wasm.js', 'readability_wasm_bg.wasm']) {
    const data = await readFile(join(packageRoot, 'pkg', name));
    sizes.push({file: name, bytes: data.length, gzipBytes: gzipSync(data, {level: 9}).length, brotliBytes: brotliCompressSync(data, {params: {[constants.BROTLI_PARAM_QUALITY]: 11}}).length, sha256: createHash('sha256').update(data).digest('hex')});
  }
  const extraBrowsers = [];
  if (process.env.WASM_EXTRA_BROWSERS === '1') for (const type of [firefox, webkit]) {
    const extra = await type.launch({headless: true, ...(type.name() === 'firefox' ? {firefoxUserPrefs: {'network.proxy.type': 0}} : {})});
    try {
      const tab = await extra.newPage();
      await tab.goto(origin);
      const inputs = ['chromium', 'mozilla'].map(engine => ({
        item: snapshots[0].cases.find(item => item.id === `upstream/ehow-2/${engine}/api`),
        readable: snapshots[1].cases.find(item => item.id === `upstream/ehow-2/${engine}/readerable`).result.article,
      }));
      const outputs = await tab.evaluate(async inputs => {
        const api = await import('/pkg/index.js');
        await api.init();
        const worker = await api.createWorkerReader();
        try {
          const output = [];
          for (const {item} of inputs) output.push({
            article: api.extractHTML(item.html, item.options),
            workerArticle: await worker.extractHTML(item.html, item.options),
            readable: api.isProbablyReaderable(item.html, {engine: item.options.engine}),
            workerReadable: await worker.isProbablyReaderable(item.html, {engine: item.options.engine}),
          });
          return output;
        } finally { worker.terminate(); }
      }, inputs);
      for (let i = 0; i < inputs.length; i++) {
        assert.deepEqual(outputs[i].article, inputs[i].item.result.article);
        assert.deepEqual(outputs[i].workerArticle, inputs[i].item.result.article);
        assert.equal(outputs[i].readable, inputs[i].readable);
        assert.equal(outputs[i].workerReadable, inputs[i].readable);
      }
      extraBrowsers.push({browser: type.name(), version: extra.version(), checks: 8, passed: true});
      console.log(`${type.name()}: browser and Worker smoke checks passed`);
    } finally { await extra.close(); }
  }
  const sourcePaths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {encoding: 'utf8'}).trim().split('\n').filter(path => /^(crates|packages|tools)\//.test(path) && (/\.(rs|toml|ts|js|mjs|py)$/.test(path) || /(?:^|\/)(?:package|tsconfig)\.json$/.test(path)) || ['Cargo.toml', 'Cargo.lock', 'bun.lock', 'package.json'].includes(path));
  const sources = {};
  for (const path of sourcePaths) {
    try { sources[path] = createHash('sha256').update(await readFile(path)).digest('hex'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const report = {schema: 1, provenance: {gitHead: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), sources, references: snapshots.map(snapshot => snapshot.provenance)}, measuredAt: new Date().toISOString(), environment: {platform: platform(), release: release(), cpu: cpus()[0]?.model, node: process.version, npm: execFileSync(npm, [...prefix, '--version'], {encoding: 'utf8'}).trim(), browser: browser.version(), rustc: execFileSync('rustc', ['-V'], {encoding: 'utf8'}).trim()}, protocol: {warmups: 3, iterations: 15, startupRealms: 9, order: 'Latin rotation per iteration', wasmProfile: 'wasm-release: opt-level=s, LTO, 1 codegen unit, panic=abort', cache: 'HTTP no-store; fresh realm startup, browser compilation cache not cleared', worker: 'end-to-end including structured clone and RPC', javascript: 'DOMParser + extractDocument including clone, default sanitizer and cleanup', startup: 'same browser process, fresh pages; worker initialized after main module'}, package: {name: packed.name, version: packed.version, bytes: (await stat(join(temporary, packed.filename))).size, unpackedBytes: packed.unpackedSize, integrity: packed.integrity, sha256: createHash('sha256').update(await readFile(join(temporary, packed.filename))).digest('hex'), files: packed.files.length}, sizes, compatibility, boundary, extraBrowsers, performance, startup};
  await writeFile(join(output, 'measurement.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({package: report.package, sizes, compatibility, boundary}, null, 2));
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(temporary, {recursive: true, force: true});
}
