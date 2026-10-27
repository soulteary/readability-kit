#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Self-contained, offline interactive report. No network libraries or services.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const [input,output,subsetPath,compatibilityPath]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node scripts/render-benchmark.mjs summary.json report.html [matched-subset.json|-] [compatibility.json]');
const data=JSON.parse(readFileSync(input,'utf8'));
const matched=subsetPath&&subsetPath!=='-'?JSON.parse(readFileSync(subsetPath,'utf8')):null;
const compatibility=compatibilityPath?JSON.parse(readFileSync(compatibilityPath,'utf8')):null;
if(compatibility)for(const language of ['go','rust']){
 const result=compatibility[language];
 if(!result||typeof result.passed!=='boolean'||!Number.isSafeInteger(result.compared)||result.compared<1||!Number.isSafeInteger(result.differences)||result.differences<0||result.passed!==(result.differences===0))throw new Error('Invalid compatibility result for '+language);
}
const allCompatible=compatibility&&['go','rust'].every(k=>compatibility[k].passed);
const banner=compatibility?['go','rust'].map(k=>(k==='go'?'Go':'Rust')+' 严格差分 '+(compatibility[k].passed?'通过':'未通过')+'（'+compatibility[k].compared+' 项，'+compatibility[k].differences+' 项差异）').join('；')+'。':null;
mkdirSync(dirname(resolve(output)),{recursive:true});
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>readability-kit 性能对比</title>
<style>
:root{color-scheme:light dark;--bg:Canvas;--fg:CanvasText;--muted:GrayText;--accent:Highlight;--line:color-mix(in srgb,CanvasText 18%,Canvas);--panel:color-mix(in srgb,CanvasText 4%,Canvas)}
*{box-sizing:border-box}body{font:15px/1.65 system-ui,sans-serif;margin:0;background:var(--bg);color:var(--fg)}main{max-width:1160px;margin:auto;padding:36px 28px}h1{font-size:24px;line-height:1.3;margin:0 0 10px}h2{font-size:18px;margin:32px 0 10px}h3{font-size:15px;margin:0 0 10px}.sub,.caption{color:var(--muted);font-size:13px}.controls{display:flex;gap:16px;align-items:center;margin:24px 0;flex-wrap:wrap}select,button{background:var(--bg);color:var(--fg);border:1px solid var(--line);padding:7px 12px;border-radius:4px;font:inherit}button{cursor:pointer}.note{border-left:3px solid var(--accent);padding:10px 16px;background:var(--panel);margin:18px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:28px}.plot{padding:18px 0;border-top:1px solid var(--line)}.axis{font-size:12px;color:var(--muted);margin-bottom:14px}.barrow{display:grid;grid-template-columns:88px 1fr 112px;align-items:center;gap:10px;margin:13px 0}.track{height:20px;background:var(--panel)}.bar{height:20px;background:var(--muted);min-width:2px}.bar.go{background:var(--accent)}.value{font-variant-numeric:tabular-nums;text-align:right;font-size:13px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid var(--line);padding:9px 8px;text-align:right;font-variant-numeric:tabular-nums}th{font-weight:600;color:var(--muted)}th:first-child,td:first-child{text-align:left}td.case{font-family:ui-monospace,monospace;font-size:12px}.scroll{overflow:auto}.stats{display:flex;gap:30px;flex-wrap:wrap}.stat strong{display:block;font-size:22px;font-weight:600}.stat span{color:var(--muted);font-size:13px}code{font-size:12px;overflow-wrap:anywhere}.footer{border-top:1px solid var(--line);margin-top:30px;padding-top:16px}pre{white-space:pre-wrap;font-size:12px;background:var(--panel);padding:16px}details{margin:16px 0}a{color:var(--accent)}@media(max-width:760px){main{padding:22px 16px}.grid{grid-template-columns:1fr}.barrow{grid-template-columns:75px 1fr 105px}}
</style><main><h1>readability-kit：JavaScript、Go 与 Rust</h1><div class="sub" id="env"></div><div class="note">相同 HTML、相同来源 URL、默认清洗和 JSON 序列化。${banner||'Go 已通过锁定严格语料；Rust 的输出仍有差异，其速度代表当前实现成本，不能当作等价替换的加速收益。'}${allCompatible?'以下性能比较基于两种原生实现均通过严格差分的版本。':''}</div>
<div class="controls"><label>提取引擎 <select id="engine"><option value="chromium">Chromium</option><option value="mozilla">Mozilla</option></select></label><button id="download">下载汇总 JSON</button><span class="caption">本页离线运行，不发送网络请求。</span></div>
<div class="stats" id="stats"></div>
<h2>全部 130 篇语料：常驻进程</h2><div class="caption">每页 3 个独立进程 × 3 次记录，另有每进程每页 2 次预热。各实现使用相同的打乱顺序；语言执行顺序按轮次轮换。</div>
<div class="grid"><section class="plot"><h3>全语料单次提取成本估计</h3><div class="axis">纵轴：实现；横轴：毫秒（ms），越低越快。估计 = 130 个逐页中位数之和。</div><div id="fullTime"></div><div class="caption">包括解析、提取、默认清洗、最终 HTML 和 Article JSON 序列化；不含输入载入与指纹计算。</div></section>
<section class="plot"><h3>整批常驻 worker 峰值 RSS</h3><div class="axis">纵轴：实现；横轴：MiB，越低占用越少。3 个进程高水位的中位数。</div><div id="fullRSS"></div><div class="caption">包含运行时、全部输入、JSON 协议解析、预热和测量；不是单篇增量内存，也不是分配字节数。</div></section></div>
<div class="scroll"><table><thead><tr><th>实现</th><th>130 篇中位数之和 ms</th><th>逐页中位数 p50 ms</th><th>逐页中位数 p95 ms</th><th>worker RSS 中位数 MiB</th><th>worker RSS 范围 MiB</th></tr></thead><tbody id="fullTable"></tbody></table></div>
<h2>小、中、大样例：重复提取与实际 CLI</h2><div class="caption">样例按 130 篇输入字节数第 10/50/90 百分位索引确定。常驻耗时每项 n=30；CLI 新进程每项 n=9；RSS 取各自范围内 OS 子进程高水位。</div>
<div class="scroll"><table><thead><tr><th>语料 / 输入 KiB</th><th>实现</th><th>常驻 p50 ms</th><th>常驻 p95 ms</th><th>单样例 worker RSS 中位数 MiB</th><th>CLI 中位数 ms</th><th>CLI 耗时范围 ms</th><th>CLI RSS 中位数 MiB</th></tr></thead><tbody id="detailTable"></tbody></table></div>
<h2>CLI 启动基线：仅执行 --version</h2><div class="grid"><section class="plot"><h3>新进程到退出：中位数</h3><div class="axis">纵轴：实现；横轴：毫秒（ms），每项 n=9。</div><div id="startup"></div></section><section class="plot"><h3>启动基线峰值 RSS：中位数</h3><div class="axis">纵轴：实现；横轴：MiB，每项 n=9。</div><div id="startupRSS"></div></section></div>
<p class="caption">--version 不执行正文提取。CLI 正文耗时包含进程/运行时启动、文件读取、提取和完整 JSON 输出到文件。操作系统磁盘缓存未清空；不将两个中位数相减当成纯提取时间。</p>
${matched?'<h2>完整输出相同的子集：只读聚合</h2><p class="caption">依最新 Rust 严格报告选取 27/130 篇完整 Article 相同的页面，只占原始语料字节 1.27%，偏向小页面。以下仍为既有逐页中位数求和，没有新增测量，也不能推广到完整语料；整批 RSS 不能拆成子集 RSS。</p><div id="matchedSubset"></div>':''}
<h2>输出核对</h2><div id="correctness"></div>
<details><summary>测量范围、限制与复现命令</summary><p>常驻进程串行执行，各实现采用默认运行时参数，不强制 GC。JavaScript 在计时外让出事件循环，以完成 jsdom 排队的释放任务。JS JSON.stringify 生成 UTF-16 字符串，Go/Rust 原生 JSON 序列化生成 UTF-8 字节；这是各自原生序列化成本，并非完全相同的字节输出指令。</p><p>RSS 由 Python wait4 记录子进程高水位：macOS 字节、Linux KiB 转为字节。驱动进程不计入。内存与耗时均为此机器、此版本、单请求串行负载的测量，未控制热状态、频率和其他系统任务。常驻顺序完全轮换，9 轮 CLI 顺序近似平衡。小样本只报告中位数和范围。</p><pre>bun install --frozen-lockfile
bun run build
cargo build --offline --release -p readability-cli --bins
cd go
CGO_ENABLED=0 go build -trimpath -o ../go-dist/readability-kit ./cmd/readability-kit
CGO_ENABLED=0 go build -trimpath -o ../go-dist/readability-kit-bench ./cmd/readability-kit-bench
cd ..
node scripts/benchmark-all.mjs --output performance-reports/reproduce --seed 20261027 --replicates 3 --full-iterations 3 --detail-iterations 10 --warmup 2 --cold-iterations 9
node scripts/summarize-benchmark.mjs performance-reports/reproduce/raw.json performance-reports/reproduce/summary.json
node scripts/render-benchmark.mjs performance-reports/reproduce/summary.json performance-reports/reproduce/report.html</pre><p>原始采样、执行命令、运行顺序、stdout、所有输入 SHA-256、模块锁文件和二进制哈希保存在同目录的 raw.json、manifest.json 与 jobs/ 中。GO_BINARY 可指定一致的工具链。复现指令重建相同实验口径，数值会随机器和系统状态变化。</p></details>
<div class="footer caption" id="footer"></div></main><script>
const report=${JSON.stringify(data).replaceAll('<','\\u003c')};
const compatibility=${JSON.stringify(compatibility).replaceAll('<','\\u003c')};
const matchedSubset=${JSON.stringify(matched).replaceAll('<','\\u003c')};
const names={javascript:'JavaScript',go:'Go',rust:'Rust'};const impls=['javascript','go','rust'];const f=(x,n=2)=>Number(x).toLocaleString('en-US',{maximumFractionDigits:n,minimumFractionDigits:n});const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function bars(id,values,unit){const max=Math.max(...Object.values(values));document.getElementById(id).innerHTML=impls.map(k=>'<div class="barrow"><span>'+names[k]+'</span><div class="track"><div class="bar '+k+'" style="width:'+(100*values[k]/max)+'%"></div></div><span class="value">'+f(values[k])+' '+unit+'</span></div>').join('');}
function render(){const e=document.getElementById('engine').value,r=report.engines[e];
 if(matchedSubset){const s=matchedSubset.engines[e];document.getElementById('matchedSubset').innerHTML=impls.map(k=>'<p><b>'+names[k]+'</b>：'+f(s.sumPageMediansMs[k])+' ms（'+s.pages+' 篇）</p>').join('');}
 document.getElementById('stats').innerHTML='<div class="stat"><strong>'+report.corpusPages+'</strong><span>相同上游语料</span></div><div class="stat"><strong>'+f(r.fullCorpusTimeRatios.javascriptOverGo,1)+'×</strong><span>JavaScript / Go 语料总成本比</span></div><div class="stat"><strong>'+r.fullTextCorrectness.go.matchingPages+'/'+r.fullTextCorrectness.go.comparedPages+'</strong><span>Go 正文指纹与 JavaScript 一致</span></div>';
 bars('fullTime',Object.fromEntries(impls.map(k=>[k,r.full[k].corpusSumPageMediansMs])),'ms');bars('fullRSS',Object.fromEntries(impls.map(k=>[k,r.full[k].workerPeakRSSMiB.p50])),'MiB');
 document.getElementById('fullTable').innerHTML=impls.map(k=>{const x=r.full[k];return '<tr><td>'+names[k]+'</td><td>'+f(x.corpusSumPageMediansMs)+'</td><td>'+f(x.pageMedianDistributionMs.p50)+'</td><td>'+f(x.pageMedianDistributionMs.p95)+'</td><td>'+f(x.workerPeakRSSMiB.p50)+'</td><td>'+f(x.workerPeakRSSMiB.min)+'–'+f(x.workerPeakRSSMiB.max)+'</td></tr>';}).join('');
 document.getElementById('detailTable').innerHTML=Object.entries(r.detail).flatMap(([id,row])=>impls.map((k,i)=>{const x=row.implementations[k];return '<tr><td class="case">'+(i===0?esc(id)+'<br>'+f(row.input.bytes/1024)+' KiB':'')+'</td><td>'+names[k]+'</td><td>'+f(x.residentMs.p50)+'</td><td>'+f(x.residentMs.p95)+'</td><td>'+f(x.workerPeakRSSMiB.p50)+'</td><td>'+f(x.coldWallMs.p50)+'</td><td>'+f(x.coldWallMs.min)+'–'+f(x.coldWallMs.max)+'</td><td>'+f(x.coldPeakRSSMiB.p50)+'</td></tr>';})).join('');
 bars('startup',Object.fromEntries(impls.map(k=>[k,report.startup[k].wallMs.p50])),'ms');bars('startupRSS',Object.fromEntries(impls.map(k=>[k,report.startup[k].peakRSSMiB.p50])),'MiB');
 document.getElementById('correctness').innerHTML=['go','rust'].map(k=>{const c=r.fullTextCorrectness[k];const mismatches=Object.values(r.detail).reduce((n,x)=>n+x.coldArticleComparison[k].mismatchingOutputs,0);return '<p><b>'+names[k]+'</b>：全部语料中 '+c.matchingPages+'/'+c.comparedPages+' 篇的状态、UTF-16 长度及 UTF-8 FNV 指纹与 JavaScript 一致；三种尺寸的 '+report.config.coldIterations*Object.keys(r.detail).length+' 份 CLI Article 中 '+mismatches+' 份存在字段差异。'+(compatibility&&compatibility[k].passed?'另已通过独立完整 Article 严格差分 '+compatibility[k].compared+' 项。':'正文指纹不是完整 Article 兼容证明。')+'</p>';}).join('');
}
document.getElementById('env').textContent=report.environment.cpu+' · '+report.environment.os+' '+report.environment.release+' '+report.environment.arch+' · '+report.environment.node+' · '+report.environment.go+' · '+report.environment.rustc;
document.getElementById('footer').textContent='来源：本地相同语料串行测量 · '+report.generatedAt+' · 语料 SHA-256 '+report.corpusSha256;
document.getElementById('engine').onchange=render;document.getElementById('download').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));a.download='readability-performance-summary.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};render();
</script></html>`;
writeFileSync(resolve(output),html);
console.log(`Wrote offline interactive report ${resolve(output)}`);
