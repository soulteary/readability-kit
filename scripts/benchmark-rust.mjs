#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// End-to-end extraction benchmark. Keep correctness gates separate from timing.
import {spawnSync} from 'node:child_process';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join, resolve} from 'node:path';
import {cpus, platform, release} from 'node:os';
import {createHash} from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const worker = process.argv.includes('--worker');
const suffix = platform() === 'win32' ? '.exe' : '';
const binary = join(root, 'target/release', `readability-kit-bench${suffix}`);

function run(command, args, input) {
  const result = spawnSync(command, args, {
    cwd: root, input, encoding: 'utf8', timeout: 300_000, maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr}`);
  return result;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

async function main() {
  if (worker) {
    const {extractHTML} = await import('../dist/node.js');
    let stdin = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) stdin += chunk;
    const input = JSON.parse(stdin);
    const cases = [];
    for (const item of input.cases) {
      for (let i = 0; i < input.warmup; i++) extractHTML(item.html, item.options);
      const durationsNs = [];
      const lengths = [];
      const checksums = [];
      for (let i = 0; i < input.iterations; i++) {
        const start = process.hrtime.bigint();
        const article = extractHTML(item.html, item.options);
        durationsNs.push(Number(process.hrtime.bigint() - start));
        lengths.push(article?.length ?? 0);
        let checksum = 0xcbf29ce484222325n;
        for (const byte of Buffer.from(article?.textContent ?? '')) checksum = BigInt.asUintN(64, (checksum ^ BigInt(byte)) * 0x100000001b3n);
        checksums.push(checksum.toString(16).padStart(16, '0'));
      }
      cases.push({id: item.id, durationsNs, lengths, checksums});
    }
    process.stdout.write(JSON.stringify({cases}));
    return;
  }
  const args = process.argv.slice(2);
  const options = {iterations: 10, warmup: 2, engine: 'chromium', output: undefined};
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (name === '--help') {
      console.log('Usage: node scripts/benchmark-rust.mjs [--iterations 10] [--warmup 2] [--engine chromium|mozilla] [--output report.json]');
      return;
    }
    if (!['--iterations', '--warmup', '--engine', '--output'].includes(name) || args[i + 1] === undefined) {
      throw new Error(`Invalid argument: ${name}`);
    }
    const key = name.slice(2);
    options[key] = ['iterations', 'warmup'].includes(key) ? Number(args[++i]) : args[++i];
  }
  if (!Number.isInteger(options.iterations) || options.iterations < 1 ||
      !Number.isInteger(options.warmup) || options.warmup < 0 ||
      !['chromium', 'mozilla'].includes(options.engine)) throw new Error('Invalid benchmark options.');
  const directory = join(root, 'vendor/mozilla/test/test-pages');
  const sources = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    try {
      const html = await readFile(join(directory, entry.name, 'source.html'), 'utf8');
      sources.push({id: entry.name, html, bytes: Buffer.byteLength(html)});
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  sources.sort((a, b) => a.bytes - b.bytes || a.id.localeCompare(b.id));
  if (!sources.length) throw new Error('No benchmark fixtures.');
  const chosen = [...new Set([0.1, 0.5, 0.9].map(p => Math.floor((sources.length - 1) * p)))].map(i => sources[i]);
  const payload = JSON.stringify({
    warmup: options.warmup, iterations: options.iterations,
    cases: chosen.map(({id, html}) => ({id, html, options: {url: 'https://example.com/test/page.html', engine: options.engine}})),
  });
  const warmJS = JSON.parse(run(process.execPath, [fileURLToPath(import.meta.url), '--worker'], payload).stdout);
  const warmRust = JSON.parse(run(binary, [], payload).stdout);
  const cases = chosen.map((source, index) => {
    const js = warmJS.cases[index];
    const rust = warmRust.cases[index];
    if (js.id !== source.id || rust.id !== source.id) throw new Error('Benchmark case order mismatch.');
    for (const item of [js, rust]) {
      if (item.durationsNs.length !== options.iterations || item.lengths.length !== options.iterations || item.checksums.length !== options.iterations ||
          item.durationsNs.some(n => !Number.isFinite(n) || n <= 0) || item.lengths.some(n => !Number.isInteger(n) || n <= 0) || new Set(item.checksums).size !== 1) {
        throw new Error(`Empty, incomplete or nondeterministic benchmark output for ${source.id}`);
      }
    }
    const summarize = item => ({
      p50Ms: percentile(item.durationsNs, 0.5) / 1e6,
      p95Ms: percentile(item.durationsNs, 0.95) / 1e6,
      totalMs: item.durationsNs.reduce((a, b) => a + b, 0) / 1e6,
      outputLengthsUTF16: [...new Set(item.lengths)],
      textChecksumFNV1a: item.checksums[0],
      samplesNs: item.durationsNs,
    });
    const javascript = summarize(js);
    const native = summarize(rust);
    return {id: source.id, inputBytes: source.bytes, javascript, rust: native,
      textChecksumMatches: js.checksums[0] === rust.checksums[0],
      p50Speedup: javascript.p50Ms / native.p50Ms};
  });
  // Cold measurements include runtime startup, parsing, extraction and output.
  // Time each actual CLI, not the resident benchmark harness.
  const cold = [];
  const timeArgs = platform() === 'darwin' ? ['-l'] : platform() === 'linux' ? ['-v'] : null;
  for (const source of chosen) {
    const commands = {
      javascript: [process.execPath, [join(root, 'dist/cli.js'), '-', '--url', 'https://example.com/test/page.html', '--engine', options.engine]],
      rust: [join(root, 'target/release', `readability-kit${suffix}`), ['-', '--url', 'https://example.com/test/page.html', '--engine', options.engine]],
    };
    const measurements = {};
    for (const [name, [command, commandArgs]] of Object.entries(commands)) {
      const elapsedMs = [];
      const rssBytes = [];
      for (let i = 0; i < 3; i++) {
        const start = process.hrtime.bigint();
        const result = timeArgs ? run('/usr/bin/time', [...timeArgs, command, ...commandArgs], source.html) : run(command, commandArgs, source.html);
        elapsedMs.push(Number(process.hrtime.bigint() - start) / 1e6);
        const match = platform() === 'darwin'
          ? result.stderr.match(/(\d+)\s+maximum resident set size/)
          : result.stderr.match(/Maximum resident set size \(kbytes\):\s*(\d+)/);
        if (match) rssBytes.push(Number(match[1]) * (platform() === 'linux' ? 1024 : 1));
      }
      measurements[name] = {elapsedMs, p50Ms: percentile(elapsedMs, 0.5), peakRSSBytes: rssBytes.length ? Math.max(...rssBytes) : null};
    }
    cold.push({id: source.id, ...measurements});
  }
  const report = {
    schemaVersion: 1, generatedAt: new Date().toISOString(),
    environment: {node: process.version, os: platform(), release: release(), cpu: cpus()[0]?.model, rustc: run('rustc', ['--version']).stdout.trim()},
    sources: Object.fromEntries(await Promise.all(['Cargo.lock', 'package-lock.json', `target/release/readability-kit-bench${suffix}`, `target/release/readability-kit${suffix}`, 'dist/node.js'].map(async path => [path, createHash('sha256').update(await readFile(join(root, path))).digest('hex')]))),
    method: {engine: options.engine, iterations: options.iterations, warmup: options.warmup,
      fixtures: '10th, 50th, 90th input byte percentiles of upstream corpus',
      warm: 'Sequential extraction in separate resident JS/Rust processes; default sanitization; no subprocess in timed region.',
      cold: 'Three actual CLI invocations per case, including startup and JSON output; RSS measured by OS time utility where available.',
      limitation: 'Fixed JS-then-Rust order; small local benchmark, not a production throughput estimate. Performance does not establish output compatibility.'},
    cases, cold,
  };
  if (options.output) await writeFile(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch(error => { console.error(`benchmark-rust: ${error.message}`); process.exitCode = 1; });
