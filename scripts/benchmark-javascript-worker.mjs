#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import {extractHTML} from '../dist/node.js';
let input='';process.stdin.setEncoding('utf8');for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input);
if(!Array.isArray(request.cases)||!request.cases.length||!Number.isInteger(request.iterations)||request.iterations<1||!Number.isInteger(request.warmup)||request.warmup<0)throw new Error('Invalid benchmark request');
function checksum(text) {
 let hi=0xcbf29ce4,lo=0x84222325;
 for(const byte of Buffer.from(text)){lo=(lo^byte)>>>0;const product=lo*435;hi=(Math.imul(hi,435)+Math.imul(lo,256)+Math.floor(product/4294967296))>>>0;lo=product>>>0;}
 return hi.toString(16).padStart(8,'0')+lo.toString(16).padStart(8,'0');
}
if(checksum('hello')!=='a430d84680aabd0b')throw new Error('FNV implementation error');
let sink=0;
const cases=[];
for(const item of request.cases){
 for(let i=0;i<request.warmup;i++){
  await new Promise(resolve=>setImmediate(resolve));
  const a=extractHTML(item.html,item.options);if(request.serialize!==false)sink+=JSON.stringify(a).length;
  if(!request.allowEmpty&&(!a||!a.textContent))throw new Error(`Empty article: ${item.id}`);
 }
 const durationsNs=[],lengths=[],checksums=[],outputBytes=[],statuses=[];
 for(let i=0;i<request.iterations;i++){
  // Permit jsdom's queued teardown between calls; this is outside the timer,
  // with no forced GC and no hidden runtime configuration changes.
  await new Promise(resolve=>setImmediate(resolve));
  const start=process.hrtime.bigint();
  const article=extractHTML(item.html,item.options);
  const serialized=request.serialize===false?'':JSON.stringify(article);
  const elapsed=Number(process.hrtime.bigint()-start);
  if(!request.allowEmpty&&(!article||!article.textContent))throw new Error(`Empty article: ${item.id}`);
  sink+=serialized.length;durationsNs.push(elapsed);lengths.push(article?.length??0);checksums.push(checksum(article?.textContent??''));outputBytes.push(Buffer.byteLength(serialized));statuses.push(article?'ok':'empty');
 }
 cases.push({id:item.id,durationsNs,lengths,checksums,outputBytes,statuses});
}
if(!Number.isFinite(sink))throw new Error('Invalid serialization sink');
process.stdout.write(JSON.stringify({cases}));
