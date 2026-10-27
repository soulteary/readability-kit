#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Compare actual artifacts in the same browser, with rotated execution order.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve, extname, sep, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync, brotliCompressSync, constants} from 'node:zlib';
import {cpus} from 'node:os';
import {chromium} from '@playwright/test';
import {validateSnapshot} from './rust-compatibility.mjs';
const variants = JSON.parse(process.env.WASM_COMPARE_VARIANTS ?? '{"before":"wasm-reports/optimization/before/pkg","after":"wasm/pkg"}');
const names = Object.keys(variants);
assert.ok(names.length >= 2);
const rounds = Number(process.env.WASM_COMPARE_ROUNDS ?? 3);
const iterations = Number(process.env.WASM_COMPARE_ITERATIONS ?? 5);
const detailOnly = process.env.WASM_COMPARE_DETAIL_ONLY === '1';
assert.ok(Number.isSafeInteger(rounds) && rounds > 0 && Number.isSafeInteger(iterations) && iterations > 0);
const output = resolve(process.env.WASM_COMPARE_OUTPUT ?? 'wasm-reports/optimization/comparison.json');
const referencePath = resolve(process.env.WASM_COMPARE_REFERENCE ?? 'wasm-reports/javascript.json');
const referenceBytes = await readFile(referencePath);
const reference = JSON.parse(referenceBytes);
validateSnapshot(reference);
const corpus = reference.cases.filter(item => item.layer === 'api' && item.id.startsWith('upstream/'));
assert.equal(corpus.length, 260);
const cases = detailOnly ? corpus.filter(item => ['rtl-4', 'ehow-2', 'schema-org-context-object'].includes(item.id.split('/')[1])) : corpus;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const assets = {};
for (const [name, directory] of Object.entries(variants)) {
  assert.match(name, /^[a-z0-9_-]+$/);
  variants[name] = resolve(directory);
  assets[name] = [];
  for (const file of ['index.js', 'worker.js', 'readability_wasm.js', 'readability_wasm_bg.wasm']) {
    const bytes = await readFile(resolve(directory, file));
    assets[name].push({file, bytes: bytes.length, gzipBytes: gzipSync(bytes, {level: 9}).length, brotliBytes: brotliCompressSync(bytes, {params: {[constants.BROTLI_PARAM_QUALITY]: 11}}).length, sha256: hash(bytes)});
  }
}
const server = createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') {res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>WASM paired benchmark</title>');return;}
    const [, name, ...path] = url.pathname.split('/');
    assert.ok(Object.hasOwn(variants,name));
    const file = resolve(variants[name], decodeURIComponent(path.join('/')));
    assert.ok(file.startsWith(variants[name] + sep));
    res.setHeader('Content-Type', extname(file) === '.wasm' ? 'application/wasm' : 'text/javascript');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await readFile(file));
  } catch {res.writeHead(404);res.end('Not found');}
});
let browser;
try {
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless:true,...(process.env.READABILITY_TEST_CHROMIUM ? {executablePath:process.env.READABILITY_TEST_CHROMIUM} : {})});
  const rows = [];
  const startups = [];
  for (let round=0;round<rounds;round++) {
    const page = await browser.newPage();
    await page.goto(origin);
    startups.push(await page.evaluate(async ({names,round}) => {
      window.modules = {};window.workers = {};
      const samples = [];
      for(let i=0;i<names.length;i++) {
        const name = names[(i+round)%names.length];
        const start = performance.now();
        const api = await import(`/${name}/index.js`);
        const imported = performance.now();
        await api.init();
        const initialized = performance.now();
        const worker = await api.createWorkerReader();
        samples.push({name,importMs:imported-start,initMs:initialized-imported,workerCreateAndInitMs:performance.now()-initialized});
        modules[name] = api;workers[name] = worker;
      }
      window.measure = async (item,round,iterations) => {
        const methods = [];
        for(const name of Object.keys(modules)) {
          methods.push([`${name}/main`,()=>modules[name].extractHTML(item.html,item.options)]);
          methods.push([`${name}/worker`,()=>workers[name].extractHTML(item.html,item.options)]);
        }
        const timings = Object.fromEntries(methods.map(([name])=>[name,[]]));
        const checks = [];
        for(const [name,method] of methods) {
          const result = await method(); // per-page/per-method warmup
          checks.push({name,result});
        }
        // Multiple calls per sample reduce timer quantization; all output checks
        // occur outside the timed region and compare complete Articles in Node.
        const batch = 3;
        for(let i=0;i<iterations;i++) {
          for(let j=0;j<methods.length;j++) {
            const [name,method] = methods[(i+j+round)%methods.length];
            const results = [];
            const start = performance.now();
            for(let k=0;k<batch;k++) results.push(await method());
            timings[name].push((performance.now()-start)/batch);
            if(results.some(result=>JSON.stringify(result)!==JSON.stringify(checks.find(check=>check.name===name).result))) throw new Error('Unstable Article during benchmark');
          }
          await new Promise(resolve=>setTimeout(resolve,0));
        }
        return {timings,checks};
      };
      return samples;
    },{names,round}));
    // Stable seeded shuffle of complete engine/page cases, rotated per round.
    let seed=20261027+round;
    const ordered=[...cases];
    for(let i=ordered.length-1;i>0;i--) {seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[ordered[i],ordered[j]]=[ordered[j],ordered[i]];}
    for(const item of ordered) {
      const result = await page.evaluate(({item,round,iterations})=>measure(item,round,iterations),{item,round,iterations});
      for(const check of result.checks) assert.deepEqual(check.result,item.result.article,`${item.id}/${check.name}`);
      rows.push({id:item.id,engine:item.options.engine,round,inputBytes:Buffer.byteLength(item.html),timings:result.timings});
    }
    await page.evaluate(()=>Object.values(workers).forEach(worker=>worker.terminate()));
    await page.close();
    console.log(`Round ${round+1}/${rounds}: ${cases.length} cases, complete Articles matched in all variants`);
  }
  const median = values => {const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];};
  const summary = {};
  for(const engine of ['chromium','mozilla']) {
    summary[engine] = {};
    for(const name of names) for(const mode of ['main','worker']) {
      const key=`${name}/${mode}`;
      const selected=cases.filter(item=>item.options.engine===engine);
      summary[engine][key]={pages:selected.length,sumPageMedianMs:selected.reduce((sum,item)=>sum+median(rows.filter(row=>row.id===item.id).flatMap(row=>row.timings[key])),0)};
    }
  }
  const details = cases.filter(item=>['rtl-4','ehow-2','schema-org-context-object'].includes(item.id.split('/')[1])).map(item=>({id:item.id,inputBytes:Buffer.byteLength(item.html),p50Ms:Object.fromEntries(names.flatMap(name=>['main','worker'].map(mode=>{const key=`${name}/${mode}`;return [key,median(rows.filter(row=>row.id===item.id).flatMap(row=>row.timings[key]))];})))}));
  const report={schema:1,measuredAt:new Date().toISOString(),environment:{node:process.version,browser:browser.version(),cpu:cpus()[0]?.model},protocol:{rounds,iterations,batch:3,warmupsPerPage:1,seed:20261027,detailOnly,order:'seeded page shuffle; rotated method and startup order',metric:'sum of per-page medians; main includes UTF-8/JSON boundary, worker includes RPC',startup:'fresh realms in one browser process; no-store HTTP; compilation cache not cleared'},reference:{file:referencePath,sha256:hash(referenceBytes),provenance:reference.provenance},assets,summary,details,startups,rows};
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({summary,details},null,2));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
