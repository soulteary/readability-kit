#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Post-measurement display only; never changes timing or raw observations.
import {readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
const folder = resolve(process.argv[2]);
let html = readFileSync(join(folder, 'report.html'), 'utf8');
const regression = JSON.parse(readFileSync(join(folder, 'regression.json'), 'utf8'));
const memory = JSON.parse(readFileSync(join(folder, 'memory-control.json'), 'utf8'));
const section = `<h2>审查修复是否引入回退</h2><p class="caption">常驻时间：6 轮配对进程，按整轮重采样 2,000 次。比值为修复后 / 审查前，预设关注阈值为 +5%。补充 RSS：另外 12 对完整 worker，5,000 次配对重采样；保留全部样本。区间只描述本机有限实验，不保证任意页面、平台或尾延迟。</p><div class="scroll"><table><thead><tr><th>指标</th><th>修复后 / 审查前</th><th>95% bootstrap 区间</th><th>备注</th></tr></thead><tbody id="regressionRows"></tbody></table></div><p class="caption">原始 6 轮 RSS 对照仍保留在证据中；补充采样不替换或删除原样本。整批 RSS 包含解释器、130 篇输入、预热和提取，不能解释为单篇请求的增量内存。</p>`;
const marker = '<h2>常驻提取：130 篇逐页中位数之和</h2>';
if (!html.includes(marker)) throw new Error('Missing report insertion marker');
html = html.replace(marker, section + marker);
const payload = JSON.stringify({regression, memory}).replaceAll('<', '\\u003c');
html = html.replace('</html>', `<script>
const reviewEvidence=${payload};
function renderReviewEvidence(){
 const engine=document.getElementById('engine').value;
 const r=reviewEvidence.regression.engines[engine].optimized,m=reviewEvidence.memory.summary[engine];
 const interval=x=>x.map(v=>f(v,4)+'×').join('–');
 document.getElementById('regressionRows').innerHTML='<tr><td>常驻提取时间</td><td>'+f(r.residentRatio,4)+'×</td><td>'+interval(r.residentRatio95Interval)+'</td><td>区间上界 '+(r.residentUpperBelow105?'低于':'高于')+' 1.05×</td></tr><tr><td>补充整批峰值 RSS</td><td>'+f(m.ratio,4)+'×</td><td>'+interval(m.ratio95Interval)+'</td><td>'+f(m.optimized.p50MiB)+' → '+f(m.after.p50MiB)+' MiB</td></tr>';
}
document.getElementById('engine').addEventListener('change',renderReviewEvidence);renderReviewEvidence();
</script></html>`);
writeFileSync(join(folder, 'report.html'), html);
