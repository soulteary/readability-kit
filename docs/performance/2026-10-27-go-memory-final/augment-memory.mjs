// Post-measurement display augmentation only; no worker/timing changes.
import {readFileSync,writeFileSync} from 'node:fs';
const [htmlPath,allocationPath,currentPath,previousPath]=process.argv.slice(2);
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const a=read(allocationPath),current=read(currentPath),previous=read(previousPath);
const f=x=>Number(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rows=Object.entries(a.comparison).map(([key,v])=>{
 const [id,engine]=key.split('/');const b=previous.engines[engine].detail[id].implementations.go,c=current.engines[engine].detail[id].implementations.go;
 return '<tr><td>'+esc(engine)+' / '+esc(id)+'</td><td>'+f(v.beforeBytesPerOp/1024)+' → '+f(v.afterBytesPerOp/1024)+'</td><td>'+f(v.reductionPercent)+'%</td><td>'+f(b.coldPeakRSSMiB.p50)+' → '+f(c.coldPeakRSSMiB.p50)+'</td></tr>';
}).join('');
const section='<section id="allocationComparison"><h2>Go 内存优化：单次分配与 CLI 峰值</h2><p class="caption">对照：上一轮 Go 耗时优化版本 → 本轮最终版本。分配量是公开提取＋原生 JSON 序列化的 B/op；每项 2 次预热、30 次计量，3 份 testing.B 报告取中位数。它是独立诊断，不是峰值 RSS，也不替代下面的三语言计时。</p><div class="scroll"><table><thead><tr><th>引擎 / 同一尺寸语料</th><th>Go 分配量 KiB/op 前 → 后</th><th>分配量下降</th><th>实际 CLI RSS MiB 前 → 后</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="caption">整批 worker RSS 未明显下降；小页面 CLI 与启动基线 RSS 略升，不能把分配量下降解释为整体内存下降。CLI 每项 n=9；全部原始异常值保留。<a href="allocations.json">分配原始结果</a> · <a href="go-sources.zip">源码与诊断证据</a> · <a href="../../PERFORMANCE.md">范围及复现</a></p></section>';
let html=readFileSync(htmlPath,'utf8');
if(html.includes('id="allocationComparison"'))throw new Error('Already augmented');
const marker='<h2>全部 130 篇语料：常驻进程</h2>';
if(!html.includes(marker))throw new Error('Missing report marker');
writeFileSync(htmlPath,html.replace(marker,section+marker));
