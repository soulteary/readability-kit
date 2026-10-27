#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import {JSDOM, VirtualConsole} from 'jsdom';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FIXTURE_ROOT = join(ROOT, 'vendor/mozilla/test/test-pages');
const SOURCE_URL = 'https://example.com/test/page.html';
const ENGINE_PATHS = {
  mozilla: 'vendor/mozilla/Readability.js',
  chromium: 'vendor/chromium/Readability.js',
};
const METADATA_FIELDS = [
  'excerpt', 'byline', 'lang', 'dir', 'siteName', 'publishedTime', 'length',
];
const COMPARISON_FIELDS = ['title', 'text', 'html', ...METADATA_FIELDS];

const HELP = `Usage: node tools/compare-upstream.mjs [--check] [--output <file>]

Compare the two raw vendored Readability engines on every original Mozilla
test-pages/*/source.html fixture. Both receive a fresh jsdom document with the
same source URL, defaults, and inert HTML input.

Options:
  --check          Fail only for exceptions or missing/empty/invalid articles.
                   Content differences are informational, not test failures.
  --output <file>  Save the full JSON report and print a compact summary.
  -h, --help       Show this help.

Without options, print the complete pretty-printed JSON report to stdout.
With --check, print a compact summary and any extraction failures instead.
--check and --output can be combined.

The comparison does not use the package wrapper, sanitizer, or cleanup, and
does not replace Mozilla's original expected-output regression tests.
`;

function parseArguments(argv) {
  const options = {check: false, output: undefined, help: false};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') {
      options.check = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument === '--output' || argument.startsWith('--output=')) {
      if (options.output !== undefined) {
        throw new Error('--output may only be supplied once.');
      }
      const value = argument === '--output'
        ? argv[++index]
        : argument.slice('--output='.length);
      if (!value || value.startsWith('--')) {
        throw new Error('--output requires a file path.');
      }
      options.output = resolve(value);
    } else {
      throw new Error(`Unknown argument: ${argument}. Use --help for usage.`);
    }
  }
  return options;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeText(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

function errorMessage(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function fixtureNames() {
  const entries = await readdir(FIXTURE_ROOT, {withFileTypes: true});
  const names = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      if ((await stat(join(FIXTURE_ROOT, entry.name, 'source.html'))).isFile()) {
        names.push(entry.name);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return names.sort();
}

function captureArticle(article) {
  if (!article) return {status: 'empty', article: null, error: 'No article returned.'};
  if (typeof article.content !== 'string' || typeof article.textContent !== 'string') {
    return {
      status: 'invalid', article: null,
      error: 'An article must contain string content and textContent fields.',
    };
  }

  const normalizedText = normalizeText(article.textContent);
  const captured = {
    title: article.title ?? null,
    normalizedText,
    normalizedTextLength: normalizedText.length,
    normalizedTextSha256: sha256(normalizedText),
    htmlSha256: sha256(article.content),
    htmlLength: article.content.length,
  };
  for (const field of METADATA_FIELDS) captured[field] = article[field] ?? null;
  if (!article.content.trim() || !normalizedText) {
    return {status: 'empty', article: captured, error: 'Article HTML or text is empty.'};
  }
  return {status: 'ok', article: captured, error: null};
}

function runEngine(Readability, html) {
  const diagnostics = [];
  let suppressedCssWarnings = 0;
  const virtualConsole = new VirtualConsole();
  // CSS parser warnings in historical page fixtures do not affect these
  // layout-free extraction heuristics. Keep every other jsdom error visible
  // in the report instead of swallowing all diagnostics.
  virtualConsole.on('jsdomError', error => {
    if (error.type === 'css-parsing') {
      suppressedCssWarnings += 1;
    } else {
      diagnostics.push({type: error.type ?? 'unknown', message: error.message});
    }
  });

  let dom;
  let result;
  try {
    // Do not enable runScripts or resources. Each engine gets its own DOM;
    // Readability is allowed to mutate that DOM without influencing its peer.
    dom = new JSDOM(html, {url: SOURCE_URL, virtualConsole});
    result = captureArticle(new Readability(dom.window.document).parse());
  } catch (error) {
    result = {status: 'exception', article: null, error: errorMessage(error)};
  } finally {
    dom?.window.close();
  }
  return {...result, diagnostics, suppressedCssWarnings};
}

function compareArticles(mozilla, chromium) {
  if (mozilla.status !== 'ok' || chromium.status !== 'ok') return null;
  const left = mozilla.article;
  const right = chromium.article;
  const differences = {
    title: left.title !== right.title,
    text: left.normalizedText !== right.normalizedText,
    html: left.htmlSha256 !== right.htmlSha256,
  };
  for (const field of METADATA_FIELDS) differences[field] = left[field] !== right[field];
  return differences;
}

function summarize(fixtures) {
  const summary = {
    fixtureCount: fixtures.length,
    comparableFixtureCount: 0,
    matchingFixtureCount: 0,
    differentFixtureCount: 0,
    differencesByField: Object.fromEntries(COMPARISON_FIELDS.map(field => [field, 0])),
    engines: Object.fromEntries(Object.keys(ENGINE_PATHS).map(engine => [engine, {
      articles: 0, exceptions: 0, emptyResults: 0, invalidResults: 0,
      jsdomDiagnostics: 0, suppressedCssWarnings: 0,
    }])),
    checkPassed: false,
  };
  for (const fixture of fixtures) {
    for (const engine of Object.keys(ENGINE_PATHS)) {
      const result = fixture[engine];
      const totals = summary.engines[engine];
      if (result.status === 'ok') totals.articles += 1;
      if (result.status === 'exception') totals.exceptions += 1;
      if (result.status === 'empty') totals.emptyResults += 1;
      if (result.status === 'invalid') totals.invalidResults += 1;
      totals.jsdomDiagnostics += result.diagnostics.length;
      totals.suppressedCssWarnings += result.suppressedCssWarnings;
    }
    if (!fixture.differences) continue;
    summary.comparableFixtureCount += 1;
    if (Object.values(fixture.differences).some(Boolean)) summary.differentFixtureCount += 1;
    else summary.matchingFixtureCount += 1;
    for (const field of COMPARISON_FIELDS) {
      if (fixture.differences[field]) summary.differencesByField[field] += 1;
    }
  }
  summary.checkPassed = summary.fixtureCount > 0 &&
    summary.comparableFixtureCount === summary.fixtureCount;
  return summary;
}

async function main(argv) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const manifest = JSON.parse(await readFile(join(ROOT, 'upstream.json'), 'utf8'));
  const engines = {};
  const sources = {};
  for (const [engine, enginePath] of Object.entries(ENGINE_PATHS)) {
    engines[engine] = require(join(ROOT, enginePath));
    sources[engine] = {
      repository: manifest.sources[engine].repository,
      revision: manifest.sources[engine].revision,
      path: enginePath,
      sha256: sha256(await readFile(join(ROOT, enginePath))),
    };
  }

  const fixtures = [];
  for (const name of await fixtureNames()) {
    const filename = join(FIXTURE_ROOT, name, 'source.html');
    const input = await readFile(filename);
    const html = input.toString('utf8');
    const mozilla = runEngine(engines.mozilla, html);
    const chromium = runEngine(engines.chromium, html);
    fixtures.push({
      name,
      sourcePath: relative(ROOT, filename).split('\\').join('/'),
      sourceSha256: sha256(input),
      mozilla,
      chromium,
      differences: compareArticles(mozilla, chromium),
    });
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runtime: {node: process.versions.node, jsdom: require('jsdom/package.json').version},
    sources,
    method: {
      fixturePattern: 'vendor/mozilla/test/test-pages/*/source.html',
      fixtureOrder: 'ascending name',
      documentURL: SOURCE_URL,
      engineOptions: 'upstream defaults',
      pageScripts: false,
      remoteResources: false,
      wrapperCleanup: false,
      sanitization: false,
      textComparison: 'Collapse Unicode whitespace runs to one space, then trim.',
      htmlComparison: 'SHA-256 of the raw serialized article.content string.',
      metadataComparison: 'Exact values, with absent values represented as null.',
      interpretation: 'Behavioral differences are not accuracy scores or failures.',
    },
    summary: summarize(fixtures),
    fixtures,
  };

  if (options.output) {
    await mkdir(dirname(options.output), {recursive: true});
    await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  if (options.check || options.output) {
    const failures = fixtures.flatMap(fixture => Object.keys(ENGINE_PATHS)
      .filter(engine => fixture[engine].status !== 'ok')
      .map(engine => ({fixture: fixture.name, engine,
        status: fixture[engine].status, error: fixture[engine].error})));
    process.stdout.write(`${JSON.stringify({
      ...(options.output ? {output: options.output} : {}),
      summary: report.summary,
      failures,
    }, null, 2)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
  if (options.check && !report.summary.checkPassed) process.exitCode = 1;
}

main(process.argv.slice(2)).catch(error => {
  process.stderr.write(`compare-upstream: ${errorMessage(error)}\n`);
  process.exitCode = 1;
});
