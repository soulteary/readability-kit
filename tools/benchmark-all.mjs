#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cpus,platform,release,totalmem} from 'node:os';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
const config={output:'performance-reports/current',seed:20261027,replicates:3,fullIterations:3,detailIterations:10,warmup:2,coldIterations:9,engines:['chromium','mozilla']};
for(let i=0;i<args.length;i++){
 if(args[i]==='--help'){console.log('node tools/benchmark-all.mjs [--output DIR] [--seed 20261027] [--replicates 3] [--full-iterations 3] [--detail-iterations 10] [--warmup 2] [--cold-iterations 9] [--engine chromium|mozilla|both]');process.exit(0);}
 const names={'--output':'output','--seed':'seed','--replicates':'replicates','--full-iterations':'fullIterations','--detail-iterations':'detailIterations','--warmup':'warmup','--cold-iterations':'coldIterations'};
 if(args[i]==='--engine'){const e=args[++i];if(!['chromium','mozilla','both'].includes(e))throw new Error('Invalid engine');config.engines=e==='both'?['chromium','mozilla']:[e];continue;}
 const key=names[args[i]];if(!key||args[i+1]===undefined)throw new Error(`Invalid argument ${args[i]}`);config[key]=key==='output'?args[++i]:Number(args[++i]);
}
for(const [k,v]of Object.entries(config))if(typeof v==='number'&&(!Number.isSafeInteger(v)||v<(k==='warmup'?0:1)))throw new Error(`Invalid ${k}`);
if(!['darwin','linux'].includes(platform()))throw new Error('RSS runner supports macOS/Linux only');
const out=resolve(root,config.output);mkdirSync(join(out,'jobs'),{recursive:true});
const hash=data=>createHash('sha256').update(data).digest('hex');
const filehash=path=>hash(readFileSync(path));
function command(cmd,a=[],options={}){const r=spawnSync(cmd,a,{cwd:root,encoding:'utf8',env:process.env,...options});if(r.error)throw r.error;if(r.status!==0)throw new Error(`${cmd} failed (${r.status}): ${r.stderr}`);return r.stdout.trim();}
const go=process.env.GO_BINARY||'go',python=process.env.PYTHON_BINARY||'python3';
const impls=['javascript','go','rust'];
const workers={javascript:[process.execPath,join(root,'tools/benchmark-javascript-worker.mjs')],go:[join(root,'go-dist/readability-kit-bench')],rust:[join(root,'target/release/readability-kit-bench')]};
const clis={javascript:[process.execPath,join(root,'packages/javascript/dist/cli.js')],go:[join(root,'go-dist/readability-kit')],rust:[join(root,'target/release/readability-kit')]};
const paths=[];function collect(dir){for(const e of readdirSync(join(root,dir),{withFileTypes:true})){const path=join(dir,e.name);if(e.isDirectory())collect(path);else if(/\.(?:go|rs|ts|mjs|py)$/.test(e.name)||['Cargo.toml','Cargo.lock','go.mod','go.sum','bun.lock','package.json','upstream.json'].includes(e.name))paths.push(path);}}
for(const d of ['packages/javascript/src','packages/shared/src','go','crates','tools'])collect(d);
for(const p of ['Cargo.toml','Cargo.lock','bun.lock','package.json','upstream.json','packages/javascript/package.json','packages/javascript/tsconfig.json','packages/shared/package.json','packages/javascript/dist/node.js','packages/javascript/dist/cli.js','go-dist/readability-kit','go-dist/readability-kit-bench','target/release/readability-kit','target/release/readability-kit-bench'])paths.push(p);
const artifacts=Object.fromEntries([...new Set(paths)].sort().map(p=>[p,filehash(join(root,p))]));
const git={head:command('git',['rev-parse','HEAD']),status:command('git',['status','--short'])};
const environment={node:process.version,nodeExecutable:process.execPath,go:command(go,['version']),rustc:command('rustc',['--version']),cargo:command('cargo',['--version']),python:command(python,['--version']),os:platform(),release:release(),arch:process.arch,cpu:cpus()[0]?.model,logicalCPUs:cpus().length,totalMemoryBytes:totalmem(),runtimeOverrides:Object.fromEntries(['GOGC','GOMEMLIMIT','GOMAXPROCS','NODE_OPTIONS','MALLOC_CONF','RUSTFLAGS'].map(k=>[k,process.env[k]??null]))};
const corpus=[];for(const entry of readdirSync(join(root,'vendor/mozilla/test/test-pages'),{withFileTypes:true})){
 if(!entry.isDirectory())continue;const path=join('vendor/mozilla/test/test-pages',entry.name,'source.html');let bytes;try{bytes=readFileSync(join(root,path))}catch(e){if(e.code==='ENOENT')continue;throw e;}corpus.push({id:entry.name,path,bytes:bytes.length,sha256:hash(bytes),html:bytes.toString('utf8')});
}
corpus.sort((a,b)=>a.bytes-b.bytes||a.id.localeCompare(b.id));if(!corpus.length)throw new Error('No corpus');
const details=[...new Set([.1,.5,.9].map(q=>Math.floor((corpus.length-1)*q)))].map(i=>corpus[i]);
const corpusManifest=corpus.map(({html,...x})=>x);
const manifest={schema:1,generatedAt:new Date().toISOString(),config,environment,git,artifacts,corpus:corpusManifest,corpusSha256:hash(JSON.stringify(corpusManifest)),detailedCaseIds:details.map(x=>x.id)};
writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
let state=config.seed>>>0;const rand=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
function shuffled(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
const order=(rep,reverse=false)=>{const x=reverse?[...impls].reverse():impls;return [...x.slice(rep%3),...x.slice(0,rep%3)];};
const jobs=[];let index=0;
function measure(meta,cmd,inputFile=null){
 const id=String(++index).padStart(4,'0');const prefix=join(out,'jobs',id);const spec={command:cmd,cwd:root,inputFile,stdoutFile:prefix+'.stdout',stderrFile:prefix+'.stderr',timeoutSeconds:600};writeFileSync(prefix+'.spec.json',JSON.stringify(spec));
 const stats=JSON.parse(command(python,[join(root,'tools/benchmark-process.py'),prefix+'.spec.json']));
 if(stats.timedOut||stats.exitCode!==0)throw new Error(`${JSON.stringify(meta)} failed: ${readFileSync(spec.stderrFile,'utf8')}`);
 const stdout=readFileSync(spec.stdoutFile,'utf8');const job={id,...meta,command:cmd,inputFile:inputFile?relative(out,inputFile):null,stats,stdoutSha256:hash(stdout)};
 if(meta.phase==='resident'){
  const value=JSON.parse(stdout);if(!Array.isArray(value.cases)||value.cases.length!==meta.caseIds.length)throw new Error('Worker case count');
  for(let i=0;i<value.cases.length;i++){
   const x=value.cases[i];if(x.id!==meta.caseIds[i])throw new Error('Worker case order');
   for(const key of ['durationsNs','lengths','checksums','outputBytes','statuses'])if(!Array.isArray(x[key])||x[key].length!==meta.iterations)throw new Error(`Worker samples ${key}`);
   if(x.durationsNs.some(n=>!Number.isFinite(n)||n<=0)||x.lengths.some(n=>!Number.isSafeInteger(n)||n<0)||x.outputBytes.some(n=>!Number.isSafeInteger(n)||n<0)||x.checksums.some(n=>!/^[0-9a-f]{16}$/.test(n))||x.statuses.some(s=>!['ok','empty'].includes(s)))throw new Error('Invalid worker sample');
   if(new Set(x.checksums).size!==1||new Set(x.lengths).size!==1||new Set(x.statuses).size!==1)throw new Error('Nondeterministic extraction');
  }
  job.worker=value;
 } else if(meta.phase==='cold'){
  const a=JSON.parse(stdout);if(typeof a?.content!=='string'||!a.content||typeof a?.textContent!=='string'||!a.textContent)throw new Error('Invalid CLI article');
  job.article={length:a.length,textSha256:hash(a.textContent),contentSha256:hash(a.content),outputBytes:Buffer.byteLength(stdout)};
 }else job.version=stdout.trim();
 jobs.push(job);writeFileSync(join(out,'raw.json'),JSON.stringify({schema:1,manifest,jobs},null,2)+'\n');
 console.error(`[${id}] ${meta.phase}/${meta.scope??''} ${meta.engine??''} ${meta.impl} ${meta.caseId??meta.caseIds?.length??''} ${(stats.wallNs/1e9).toFixed(2)}s RSS ${(stats.maxRSSBytes/1048576).toFixed(1)}MiB`);
}
function resident(scope,engine,rep,cases,iterations){
 const input=join(out,`input-${scope}-${engine}-${rep}.json`);
 writeFileSync(input,JSON.stringify({cases:cases.map(x=>({id:x.id,html:x.html,options:{url:'https://example.com/test/page.html',engine}})),warmup:config.warmup,iterations,serialize:true,allowEmpty:true}));
 for(const impl of order(rep))measure({phase:'resident',scope,engine,replicate:rep,impl,caseIds:cases.map(x=>x.id),iterations},workers[impl],input);
}
// Complete each Latin-square block before changing engine; no parallel workers.
for(let rep=0;rep<config.replicates;rep++)for(const engine of config.engines){
 resident('full',engine,rep,shuffled(corpus),config.fullIterations);
 for(const c of shuffled(details))resident('detail',engine,rep,[c],config.detailIterations);
}
for(let rep=0;rep<config.coldIterations;rep++){
 for(const engine of config.engines)for(const c of shuffled(details))for(const impl of order(rep,rep%2===1)){
  measure({phase:'cold',engine,replicate:rep,impl,caseId:c.id},[...clis[impl],join(root,c.path),'--url','https://example.com/test/page.html','--engine',engine,'--format','json']);
 }
 for(const impl of order(rep,rep%2===1))measure({phase:'startup',replicate:rep,impl},[...clis[impl],'--version']);
}
console.log(`Benchmark complete: ${jobs.length} jobs, ${corpus.length} corpus cases; raw report ${join(out,'raw.json')}`);
