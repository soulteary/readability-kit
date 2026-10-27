# 历史测量：修复 Rust 兼容性之前

以下为原始测量记录，Rust 当时尚有 420 项严格差异。最新等价语料测量见 [PERFORMANCE.md](PERFORMANCE.md)。

本次测量完成于 2026-10-27，使用同一份 130 篇上游 HTML（25,719,900 字节），分别测试 Chromium 和 Mozilla 模式。交互图表、逐样例 p50/p95、RSS、CLI 范围和输出核对位于 [离线报告](performance/2026-10-27/report.html)，完整统计为 [summary.json](performance/2026-10-27/summary.json)，原始采样及 stdout 可下载 [evidence.zip](performance/2026-10-27/evidence.zip)。

环境：Apple M5，10 逻辑 CPU，32 GiB 内存，macOS arm64 / Darwin 25.5.0；Node 26.11.1、Go 1.27.1、Rust/Cargo 1.99.1、Python 3.13.13。测量时接入 AC 电源；未固定 CPU 频率或隔离操作系统后台任务。使用 native release 构建和运行时默认 GC/线程设置，所有提取串行执行，编译和测试在计时前完成。

## 主要结果

这里的全语料成本是 **130 篇逐页中位数之和**，每页 3 个独立进程 × 3 次记录，共 9 次，不是整个进程 wall time，也不是生产吞吐率。计时包含 HTML 解析、提取、默认清洗、语义清理、最终 HTML 和 Article JSON 序列化。

- Chromium：JavaScript **10,822.08 ms**，Go **1,138.93 ms**，Rust **458.05 ms**。JavaScript/Go 耗时比 **9.50×**。
- Mozilla：JavaScript **11,215.81 ms**，Go **953.09 ms**，Rust **397.12 ms**。JavaScript/Go 耗时比 **11.77×**。

Rust 在本次测量中更快，但最新完整严格对照仍有 **420/604** 项不同。性能样本中，Chromium 的 **94/130** 篇、Mozilla 的 **93/130** 篇正文状态/长度/指纹与 JavaScript 不同。它们代表当前 Rust 行为的成本，不能直接作为等价替代的加速收益。

Go 两种引擎均 **130/130** 正文状态、UTF-16 长度和 UTF-8 指纹匹配；此前完整提取严格门禁 **604/604** 通过。本次三个尺寸、两个引擎的 **54** 份 Go CLI Article 全字段比较也无差异。Rust 这 54 份中 **36** 份存在 HTML、正文或长度差异；小样例 `rtl-4` 的完整输出相同。

## 完整输出相同的 Rust 子集

按最新严格报告筛选，两种引擎均有 **27/130** 篇上游页面的完整 Article 与 JavaScript 相同。对这些页面直接聚合既有 9 次样本的逐页中位数，不重新计时：

- Chromium：JavaScript **439.13 ms**，Go **18.95 ms**，Rust **12.40 ms**。
- Mozilla：JavaScript **526.09 ms**，Go **15.99 ms**，Rust **10.95 ms**。

这是结果确定后的子集，输入总计仅 327,882 字节，占完整语料字节 **1.27%**，页面中位数 **1,725 字节**，远小于完整语料的 107,092 字节，存在明显选择偏差。它可以展示这批相同输出上的当前实现成本，不能外推为全语料 Rust 加速比；也不能从整批 worker 高水位推导该子集 RSS。复现聚合使用 `scripts/benchmark-matched-subset.mjs`，结果位于 [matched-subset.json](performance/2026-10-27/matched-subset.json)。

## 内存与 CLI 冷启动

RSS 使用相同的 OS `wait4` 子进程高水位，不混用 Node heapUsed、Go 分配字节或 Rust allocator 数值。

Chromium 整批 worker 的峰值 RSS 中位数（3 个独立进程）：JavaScript **1,481.34 MiB**，Go **112.25 MiB**，Rust **94.61 MiB**。Mozilla 对应 **1,341.23 / 112.39 / 96.03 MiB**。这包含运行时、全部输入 JSON、预热、测量、GC 与分配器保留，不是单篇增量内存。

以中等样例 `ehow-2`（107,092 字节）、Chromium 为例，每项 9 个实际 CLI 新进程：

- JavaScript：耗时中位数 **495.13 ms**，峰值 RSS 中位数 **180.97 MiB**。
- Go：耗时中位数 **12.10 ms**，峰值 RSS 中位数 **10.72 MiB**。
- Rust：耗时中位数 **9.11 ms**，峰值 RSS 中位数 **5.53 MiB**；该样例输出不兼容。

这些时间包括进程创建、运行时/模块初始化、同一文件读取、提取和完整 JSON 输出到文件。文件缓存未清空，因此“冷启动”仅表示新进程，不能解释为冷磁盘缓存。

独立执行 `--version` 的启动基线中位数（每项 9 次）：JavaScript **349.43 ms**，Go **6.34 ms**，Rust **4.94 ms**；RSS 分别为 **120.38 / 5.84 / 2.09 MiB**。此项不提取正文，也不将其与 CLI 中位数相减当成纯提取时间。

所有离群值保留。比如 Mozilla 小样例 Go CLI 的范围为 **5.20–212.10 ms**，中位数为 **7.21 ms**；JavaScript 中等样例 Chromium CLI 范围为 **402.17–1,458.37 ms**。这表明本地进程调度有噪声，报告不把 n=9 的最大值当成可靠 p95。详细常驻样例 n=30，才展示最近秩 p95。

## 实验安排

共运行 **261 个进程作业**：72 个常驻 worker、162 个实际提取 CLI、27 个 `--version` 进程。常驻共 **7,560 次记录提取**，另有 **4,788 次预热**。

- 全语料每页每进程预热 2 次，再记录 3 次，3 个独立进程。语料顺序按种子打乱，同一轮三种实现使用相同顺序；语言顺序为 Latin 轮换。
- 按源 HTML 字节数排序，以 `floor((130 - 1) * q)` 选择 q=0.1/0.5/0.9：`rtl-4` 1,214 字节、`ehow-2` 107,092 字节、`schema-org-context-object` 459,526 字节。每项预热 2 次、记录 10 次，3 个独立进程，共 30 个样本。
- CLI 每项 9 次，轮换语言顺序；9 轮执行位置近似平衡。计时使用 Python `perf_counter_ns` 从创建子进程前到退出，RSS 来自同一子进程。
- 不强制 GC。JavaScript 在计时外让出事件循环完成排队的 jsdom 清理；这些间隙包含在进程 wall time 和 RSS 中，但不包含在单次同步 API 计时内。
- JSON 序列化采用各自原生 API。JS `JSON.stringify` 生成 UTF-16 字符串，其 UTF-8 字节数计算在计时外；Go/Rust 直接生成 UTF-8 字节。这是应用管线成本对比，不是相同 UTF-8 指令级序列化微基准。

完整合同见 [BENCHMARK_METHOD.md](BENCHMARK_METHOD.md)。基准 worker 校验样本数、输出稳定性、正文指纹、进程退出码及 RSS，汇总脚本还验证 full/detail 一致、CLI stdout 哈希与全 Article 字段。整个过程中没有并行提取或并行构建。

## 复现

在保留本次源码的工作区中，使用支持版本的 Node 和 Go/Rust 工具链：

```sh
bun install --frozen-lockfile
bun run build
cargo build --offline --release -p readability-cli --bins
cd go
CGO_ENABLED=0 go build -trimpath -o ../go-dist/readability-kit ./cmd/readability-kit
CGO_ENABLED=0 go build -trimpath -o ../go-dist/readability-kit-bench ./cmd/readability-kit-bench
cd ..
node scripts/benchmark-all.mjs --output performance-reports/reproduce --seed 20261027 --replicates 3 --full-iterations 3 --detail-iterations 10 --warmup 2 --cold-iterations 9
node scripts/summarize-benchmark.mjs performance-reports/reproduce/raw.json performance-reports/reproduce/summary.json
node scripts/rust-compatibility.mjs capture --output performance-reports/reproduce/javascript.json
# The next command currently exits 1 because Rust still has differences. Continue with the read-only aggregations.
node scripts/rust-compatibility.mjs run --baseline performance-reports/reproduce/javascript.json --command ./target/release/readability-kit-compat --output performance-reports/reproduce/rust-compatibility.json
node scripts/benchmark-matched-subset.mjs performance-reports/reproduce/summary.json performance-reports/reproduce/rust-compatibility.json performance-reports/reproduce/matched-subset.json
node scripts/render-benchmark.mjs performance-reports/reproduce/summary.json performance-reports/reproduce/report.html performance-reports/reproduce/matched-subset.json
python3 scripts/package-benchmark.py performance-reports/reproduce performance-reports/reproduce/evidence.zip
```

`cargo --offline` 需要预先缓存锁定依赖；首次构建可去掉 `--offline` 并加 `--locked`。`GO_BINARY` 可为 runner 指定 Go 路径，构建时同时设置对应 GOROOT。本次实际使用 `/opt/homebrew/opt/go/libexec/bin/go`，Node 为 `/opt/homebrew/Cellar/node/26.11.1/bin/node`。采集脚本支持 macOS/Linux 的 wait4；本次未在 Linux 或 Windows 上测量。

输出目录中的 `manifest.json` 记录源码、输入、锁文件、二进制 SHA-256、实际命令、Git HEAD 和未提交状态；`raw.json` 保留每个计时样本、RSS、执行顺序和正文指纹；`jobs/` 保留所有 stdout/stderr/进程规格。当前工作区包含未提交代码，因此仅检出 manifest 中的 HEAD 不能重建这些源码；应保留本次源码并核对文件哈希。

解压 evidence.zip 后，可在仓库根目录对解压的 raw.json 重新运行汇总脚本，无需重新提取。包内 SHA256.json 可核验原始文件；重复的输入请求 JSON 未打包，由仓库原始语料和记录的配置重新生成。原始测量文件位于 `performance-reports/2026-10-27/`。

复现的目标是相同输入、构建、范围和统计规则；不同机器或系统状态下不保证得到相同耗时。离线报告的两种引擎切换、图表及 9 行详细样本表已通过 Chromium 检查，没有网络请求或页面错误。
