#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Read-only aggregation of measured times; never invokes extraction or builds.
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const [summaryPath, diffPath, outputPath] = process.argv.slice(2);
if (!summaryPath || !diffPath || !outputPath) throw new Error('Usage: node scripts/benchmark-matched-subset.mjs summary.json rust-diff.json output.json');
const read = p => readFileSync(resolve(p));
const sha = b => createHash('sha256').update(b).digest('hex');
const summaryBytes = read(summaryPath), diffBytes = read(diffPath);
const summary = JSON.parse(summaryBytes), diff = JSON.parse(diffBytes);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(diff.schema === 1 && diff.compared === 604 && Array.isArray(diff.differences), 'Expected complete strict 604-case report');
const rawBytes = readFileSync(summary.source);
assert(sha(rawBytes) === summary.sourceSha256, 'Raw report differs from summarized input');
const raw = JSON.parse(rawBytes), corpus = raw.manifest.corpus;
assert(corpus.length === 130 && summary.corpusPages === 130, 'Expected all 130 upstream pages');
assert(diff.provenance.reference.sources['dist/node.js'] === raw.manifest.artifacts['dist/node.js'], 'Strict and timed JavaScript bundle differs');
for (const c of corpus) {
 const entry = diff.provenance.reference.upstream.files.find(f => f.path === c.path);
 assert(entry?.sha256 === c.sha256, `Strict and timed input differs: ${c.id}`);
}
const median = a => [...a].sort((x,y) => x-y)[Math.ceil(a.length * .5) - 1];
const describe = cases => ({pages:cases.length,totalBytes:cases.reduce((a,c)=>a+c.bytes,0),minBytes:Math.min(...cases.map(c=>c.bytes)),medianBytes:median(cases.map(c=>c.bytes)),maxBytes:Math.max(...cases.map(c=>c.bytes))});
const result = {schema:1, generatedAt:new Date().toISOString(), provenance:{summaryPath:resolve(summaryPath),summarySha256:sha(summaryBytes),strictReportPath:resolve(diffPath),strictReportSha256:sha(diffBytes),strictCompared:diff.compared,strictDifferingCases:diff.summary.differingCases,strictCandidate:diff.provenance.candidate,corpusSha256:summary.corpusSha256}, method:'Postselected exact-output upstream public API subset: remove every engine/api case with any strict field, status, error or transport difference; sum existing nine-sample per-page median timings. No new measurements. This biased subset is not representative of the full corpus. RSS cannot be subsetted from shared worker high-water marks.', fullCorpus:describe(corpus), engines:{}};
for (const [engine, data] of Object.entries(summary.engines)) {
 const differing = new Set(diff.differences.filter(d=>d.id.startsWith('upstream/')&&d.id.endsWith(`/${engine}/api`)).map(d=>d.id.slice('upstream/'.length,-`/${engine}/api`.length)));
 assert(diff.summary.byGroup[`${engine}/api`].cases === 151, 'Incomplete engine public API strict comparison');
 const cases = corpus.filter(c=>!differing.has(c.id));
 assert(cases.length > 0, 'No exact-output subset');
 const textDiffering = new Set(data.fullTextCorrectness.rust.differingIds);
 assert(cases.every(c=>!textDiffering.has(c.id)), 'Strict-equal case differs in timed text fingerprint');
 const totals = Object.fromEntries(['javascript','go','rust'].map(impl=>[impl,cases.reduce((sum,c)=>{
  const stat=data.full[impl].perPage[c.id];assert(stat.n===9&&stat.p50>0,`Wrong samples ${engine}/${impl}/${c.id}`);return sum+stat.p50;
 },0)]));
 result.engines[engine]={...describe(cases),ids:cases.map(c=>c.id),textFingerprintsMatch:true,samplesPerPage:9,sumPageMediansMs:totals,javascriptOverGo:totals.javascript/totals.go,javascriptOverRust:totals.javascript/totals.rust,subsetSharePages:cases.length/corpus.length,subsetShareBytes:cases.reduce((a,c)=>a+c.bytes,0)/result.fullCorpus.totalBytes};
}
writeFileSync(resolve(outputPath),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.engines,null,2));
