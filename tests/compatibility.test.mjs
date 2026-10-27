import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compareSnapshots, resultOf, validateSnapshot} from '../tools/compatibility.mjs';
const html = '<p>正文 🙂</p>';
const snapshot = () => ({schema: 1, cases: [{id: 'article', layer: 'api', html, inputHash: createHash('sha256').update(html).digest('hex'), options: {engine: 'chromium'}, result: {status: 'ok', article: {title: 'Title', byline: null, dir: null, lang: null, excerpt: null, siteName: null, publishedTime: null, engine: 'chromium', textContent: '正文 🙂', content: '<p>正文 🙂</p>', length: 5, url: 'https://example.com/'}}}]});
test('compatibility rejects missing body, URL, length, and status changes', () => {
  const baseline = snapshot();
  assert.equal(compareSnapshots(baseline, structuredClone(baseline)).passed, true);
  for (const field of ['textContent', 'url', 'length', 'content']) {
    const candidate = snapshot(); delete candidate.cases[0].result.article[field];
    assert.throws(() => compareSnapshots(baseline, candidate), undefined, field);
  }
  const candidate = snapshot(); candidate.cases[0].result = {status: 'empty', article: null};
  assert.equal(compareSnapshots(baseline, candidate).passed, false);
});
test('normalization is diagnostic and does not silently accept whitespace changes', () => {
  const baseline = snapshot(), candidate = snapshot();
  candidate.cases[0].result.article.textContent = '正文  🙂';
  const report = compareSnapshots(baseline, candidate);
  assert.equal(report.passed, false); assert.equal(report.differences[0].normalizedEqual, true);
});
test('compatibility rejects missing/extra cases, options and duplicate IDs', () => {
  const baseline = snapshot();
  assert.equal(compareSnapshots(baseline, {schema: 1, cases: []}).passed, false);
  assert.equal(compareSnapshots({schema: 1, cases: []}, baseline).passed, false);
  const candidate = snapshot(); candidate.cases[0].options.engine = 'mozilla';
  assert.equal(compareSnapshots(baseline, candidate).passed, false);
  assert.throws(() => compareSnapshots(baseline, {schema: 1, cases: [...baseline.cases, ...baseline.cases]}));
  assert.throws(() => compareSnapshots({schema: 1, cases: [...baseline.cases, ...baseline.cases]}, baseline));
  assert.equal(compareSnapshots({schema: 1, cases: []}, {schema: 1, cases: []}).passed, false);
});
test('empty and error are separate states', () => {
  assert.deepEqual(resultOf(() => null), {status: 'empty', article: null});
  assert.deepEqual(resultOf(() => {throw new TypeError('bad input');}), {status: 'error', article: null, error: 'bad input'});
});

test('malformed snapshots cannot pass self-comparison', () => {
  const mutations = [
    item => { item.result = {}; },
    item => { delete item.html; },
    item => { item.html += 'tampered'; },
    item => { delete item.inputHash; },
    item => { delete item.layer; },
    item => { item.options = []; },
    item => { item.result = {status: 'ok', article: null}; },
    item => { item.result = {status: 'empty', article: {}}; },
    item => { item.result = {status: 'error', article: null}; },
    item => { item.result.article.length = '5'; },
    item => { item.result.article.byline = undefined; },
    item => { item.result.article.url = undefined; },
  ];
  for (const mutate of mutations) {
    const malformed = snapshot(); mutate(malformed.cases[0]);
    assert.throws(() => compareSnapshots(malformed, structuredClone(malformed)));
  }
});
test('raw optional metadata absence and null remain distinct', () => {
  const baseline = snapshot(); baseline.cases[0].layer = 'raw';
  delete baseline.cases[0].result.article.excerpt;
  const candidate = structuredClone(baseline); candidate.cases[0].result.article.excerpt = null;
  assert.equal(compareSnapshots(baseline, candidate).passed, false);
  candidate.cases[0].result.article.extra = undefined;
  delete candidate.cases[0].result.article.excerpt;
  assert.equal(compareSnapshots(baseline, candidate).passed, false);
});
test('readerability snapshots preserve false booleans and reject empty/article results', () => {
  const baseline = snapshot();
  Object.assign(baseline.cases[0], {layer: 'readerable', result: {status: 'ok', article: false}});
  assert.doesNotThrow(() => validateSnapshot(baseline));
  assert.equal(compareSnapshots(baseline, structuredClone(baseline)).passed, true);
  const candidate = structuredClone(baseline); candidate.cases[0].result.article = true;
  assert.equal(compareSnapshots(baseline, candidate).passed, false);
  for (const result of [{status: 'empty', article: null}, {status: 'ok', article: {}}]) {
    candidate.cases[0].result = result;
    assert.throws(() => validateSnapshot(candidate));
  }
});

test('transport failures cannot pass as matching semantic errors', () => {
  const baseline = snapshot(); baseline.cases[0].result = {status: 'error', article: null, error: 'candidate failed', transportError: true};
  assert.equal(compareSnapshots(baseline, structuredClone(baseline)).passed, false);
});
