# Python 审查修复后的四语言复测

2026-10-27，在审查修复后的真实 wheel 上重新完成四语言采样，并在同一轮中交替
运行优化前、优化后但审查前、审查修复后三个 Python 版本。没有发布到 PyPI。

本机结果未显示有实际意义的常驻耗时回退：相对审查前，Chromium 为 **-1.44%**，
Mozilla 为 **+0.20%**；配对 bootstrap 的 95% 区间上界分别为 **+0.35%**、
**+2.38%**，均低于分析前设定的 **+5%** 关注阈值。这里指完整语料聚合指标，
不保证每篇页面、尾延迟或其他平台都没有变化。

[离线交互报告](performance/2026-10-27-python-reviewed/report.html)支持引擎切换，
包含四语言、三个版本、CLI、RSS、绑定阶段和不确定性区间。
[正式汇总](performance/2026-10-27-python-reviewed/summary.json)、
[三版本对照](performance/2026-10-27-python-reviewed/paired-summary.json)、
[回退区间](performance/2026-10-27-python-reviewed/regression.json)、
[补充内存对照](performance/2026-10-27-python-reviewed/memory-control.json)和
[原始样本及源码证据](performance/2026-10-27-python-reviewed/evidence.zip)均保留。

## 四语言与历史结果

正式指标为 130 篇逐页中位数之和，包括解析、提取、清洗及最终 Article JSON
序列化，不是进程启动时间或生产吞吐率。本轮结果：

- Chromium：JavaScript **6,752.23 ms**、Go **291.81 ms**、Rust **312.94 ms**、
  Python **356.65 ms**。
- Mozilla：JavaScript **6,757.05 ms**、Go **280.20 ms**、Rust **300.49 ms**、
  Python **343.42 ms**。

Python 耗时约为 Rust 的 **1.14 倍**、Go 的 **1.22–1.23 倍**；JavaScript
约为 Python 的 **18.93–19.68 倍**。四者来自同一轮，未拼接历史语言数字。

历史 Python 正式结果依次为：

- [优化前](PYTHON_PERFORMANCE.md)：Chromium **386.79 ms**、Mozilla **372.23 ms**。
- [优化后、审查前](PYTHON_OPTIMIZATION.md)：**356.89 ms / 345.09 ms**。
- 本轮审查修复后：**356.65 ms / 343.42 ms**。

不同轮次的后台负载、进程分配和时钟状态可能不同，以上仅用于追踪；不能把
跨轮数字的全部差异归因于代码。判断修复影响使用下面同轮三个版本的对照。
历史报告及原始数据没有覆盖或改写。

## 同轮三个版本

六轮独立 worker，每轮三个版本使用相同页面顺序，轮换运行位置。完整 JSON
输出保持一致；逐页耗时各有 18 个样本。数值顺序均为「优化前 → 审查前 → 修复后」。

Chromium：

- 常驻耗时：**365.75 → 361.64 → 356.44 ms**。
- 整批 RSS：**284.98 → 151.05 → 144.82 MiB**。
- worker 完成时间：**2,204.75 → 2,276.15 → 2,196.57 ms**。

Mozilla：

- 常驻耗时：**356.36 → 345.56 → 346.26 ms**。
- 整批 RSS：**286.60 → 148.42 → 150.37 MiB**。
- worker 完成时间：**2,156.01 → 2,150.76 → 2,149.20 ms**。

相对优化前，修复后的耗时仍下降 **2.54% / 2.84%**，RSS 仍下降
**49.18% / 47.53%**。内存收益主要来自基准输入逐项解码；公开 API 仍每次
接收一篇 HTML，不能由此宣称任意调用方的内存减半。

相对审查前的耗时比值及 95% 配对区间：Chromium **0.9856×
[0.9379, 1.0035]**；Mozilla **1.0020× [0.9935, 1.0238]**。按整轮配对
重采样 2,000 次，保留进程内相关性，不把同一进程的页面当成独立进程。
六轮样本仍有限；这是本机实验的区间估计，不是形式化的无回退证明。

## 内存复核

首轮 RSS 修复后 / 审查前为 **0.9587× / 1.0131×**。Mozilla 六轮的区间较宽
（**0.9488–1.1047×**），因此追加 12 对完整 worker，交替运行审查前和修复后，
使用新的相同配对页面顺序。原始六轮全部保留，补充实验单列，不挑选较好样本。

补充实验的 RSS 中位数：Chromium **154.98 → 152.63 MiB（-1.52%）**，
Mozilla **149.61 → 150.73 MiB（+0.75%）**。5,000 次配对 bootstrap 的比值
95% 区间分别为 **[0.9553, 1.0128]**、**[0.9695, 1.0336]**。这轮没有观察到
明显的整批内存回退；两个区间都包含 1，不能断言存在确定的提升或零变化。
首轮和补充实验均指进程峰值，不能保证长期服务无泄漏或任意输入的内存上限。

独立输入装载诊断保留同样 130 篇 HTML：普通 `json.load` 的峰值 RSS 中位数
为 **211.17 MiB**，增量装载为 **100.98 MiB**。该诊断仅装载输入，不做提取，
且不是与审查前的同轮比较。进程峰值不能相减解释为单次提取的增量分配。
四语言正式整批 RSS 分别为 Chromium **1,563.81 / 113.02 / 81.78 / 143.61 MiB**，
Mozilla **1,368.14 / 112.80 / 79.30 / 149.73 MiB**（JS / Go / Rust / Python）。
运行时、输入保存方式和分配器不同，不应把该指标当成纯算法空间复杂度。

## CLI 与绑定成本

三个尺寸页面、两个引擎、三个版本各运行 12 个新 CLI 进程。修复后的中位数
为 **28.71–31.77 ms**；相对审查前，六项均在 **-2.05% 至 -0.08%** 之间。
`--version` 启动中位数为 **28.27 → 28.60 → 28.24 ms**。没有观察到一致的
CLI 启动退化；全部样本与范围见交互报告，微小差异不作显著性承诺。

分阶段插桩单独运行，未混入正式计时。Rust 核心占 **96.91%–96.99%**，
Rust 字段到 Python tuple 占 **0.20%–0.21%**，Article 构造占约 **0.09%**，
`to_dict` 占约 **0.19%**，最终 Python JSON 序列化占 **2.37%–2.44%**。
审查修复没有重新引入公开路径中的两次 JSON 往返。边界残差含插桩和返回值
成本，不能解释为纯 FFI 指令开销；阶段用逐页均值之和，排名用中位数之和。

## 验证、来源与实验边界

- 正式四语言 **464 个进程作业**；每引擎 4 轮，每页预热 2 次、记录 3 次，
  共 12 个样本；详细页面各 40 个样本，CLI 各 12 个新进程。
- 三版本常驻/详细对照 **72 个作业**，另有 **252 个 CLI/启动作业**；补充内存
  **48 个作业**，阶段诊断 **16 个**、输入装载诊断 **24 个**。计时期间没有
  并行构建、测试或其他性能实验；所有采样和离群值均保留。
- 四语言双引擎正文状态、UTF-16 长度及 checksum 均为 **130/130** 一致；
  三版本 CLI 完整 Article 一致。签名检查不替代完整严格差分。
- Python **28 项测试**在采样前通过。Go、Rust、Python 各 **604 项提取 +
  282 项 readerability** 的真实严格报告通过；仅在核对当前二进制/适配器及
  JS 参考源码哈希一致后复用对应门禁报告，没有把旧二进制门禁冒充新版本。
- 优化前使用留存 wheel；审查前从上一轮证据包恢复原生库、Python 源码、worker
  和输入解码器，逐文件校验 SHA-256。修复后使用本次真实安装的 wheel。
  三者均为 CPython **3.13.13**。审查前引用目录经独立 venv 的 `.pth` 加载，
  启动环境有这个细微差异，所以不把亚毫秒 CLI 变化归因于单一代码修改。
- 环境：Apple M5 / macOS arm64 / Darwin **25.5.0**，Node **26.11.1**、Go
  **1.27.1**、Rust **1.99.1**，release 构建，默认 GC/线程/分配器设置；未固定
  CPU 频率或隔离全部后台任务。其他平台、Python 版本和长期服务负载仍需对应验证。

本轮只扩展性能验证、归档工具和报告，没有修改库的运行时实现，也没有发布。
证据包中的 `manifest.json` 锁定正式采样源码和二进制；`optimized-reference/`
记录审查前归档来源和文件哈希，`postprocessing/` 记录采样后新增的分析/显示工具。

## 复现

先完成各语言 release 构建、Python wheel 安装和严格门禁。将旧 wheel 安装到
独立 venv，并从审查前证据恢复引用运行时及 worker，然后执行：

```sh
PYTHON_BINARY="$PWD/python/.venv/bin/python" \
GO_BINARY=/path/to/go GOROOT=/matching/go/root \
node tools/benchmark-all.mjs --include-python \
  --output performance-reports/reproduce-reviewed --seed 20261027 \
  --replicates 4 --full-iterations 3 --detail-iterations 10 --warmup 2 --cold-iterations 12
node tools/summarize-benchmark.mjs performance-reports/reproduce-reviewed/raw.json performance-reports/reproduce-reviewed/summary.json
python/.venv/bin/python tools/benchmark-python-paired.py \
  --before-python /path/to/old-venv/bin/python --before-worker /path/to/old-worker.py \
  --before-wheel /path/to/old.whl --reference-python /path/to/reference-venv/bin/python \
  --reference-worker /path/to/reference/worker.py --with-cli \
  --output performance-reports/reproduce-reviewed
python/.venv/bin/python tools/summarize-python-regression.py performance-reports/reproduce-reviewed/paired-raw.json performance-reports/reproduce-reviewed/regression.json
python/.venv/bin/python tools/benchmark-python-memory-control.py \
  --reference-python /path/to/reference-venv/bin/python \
  --reference-worker /path/to/reference/worker.py --output performance-reports/reproduce-reviewed
```

另运行 `tools/profile-python.py`、`tools/summarize-python-profile.py`、
`tools/profile-python-memory.py`，并由真实差分报告生成 `compatibility.json`。
`tools/render-python-reviewed.mjs` 生成三版本报告，随后
`tools/augment-python-reviewed.mjs` 加入区间和补充内存结果。
`tools/check-python-benchmark.mjs` 检查离线页面，
`tools/package-python-reviewed.py` 验证测量文件哈希并归档。

证据包 SHA-256：`0e438d3bd4a041ffc1b1b2b635c3eace592cf97f2b0da7460497299163cbbea2`。

离线页面已通过 Chromium 156 双引擎切换、四语言/三版本行数及区间显示检查，
零页面错误、零网络请求；结束后再次运行 Python 28 项测试全部通过。归档内所有
文件校验和及正式测量源码/二进制哈希均通过核对。
