#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Reuse the validated native protocol and strict comparator; do not fork it.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve, join} from 'node:path';
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'go-reports');
mkdirSync(out, {recursive:true});
function run(command,args,cwd=root,allowed=[0]) {
  const r=spawnSync(command,args,{cwd,stdio:'inherit',env:process.env});
  if(r.error) throw r.error;
  if(!allowed.includes(r.status)) process.exit(r.status ?? 1);
  return r.status;
}
const go=process.env.GO_BINARY || 'go';
const sources = {};
function collect(directory) {
  for (const entry of readdirSync(join(root,directory),{withFileTypes:true})) {
    const path = join(directory,entry.name);
    if(entry.isDirectory()) collect(path);
    else if(/\.go$|go\.(mod|sum)$/.test(entry.name)) sources[path] = createHash('sha256').update(readFileSync(join(root,path))).digest('hex');
  }
}
collect('go');
const version = spawnSync(go,['version'],{cwd:join(root,'go'),encoding:'utf8'});
if(version.status !== 0) throw new Error(version.stderr || 'go version failed');
writeFileSync(join(out,'go-provenance.json'), JSON.stringify({go:version.stdout.trim(),sources},null,2)+'\n');
run(go,['build','-trimpath','-o',join(out,'readability-kit-compat'), './cmd/readability-kit-compat'],join(root,'go'));
run(process.execPath,['tools/compatibility.mjs','capture','--output',join(out,'javascript.json')]);
const extraction=run(process.execPath,['tools/compatibility.mjs','run','--baseline',join(out,'javascript.json'),'--command',join(out,'readability-kit-compat'),'--output',join(out,'differences.json')],root,[0,1]);
run(process.execPath,['tools/compatibility.mjs','capture-readerable','--output',join(out,'readerable-javascript.json')]);
const readerable=run(process.execPath,['tools/compatibility.mjs','run','--baseline',join(out,'readerable-javascript.json'),'--command',join(out,'readability-kit-compat'),'--output',join(out,'readerable-differences.json')],root,[0,1]);
console.log(`Go strict gate: extraction=${extraction===0?'passed':'failed'}, readerability=${readerable===0?'passed':'failed'}. Reports: ${out}`);
process.exitCode=extraction || readerable;
