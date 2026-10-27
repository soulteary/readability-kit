#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const folder=resolve(process.argv[2]);
const here=dirname(fileURLToPath(import.meta.url));
execFileSync(process.execPath,[join(here,'render-python-benchmark.mjs'),join(folder,'summary.json'),join(folder,'profile-summary.json'),join(folder,'compatibility.json'),join(folder,'report.html')],{stdio:'inherit'});
let html=readFileSync(join(folder,'report.html'),'utf8');
// Keep the existing report renderer usable for its historical JSON diagnostic
// schema; this adapter orders and labels the new direct-field schema explicitly.
const marker='const f=(v,n=2)=>';
if(!html.includes(marker))throw new Error('Report renderer marker changed');
html=html.replace(marker,`if(direct){const names={pythonPrepareNs:'Python 校验和选项字典',nativeOptionsNs:'Rust 选项字段转换',nativeExtractNs:'Rust 解析、提取、清洗',nativeConvertNs:'Rust 字段 → Python tuple',boundaryResidualNs:'绑定边界残差（含插桩）',pythonDecodeArticleNs:'Python Article 构造（含观察回调）',toDictNs:'Article.to_dict()',pythonJSONNs:'最终 Python JSON 序列化'};for(const k of Object.keys(labels))delete labels[k];Object.assign(labels,names);}\n`+marker);
html=html.replace('<th>Rust JSON</th>','<th>Rust → Python 字段</th>').replace('<th>解析 + Article</th>','<th>Article 构造</th>');
html=html.replace('Python 绑定性能：与 JavaScript、Go、Rust 对比','Python 优化验证：直接字段传递与增量输入解码');
html=html.replace('Rust → JSON → Python 对象','Rust → Python 字段');
writeFileSync(join(folder,'report.html'),html);
