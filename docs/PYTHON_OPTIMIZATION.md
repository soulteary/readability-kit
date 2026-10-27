# Python 优化：直接字段传递与增量输入解码

最新的审查修复后复测见 [PYTHON_REVIEW_PERFORMANCE.md](PYTHON_REVIEW_PERFORMANCE.md)。本页保留当时的历史数据。

后续 API、线程和打包审查见 [PYTHON_REVIEW.md](PYTHON_REVIEW.md)。本页保留优化完成时的测量数据。

2026-10-27 完成优化与完整复测。保留原有 Python API、Article dataclass、默认
选项、空结果、异常分类、UTF-16 length、CLI 输出和文件保护行为，未发布到 PyPI。
Rust 提取算法及 JavaScript、Go、Rust 的运行时代码没有因此修改。

[交互报告](performance/2026-10-27-python-optimized/report.html)包含四语言结果、
同轮前后对照、内存和分阶段诊断；[最终汇总](performance/2026-10-27-python-optimized/summary.json)、
[三组对照](performance/2026-10-27-python-optimized/paired-summary.json)、
[完整证据及源码](performance/2026-10-27-python-optimized/evidence.zip)可下载。
[64 KiB 阶段原始证据](performance/2026-10-27-python-optimized/stage1-64k.zip)也保留。
上一轮未优化版本的分析见 [PYTHON_PERFORMANCE.md](PYTHON_PERFORMANCE.md)。

## 最终效果：以同轮前后对照为依据

三种模式分别是：旧 wheel + 旧输入装载、新 API + 旧输入装载、新 API + 256 KiB
增量装载。每个引擎各 6 个独立进程，三种模式交替轮换，每种模式占据每个位置两次。
所有模式使用同轮相同页面顺序和完整 JSON 输出。

Chromium：

- 130 篇逐页中位数之和：**365.95 → 353.39 ms，下降 3.43%**。
- 整批 worker RSS 中位数：**284.36 → 147.58 MiB，下降 48.10%**。
- 整个 worker wall time：**2,195.75 → 2,173.51 ms，基本持平（-1.01%）**。
- 只替换 API、保留旧装载时，提取耗时 **354.10 ms**，RSS **288.10 MiB**。
  因而主要内存收益来自批量输入装载，而非把全部降幅归因于绑定。

Mozilla：

- 130 篇逐页中位数之和：**354.48 → 344.83 ms，下降 2.72%**。
- 整批 worker RSS 中位数：**286.16 → 149.91 MiB，下降 47.61%**。
- 整个 worker wall time：**2,140.41 → 2,139.13 ms，基本持平（-0.06%）**。
- 只替换 API 时，提取耗时 **343.85 ms**，RSS **283.40 MiB**。

小页面的固定成本更明显。`rtl-4` 的前后对照从 **88.50 → 77.46 µs**
（Chromium）和 **86.17 → 77.38 µs**（Mozilla），约下降 **10%–12%**。
不要据此承诺每篇页面均有同样收益；大页面仍由 Rust 提取主导。

这些是配对实验中的中位数描述，没有宣称微小的 wall time 差异具有统计显著性。

## 做了哪些改动

原来的公开路径经过两次 JSON 转换：Python 选项编码后在 Rust 解码，Rust
结果编码后在 Python 解码，再构造 Article；需要输出 JSON 的调用方还会编码一次。
现在公开路径为：

```text
Python 校验 + 选项字典
  → Rust 提取 typed options
  → Rust 核心（释放 GIL）
  → Python 字段 tuple
  → 原有 Article dataclass
  → 调用方按需 to_dict / JSON
```

- `extract_html` 和 `is_probably_readerable` 的选项直接传递；移除公开路径中的
  `json.dumps/json.loads` 往返。私有旧 JSON 适配器保留，供兼容性验证使用。
- 使用 PyO3 的 `PyBackedStr` 持有不可变 Python 字符串，跨 GIL 释放区间保持
  生命周期；UTF-8 检查复用其缓存，避免每次校验额外创建完整 bytes，再复制成
  Rust String。该类型的存储及线程保证见
  [PyO3 文档](https://docs.rs/pyo3/0.29.0/pyo3/pybacked/struct.PyBackedStr.html)。
- Article 仍为原来的冻结 dataclass。`to_dict()` 对实际提取产生的不可变标量
  使用直接映射；对 dataclass 子类、手动构造的可变字段仍回退 `asdict`，保持
  原来的附加字段和深复制行为。
- 基准输入协议保持不变。新的输入解码器逐个解码 `cases` 数组的值，保留同样的
  130 篇文章列表；解析窗口以 256 KiB 读取，只需容纳当前 JSON 值，不再先生成
  包含全部 HTML 的单个 Unicode 字符串。没有截短文章、提前返回或删减样本。

最后一项属于**批量基准/适配工具的输入装载优化**。公开库仍接收单篇 HTML，
没有新增批量 API，也不代表任意调用方的内存都会减半。真实应用需要采用相应的
逐篇或增量输入方式，才能避免自身先装载巨型 JSON 的成本。

## 为什么最终选 256 KiB，而不是第一版 64 KiB

64 KiB 阶段完成过整套四语言与配对实验。它降低了 RSS，但整个 worker 完成
时间增加约 **4.6%–5.5%**，反复尝试解码未完成的大 JSON 值带来额外工作。
这个阶段的结果没有丢弃。

随后对相同整批输入做独立的窗口实验，每个配置 4 个新进程，轮换执行顺序：

- 64 KiB：装载中位耗时 **220.65 ms**，峰值 RSS **102.09 MiB**。
- 256 KiB：**91.75 ms / 96.50 MiB**。
- 1 MiB：**69.11 ms / 110.95 MiB**。
- 4 MiB：**62.81 ms / 159.17 MiB**。

选定 256 KiB 后，再固定该配置重新运行完整四语言与三组对照。最终 worker
完成时间基本持平，内存约减半。这里比较的是不同实现参数，不是从重复运行中
挑选最快的一轮。`tools/benchmark-python-loader.py` 可重现窗口实验；原始
16 个样本保留在 64 KiB 阶段证据中。

最终单独的输入装载诊断中，相同 API 下旧 `json.load` 的 RSS 中位数为
**212.48 MiB**，增量装载为 **101.02 MiB**。两者均未提取正文。独立进程的
峰值不能相减解释为提取的增量分配；整批 worker RSS 也不是单篇文章的内存。

## 最终四语言复测

这是选定 256 KiB 后的新一轮数据，不与历史语言测量拼接比值。指标仍为完整
JSON 管线的 130 篇逐页中位数之和：

- Chromium：JavaScript **6,914.35 ms**，Go **294.08 ms**，Rust **311.52 ms**，
  Python **356.89 ms**。
- Mozilla：JavaScript **6,950.63 ms**，Go **281.42 ms**，Rust **300.45 ms**，
  Python **345.09 ms**。

Python 时间约为 Rust 的 **1.15 倍**、Go 的 **1.21–1.23 倍**；JavaScript
时间约为 Python 的 **19.4–20.1 倍**。这些比值只描述本轮机器、语料和串行
负载。优化收益应以上面的同轮旧/新 wheel 对照判断，不能把历史报告到本轮
所有变化都归因于代码。

独立诊断中，Rust 提取核心占 **96.96%–97.01%**。直接字段转换约 **0.20%–0.21%**，
Article 构造约 **0.08%**，剩余最终 Python JSON 编码约 **2.39%–2.41%**。
边界残差包含计时和诊断返回值的开销，不是纯 FFI 指令微基准；观察回调也给
Article 构造阶段带来少量额外成本。阶段结果用逐页均值之和，不与正式排名的
逐页中位数混算。

## 验证、方法和限制

- Python **15 项**测试通过，包括类型/值错误、None、Unicode、双引擎、并发、
  旧/新绑定全选项对照、dataclass 子类和可变字段语义、JSON 分块边界和畸形输入。
- wheel 独立安装、CLI、许可证校验、sdist 在独立目录重建再测试通过。
- Rust workspace 测试及 Clippy、Go 全模块 race/vet、JavaScript 完整 check
  （类型、项目测试、上游回归、语料比较、安装包）、**7 项浏览器测试**、
  **20 项原生清洗检查**通过。
- Go、Rust、Python 均通过 **604 项提取 + 282 项 readerability** 严格差分。
  正式采样双引擎正文签名均为 **130/130** 一致，所有详细 CLI Article 全字段一致。
- 公开 API、默认值、异常类型、Article 字段、UTF-16 length、CLI 退出码与输出文件
  保护不变。只有私有绑定和基准输入解码路径调整。没有发布到 PyPI。

正式四语言共 **464 个进程作业**，每引擎 4 轮，每页预热 2 次/记录 3 次，
每页 12 个样本；详细样例每项 40 个样本，CLI 每项 12 个新进程。
前后对照另有 **72 个作业**，每页 18 个样本，详细样例每项 60 个样本。
所有原始样本和离群值保留。提取分位数用 nearest-rank；配对实验和输入装载诊断的 RSS、wall time 中位数取排序后的中间两值均值。计时期间未并行编译、测试或另一轮性能采样。

环境为 Apple M5 / macOS arm64 / Darwin 25.5.0，Node 26.11.1、Python 3.13.13、
Go 1.27.1、Rust 1.99.1，release 构建；默认 GC/线程设置。没有固定 CPU 频率或
隔离全部后台任务。本地验证不代表所有平台已实际跑过；跨平台 CI 配置仍保留。

## 复现

先按 Python、Go、Rust 和 JavaScript 文档构建、安装并完成严格对比。保留旧 wheel，
在另一虚拟环境安装它用于对照。然后从仓库根目录执行：

```sh
PYTHON_BINARY="$PWD/python/.venv/bin/python" \
GO_BINARY=/path/to/go GOROOT=/matching/go/root \
node tools/benchmark-all.mjs --include-python \
  --output performance-reports/reproduce-optimized --seed 20261027 \
  --replicates 4 --full-iterations 3 --detail-iterations 10 --warmup 2 --cold-iterations 12
node tools/summarize-benchmark.mjs performance-reports/reproduce-optimized/raw.json performance-reports/reproduce-optimized/summary.json
python/.venv/bin/python tools/benchmark-python-paired.py \
  --before-python /path/to/old-venv/bin/python --before-worker /path/to/old-worker.py \
  --before-wheel /path/to/old.whl --output performance-reports/reproduce-optimized
python/.venv/bin/python tools/profile-python.py --output performance-reports/reproduce-optimized/profile-raw.json
python/.venv/bin/python tools/summarize-python-profile.py performance-reports/reproduce-optimized/profile-raw.json performance-reports/reproduce-optimized/profile-summary.json
python/.venv/bin/python tools/profile-python-memory.py --input performance-reports/reproduce-optimized/input-full-chromium-0.json --output performance-reports/reproduce-optimized/memory-profile.json
```

使用实际严格差分输出生成 `compatibility.json` 后，以
`tools/render-python-optimization.mjs` 生成报告，
`tools/check-python-benchmark.mjs` 验证离线页面，
`tools/package-python-optimization.py` 归档。
证据包保留旧 wheel/worker、真实测量源码和二进制哈希。测量前后检查这些哈希
未变；有未提交内容时，仅检出 Git HEAD 不足以还原本轮。

最终证据包 SHA-256：`122d851d7acbbec5549a5d675c0de741851697bb81436e48b6cb25b77bd5066a`。64 KiB 阶段包：`d580b5981fc42585ea7fc3a3af67eee95e4d2a98f1a126b3fe7d2b1eb5460841`。

离线报告已通过 Chromium 156 双引擎切换、四语言和内存行数检查，零网络请求、零页面错误。
