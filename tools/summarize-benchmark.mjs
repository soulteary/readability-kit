#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Read-only aggregation: never launches extractors, builds, or benchmark workers.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node tools/summarize-benchmark.mjs raw.json summary.json');
const rawPath=resolve(input),raw=JSON.parse(readFileSync(rawPath,'utf8')),base=dirname(rawPath);
const {manifest,jobs}=raw,{config,corpus,detailedCaseIds}=manifest;
const impls=config.implementations??['javascript','go','rust'];
const assert=(x,message)=>{if(!x)throw new Error(message)};
assert(raw.schema===1&&Array.isArray(jobs),'Unsupported raw report');
const nearest=(values,q)=>{assert(values.length>0,'Empty statistic');const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(q*sorted.length)-1)];};
const stats=values=>({n:values.length,p50:nearest(values,.5),p95:values.length>=20?nearest(values,.95):null,min:Math.min(...values),max:Math.max(...values)});
const rss=group=>stats(group.map(j=>j.stats.maxRSSBytes/1048576));
const signature=x=>JSON.stringify([x.statuses[0],x.lengths[0],x.checksums[0]]);
const tuple=j=>JSON.stringify([j.phase,j.scope??'',j.engine??'',j.impl,j.replicate,j.caseId??(j.scope==='detail'?j.caseIds?.[0]:'')]);
const seen=new Set(),jobIds=new Set();
for(const j of jobs){
 assert(!jobIds.has(j.id),`Duplicate job id ${j.id}`);jobIds.add(j.id);
 assert(!seen.has(tuple(j)),`Duplicate job ${j.id}`);seen.add(tuple(j));
 assert(j.stats.exitCode===0&&!j.stats.timedOut,`Failed job ${j.id}`);
 assert(Number.isFinite(j.stats.wallNs)&&j.stats.wallNs>0&&Number.isFinite(j.stats.maxRSSBytes)&&j.stats.maxRSSBytes>0,`Invalid process statistics ${j.id}`);
 assert(impls.includes(j.impl)&&['resident','cold','startup'].includes(j.phase),`Unknown job ${j.id}`);
}
const select=(phase,impl,engine,scope,caseId)=>jobs.filter(j=>j.phase===phase&&j.impl===impl&&(engine===undefined||j.engine===engine)&&(scope===undefined||j.scope===scope)&&(caseId===undefined||j.caseId===caseId||(phase==='resident'&&j.caseIds.length===1&&j.caseIds[0]===caseId)));
function group(phase,impl,engine,scope,caseId){
 const result=select(phase,impl,engine,scope,caseId),n=phase==='resident'?config.replicates:config.coldIterations;
 assert(result.length===n,`Missing/extra jobs: ${[phase,impl,engine,scope,caseId]} got ${result.length}, expected ${n}`);
 assert(new Set(result.map(j=>j.replicate)).size===n&&result.every(j=>Number.isInteger(j.replicate)&&j.replicate>=0&&j.replicate<n),'Invalid replicate indices');
 return result;
}
function resident(group,ids,iterations){
 const samples=new Map(ids.map(id=>[id,[]])),signatures=new Map();
 for(const j of group){
  assert(j.iterations===iterations&&j.worker.cases.length===ids.length&&j.caseIds.length===ids.length,`Invalid resident metadata ${j.id}`);
  assert(new Set(j.caseIds).size===ids.length&&j.caseIds.every(id=>samples.has(id)),`Wrong resident corpus ${j.id}`);
  for(const [i,x]of j.worker.cases.entries()){
   assert(x.id===j.caseIds[i],`Worker case ordering ${j.id}`);
   for(const key of ['durationsNs','lengths','checksums','outputBytes','statuses'])assert(Array.isArray(x[key])&&x[key].length===iterations,`Invalid ${key} sample count ${j.id}/${x.id}`);
   assert(x.durationsNs.every(n=>Number.isFinite(n)&&n>0)&&x.lengths.every(n=>Number.isSafeInteger(n)&&n>=0)&&x.outputBytes.every(n=>Number.isSafeInteger(n)&&n>=0)&&x.checksums.every(s=>/^[a-f0-9]{16}$/.test(s))&&x.statuses.every(s=>['ok','empty'].includes(s)),`Invalid resident sample ${j.id}/${x.id}`);
   for(const key of ['lengths','checksums','statuses'])assert(new Set(x[key]).size===1,`Unstable ${key} ${j.id}/${x.id}`);
   const sig=signature(x);assert(!signatures.has(x.id)||signatures.get(x.id)===sig,`Unstable across replicas ${x.id}`);signatures.set(x.id,sig);
   samples.get(x.id).push(...x.durationsNs.map(n=>n/1e6));
  }
 }
 for(const [id,values]of samples)assert(values.length===config.replicates*iterations,`Missing samples ${id}`);
 return {samples,signatures};
}
const summary={schema:1,source:rawPath,sourceSha256:createHash('sha256').update(readFileSync(rawPath)).digest('hex'),generatedAt:new Date().toISOString(),method:{quantile:'nearest rank: sorted[ceil(q*n)-1]',timingUnit:'ms',memoryUnit:'MiB',residentTiming:'HTML extraction and Article JSON serialization; checksum outside timer',residentRSS:'OS process high-water RSS, includes runtime, loaded input, warmup and measured iterations',coldTiming:'OS process creation through exit; warmed filesystem cache; includes HTML file read and JSON stdout',fullCorrectness:'Status + UTF-16 text length + FNV-1a UTF-8 text checksum only; does not establish full Article parity'},config,environment:manifest.environment,corpusSha256:manifest.corpusSha256,corpusPages:corpus.length,validation:{jobs:jobs.length,stableResidentOutputs:true,stableColdOutputs:true,missingJobs:0},engines:{},startup:{}};
for(const engine of config.engines){
 const full={},detail={},fullData={};
 for(const impl of impls){
  const g=group('resident',impl,engine,'full'),data=resident(g,corpus.map(x=>x.id),config.fullIterations);fullData[impl]=data;
  const perPage=Object.fromEntries([...data.samples].map(([id,v])=>[id,stats(v)])),medians=Object.values(perPage).map(x=>x.p50);
  full[impl]={samplesPerPage:config.replicates*config.fullIterations,corpusSumPageMediansMs:medians.reduce((a,b)=>a+b,0),pageMedianDistributionMs:stats(medians),workerPeakRSSMiB:rss(g),perPage};
 }
 const correctness={};
 for(const impl of impls.filter(k=>k!=='javascript')){
  const differingIds=corpus.map(x=>x.id).filter(id=>fullData[impl].signatures.get(id)!==fullData.javascript.signatures.get(id));
  correctness[impl]={comparedPages:corpus.length,matchingPages:corpus.length-differingIds.length,differingIds};
 }
 for(const id of detailedCaseIds){
  const row={input:corpus.find(c=>c.id===id),implementations:{},coldArticleComparison:{}};
  const articles={};
  for(const impl of impls){
   const g=group('resident',impl,engine,'detail',id),data=resident(g,[id],config.detailIterations),cold=group('cold',impl,engine,undefined,id);
   assert(data.signatures.get(id)===fullData[impl].signatures.get(id),`Full/detail output mismatch ${engine}/${impl}/${id}`);
   for(const job of g)for(const x of job.worker.cases)assert(x.statuses.every(s=>s==='ok')&&x.lengths.every(n=>n>0),`Unexpected empty detailed output ${engine}/${impl}/${id}`);
   articles[impl]=cold.map(j=>{
    const bytes=readFileSync(join(base,'jobs',j.id+'.stdout'));
    assert(createHash('sha256').update(bytes).digest('hex')===j.stdoutSha256,`Modified stdout ${j.id}`);
    return JSON.parse(bytes.toString('utf8'));
   });
   assert(articles[impl].every(a=>isDeepStrictEqual(a,articles[impl][0])),`Unstable cold Article ${engine}/${impl}/${id}`);
   row.implementations[impl]={residentMs:stats(data.samples.get(id)),workerPeakRSSMiB:rss(g),coldWallMs:stats(cold.map(j=>j.stats.wallNs/1e6)),coldPeakRSSMiB:rss(cold)};
  }
  for(const impl of impls.filter(k=>k!=='javascript')){
   const fields=[...new Set([...Object.keys(articles.javascript[0]),...Object.keys(articles[impl][0])])].filter(k=>!Object.hasOwn(articles.javascript[0],k)||!Object.hasOwn(articles[impl][0],k)||!isDeepStrictEqual(articles.javascript[0][k],articles[impl][0][k]));
   row.coldArticleComparison[impl]={comparedOutputs:articles[impl].length,mismatchingOutputs:fields.length?articles[impl].length:0,differingFields:fields};
  }
  row.ratios=ratios(row.implementations,x=>x.residentMs.p50);
  row.coldRatios=ratios(row.implementations,x=>x.coldWallMs.p50);
  row.residentPeakRSSRatios=ratios(row.implementations,x=>x.workerPeakRSSMiB.p50);
  row.coldPeakRSSRatios=ratios(row.implementations,x=>x.coldPeakRSSMiB.p50);
  detail[id]=row;
 }
 summary.engines[engine]={full,fullTextCorrectness:correctness,fullCorpusTimeRatios:ratios(full,x=>x.corpusSumPageMediansMs),fullPeakRSSRatios:ratios(full,x=>x.workerPeakRSSMiB.p50),detail};
}
function ratios(data,get){return {javascriptOverGo:get(data.javascript)/get(data.go),javascriptOverRust:get(data.javascript)/get(data.rust),...(data.python?{javascriptOverPython:get(data.javascript)/get(data.python),pythonOverRust:get(data.python)/get(data.rust),pythonOverGo:get(data.python)/get(data.go)}:{})};}
for(const impl of impls){const g=group('startup',impl);summary.startup[impl]={wallMs:stats(g.map(j=>j.stats.wallNs/1e6)),peakRSSMiB:rss(g)};}
summary.startupRatios=ratios(summary.startup,x=>x.wallMs.p50);
summary.startupPeakRSSRatios=ratios(summary.startup,x=>x.peakRSSMiB.p50);
const expected=config.engines.length*impls.length*(config.replicates*(1+detailedCaseIds.length)+config.coldIterations*detailedCaseIds.length)+impls.length*config.coldIterations;
assert(jobs.length===expected,`Unexpected total jobs ${jobs.length}, expected ${expected}`);
writeFileSync(resolve(output),JSON.stringify(summary,null,2)+'\n');
console.log(`Summarized ${jobs.length} validated jobs, ${corpus.length} pages into ${resolve(output)}`);
