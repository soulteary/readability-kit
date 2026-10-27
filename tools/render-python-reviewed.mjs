#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const folder=resolve(process.argv[2]);
const here=dirname(fileURLToPath(import.meta.url));
execFileSync(process.execPath,[join(here,'render-python-optimization.mjs'),folder],{stdio:'inherit'});
let html=readFileSync(join(folder,'report.html'),'utf8');
html=html.replace('Python 优化验证：直接字段传递与增量输入解码','审查修复后：四语言与三个 Python 版本复测')
.replaceAll("'before':'旧 API / 旧装载','api-only':'新 API / 旧装载','after':'新 API / 增量装载'", "'before':'优化前','optimized':'优化后 / 审查前','after':'审查修复后'")
.replace('三个模式分别是旧 API/旧装载、新 API/旧装载、新 API/增量装载。每引擎 6 个独立进程，三种模式平衡轮换；与下方四语言采样独立，不混算统计量。', '三个版本在同一轮交替运行：优化前、优化后但审查前、审查修复后。每引擎 6 个独立进程，三种版本平衡轮换；与下方四语言采样独立，不混算统计量。');
const section=`<h2>三个版本的 CLI 对照</h2><p class="caption">同一轮，每项 12 个新进程；列出中位数和范围，保留全部样本。峰值 RSS 为该子进程高水位。</p><div class="scroll"><table><thead><tr><th>页面</th><th>版本</th><th>CLI 中位数 ms</th><th>耗时范围 ms</th><th>RSS MiB</th></tr></thead><tbody id="versionCLI"></tbody></table></div><h3>三个版本 --version 启动基线</h3><div class="scroll"><table><thead><tr><th>版本</th><th>中位数 ms</th><th>范围 ms</th><th>RSS MiB</th></tr></thead><tbody id="versionStartup"></tbody></table></div>`;
html=html.replace('<h2>Python 绑定和数据转换：单独插桩诊断</h2>',section+'<h2>Python 绑定和数据转换：单独插桩诊断</h2>');
const extra=`<script>
const versionNames={before:'优化前',optimized:'优化后 / 审查前',after:'审查修复后'};
function renderVersionCLI(){const engine=document.getElementById('engine').value;
document.getElementById('versionCLI').innerHTML=Object.entries(data.paired.cold[engine]).flatMap(([id,modes])=>Object.entries(modes).map(([k,v])=>'<tr><td>'+esc(id)+'</td><td>'+versionNames[k]+'</td><td>'+f(v.wallMs.p50)+'</td><td>'+f(v.wallMs.min)+'–'+f(v.wallMs.max)+'</td><td>'+f(v.rssMiB.p50)+'</td></tr>')).join('');}
document.getElementById('versionStartup').innerHTML=Object.entries(data.paired.startup).map(([k,v])=>'<tr><td>'+versionNames[k]+'</td><td>'+f(v.wallMs.p50)+'</td><td>'+f(v.wallMs.min)+'–'+f(v.wallMs.max)+'</td><td>'+f(v.rssMiB.p50)+'</td></tr>').join('');
document.getElementById('engine').addEventListener('change',renderVersionCLI);renderVersionCLI();
</script>`;
html=html.replace('</html>',extra+'</html>');
writeFileSync(join(folder,'report.html'),html);
