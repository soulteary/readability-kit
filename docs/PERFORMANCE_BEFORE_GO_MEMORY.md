# 历史测量：Go 第二轮内存优化之前

本页保留首轮 Go 耗时优化完成后的测量。最新结果见 [PERFORMANCE.md](PERFORMANCE.md)。

本轮在优化 Go 并通过全部严格差分后，于 2026-10-27 重新测量三个版本。与上一轮 Rust 已兼容的测量相比，130 篇原始 HTML（25,719,900 字节）、来源 URL、随机种子、预热、重复次数和执行顺序规则均完全相同；JavaScript、Rust、共享驱动及 worker 代码哈希不变，仅修改 Go 实现和相关测试。没有修改比较规则或筛选相同输出子集。

[离线交互报告](performance/2026-10-27-go-optimized/report.html)包含两种引擎、逐页与详细样例统计、RSS 和 CLI 范围；另有 [summary.json](performance/2026-10-27-go-optimized/summary.json)、[严格差分证据](performance/2026-10-27-go-optimized/compatibility.json)、[完整采样 evidence.zip](performance/2026-10-27-go-optimized/evidence.zip)及 [优化前后 Go 源码快照](performance/2026-10-27-go-optimized/go-sources.zip)。实现细节见 [GO_OPTIMIZATION.md](GO_OPTIMIZATION.md)。

## 输出与构建验证

- Go 与 Rust 均重新通过提取严格差分 **604/604**、readerability **282/282**，全部零差异。JavaScript 参考源文件与已采集基线哈希一致。
- 性能采样中，两个引擎的 Go/Rust 均 **130/130** 篇正文状态、UTF-16 长度和 UTF-8 指纹匹配 JavaScript。
- 三种尺寸、两个引擎、各 9 次 CLI：Go 与 Rust 各 **54/54** 份完整 Article 全字段相同。正文指纹本身不替代完整严格门禁。
- Go 全模块 `go test -race ./...`、`go vet ./...`、gofmt 检查通过；20 项真实 Chromium 清洗/执行对照通过，策略表及正则规则未变。
- 结束后逐项核对 manifest，测量期间运行时代码、锁文件及二进制哈希未变；与上一轮的语料清单和除输出目录外的全部配置一致。

这是锁定语料上的兼容性，不是任意 HTML 的形式化等价证明。Rust 兼容性修复及验证见 [RUST_PARITY.md](RUST_PARITY.md)。

## 常驻提取耗时

全语料指标是 **130 篇逐页中位数之和**，每页由 3 个独立进程各记录 3 次，共 9 次。包含解析、提取、默认清洗、语义清理、最终 HTML 及原生 Article JSON 序列化；不代表整批进程 wall time 或生产吞吐率。

- Chromium：JavaScript **9,650.55 ms**，Go **691.90 ms**，Rust **459.36 ms**。JavaScript/Go 为 **13.95×**；Go/Rust 为 **1.51×**。
- Mozilla：JavaScript **9,753.99 ms**，Go **655.20 ms**，Rust **547.70 ms**。JavaScript/Go 为 **14.89×**；Go/Rust 为 **1.20×**。

与 [Go 优化前的测量](PERFORMANCE_BEFORE_GO_OPTIMIZATION.md)对照：

- Chromium：Go **1,150.20 → 691.90 ms**，观察到的降幅 **39.8%**；Go/Rust 耗时比 **2.57 → 1.51**。
- Mozilla：Go **947.81 → 655.20 ms**，观察到的降幅 **30.9%**；Go/Rust 耗时比 **1.45 → 1.20**。

本轮 Go 与 Rust 的全语料耗时差距缩小，但 Rust 的总成本仍最低。跨轮降幅是两次实验的观察值，不是隔离其他影响后的纯优化因果估计：未改动的 JavaScript 和 Rust 也有波动，操作系统调度、频率和运行状态未被固定。耗时比限于该机器、版本及串行语料负载，不能外推所有页面或并发场景。

## 峰值 RSS

相同 OS `wait4` 记录子进程高水位，以下为整批 worker 的 3 个进程中位数：

- Chromium：JavaScript **1,555.62 MiB**，Go **112.52 MiB**，Rust **91.22 MiB**。
- Mozilla：JavaScript **1,296.31 MiB**，Go **112.42 MiB**，Rust **79.14 MiB**。

Go 整批 RSS 与上一轮约 112 MiB 基本相同，本轮主要收益是提取耗时，不能宣称常驻内存明显下降。该指标包含运行时、全部输入 JSON、预热、GC 与分配器保留，不是单篇增量内存或分配字节数。完整范围见报告，不混用 Node heapUsed、Go 分配量和 Rust allocator 指标。

## CLI 新进程与详细样例

以中等样例 `ehow-2`（107,092 字节）、Chromium 为例，实际 CLI 每项 9 个新进程，常驻提取每项 30 次：

- JavaScript：CLI 中位数 **388.06 ms**，范围 **364.38–561.99 ms**，峰值 RSS 中位数 **180.86 MiB**；常驻提取 p50/p95 为 **52.02/66.81 ms**。
- Go：CLI 中位数 **10.22 ms**，范围 **8.62–721.06 ms**，峰值 RSS 中位数 **10.30 MiB**；常驻提取 p50/p95 为 **4.64/5.60 ms**。
- Rust：CLI 中位数 **7.36 ms**，范围 **6.19–11.96 ms**，峰值 RSS 中位数 **4.94 MiB**；常驻提取 p50/p95 为 **2.21/2.84 ms**。

所有离群值保留，包括 Go 该项 **721.06 ms** 的首次 CLI 样本。n=9 仅报告中位数和范围，不将最大值当作可靠 p95。三种尺寸与 Mozilla 完整结果见交互报告。

独立 `--version` 启动基线，每项 9 次：JavaScript **280.47 ms / 120.30 MiB**，Go **4.64 ms / 5.94 MiB**，Rust **3.65 ms / 1.86 MiB**。

CLI 时间包含进程创建、运行时/模块初始化、文件读取、提取和完整 JSON 输出。“冷启动”仅表示新进程，未清空磁盘缓存；不将启动基线与 CLI 两个中位数相减作为纯提取时间。

## 环境与实验安排

Apple M5，10 逻辑 CPU，32 GiB，macOS arm64 / Darwin 25.5.0；Node 26.11.1、Go 1.27.1、Rust/Cargo 1.99.1、Python 3.13.13。AC 电源，未固定 CPU 频率或隔离系统后台任务。native release 构建，默认 GC/线程配置；编译和测试在计时前完成，无并行提取、编译或测试。

共 **261 个进程作业**：72 个常驻 worker、162 个实际提取 CLI、27 个 `--version` 进程。常驻共 **7,560 次计时提取**，另有 **4,788 次预热**。

- 全语料每页每进程预热 2 次、记录 3 次，共 3 个独立进程。种子 `20261027`；同一轮三种实现使用相同打乱顺序，语言顺序按 Latin 轮换。
- 按输入字节数排序，以 `floor((130 - 1) * q)` 选择 q=0.1/0.5/0.9：`rtl-4` 1,214 字节、`ehow-2` 107,092 字节、`schema-org-context-object` 459,526 字节。每项预热 2 次、记录 10 次，3 个独立进程，共 30 次。
- CLI 每项 9 次，轮换语言顺序且执行位置近似平衡。Python `perf_counter_ns` 计量创建子进程前至退出，RSS 为同一子进程高水位。
- 不强制 GC；JavaScript 在单次计时外让出事件循环以完成 jsdom 排队清理，这部分仍包含在 worker wall time 和 RSS 中。
- JS `JSON.stringify` 生成 UTF-16 字符串，UTF-8 字节数在计时外计算；Go/Rust 生成 UTF-8 JSON 字节。比较的是应用管线成本，不是相同字节输出的指令级序列化微基准。

完整合同见 [BENCHMARK_METHOD.md](BENCHMARK_METHOD.md)。所有采样均保留，汇总校验样本数、full/detail 一致、正文稳定性、CLI stdout 哈希及完整 Article 字段。

## 复现

```sh
set -e
bun install --frozen-lockfile
bun run build
cargo build --release --workspace --locked
cd go
CGO_ENABLED=0 go build -trimpath -o ../go-dist/readability-kit ./cmd/readability-kit
CGO_ENABLED=0 go build -trimpath -o ../go-dist/readability-kit-bench ./cmd/readability-kit-bench
CGO_ENABLED=0 go build -trimpath -o ../go-dist/readability-kit-compat ./cmd/readability-kit-compat
cd ..
mkdir -p performance-reports/reproduce
node scripts/rust-compatibility.mjs capture --output performance-reports/reproduce/javascript.json
node scripts/rust-compatibility.mjs capture-readerable --output performance-reports/reproduce/readerable-javascript.json
node scripts/rust-compatibility.mjs run --baseline performance-reports/reproduce/javascript.json --command ./target/release/readability-kit-compat --output performance-reports/reproduce/rust-extraction.json
node scripts/rust-compatibility.mjs run --baseline performance-reports/reproduce/javascript.json --command ./go-dist/readability-kit-compat --output performance-reports/reproduce/go-extraction.json
node scripts/rust-compatibility.mjs run --baseline performance-reports/reproduce/readerable-javascript.json --command ./target/release/readability-kit-compat --output performance-reports/reproduce/rust-readerability.json
node scripts/rust-compatibility.mjs run --baseline performance-reports/reproduce/readerable-javascript.json --command ./go-dist/readability-kit-compat --output performance-reports/reproduce/go-readerability.json
# Continue only after every gate passes; keep extraction and builds serial.
node scripts/benchmark-all.mjs --output performance-reports/reproduce --seed 20261027 --replicates 3 --full-iterations 3 --detail-iterations 10 --warmup 2 --cold-iterations 9
node scripts/summarize-benchmark.mjs performance-reports/reproduce/raw.json performance-reports/reproduce/summary.json
```

用差分结果生成报告所需的兼容性文件（不能直接把手写通过标记当成差分证据）：

```sh
node --input-type=module <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
const p='performance-reports/reproduce/';
const names=['go','rust'];
const reports=Object.fromEntries(names.map(k=>[k,JSON.parse(readFileSync(p+k+'-extraction.json','utf8'))]));
const result={schema:1,reports};
for (const k of names) {
 const r=reports[k];
 if (!r.passed || r.differences.length) throw new Error(k+' strict gate failed');
 result[k]={passed:r.passed,compared:r.compared,differences:r.differences.length};
}
writeFileSync(p+'rust-compatibility.json',JSON.stringify(result,null,2)+'\n');
JS
node scripts/render-benchmark.mjs performance-reports/reproduce/summary.json performance-reports/reproduce/report.html - performance-reports/reproduce/rust-compatibility.json
python3 scripts/package-benchmark.py performance-reports/reproduce performance-reports/reproduce/evidence.zip
```

首次 Cargo 构建需缓存锁定依赖；已有缓存时可加 `--offline`。本机显式设置与 Go 二进制一致的 `GOROOT`，并用 `GO_BINARY=/opt/homebrew/opt/go/libexec/bin/go` 指定 runner 的 Go；Node 实际为 `/opt/homebrew/Cellar/node/26.11.1/bin/node`。RSS runner 支持 macOS/Linux，本次仅实测 macOS。

`manifest.json` 记录完整语料、源码、锁文件、二进制 SHA-256、运行环境、Git HEAD 与未提交状态；`raw.json` 保留样本、RSS、顺序及正文指纹；`jobs/` 保留 stdout/stderr 和进程规格。工作区含未提交代码，仅检出 HEAD 不足以重建本次源码，需保留源文件并核对哈希。

解压 evidence.zip 后可离线重新运行汇总脚本，包内 `SHA256.json` 用于逐文件核验。重复输入请求 JSON 未打包，由仓库原始语料和配置重建。原始测量文件位于 `performance-reports/2026-10-27-go-optimized/`。复现保证相同输入和统计规则，不保证不同机器或系统状态得到相同数值。离线报告的两种引擎切换、9 行详细样例及兼容性说明已通过 Chromium 156 检查，零网络请求、零页面错误。

本次 evidence.zip SHA-256：`696e7e17a63749990722509937144752cca0f01ba4e49c9fcd4e5e42384731e4`。


Go 源码快照包 SHA-256：`36d1491e1763dfe812b5b0be1d06f8589b9bf40be72e1f441ea782b4705056c3`。包内 before/after 均含完整 Go 模块源码和逐文件哈希，可在同一仓库副本中重建；上游语料仍使用仓库原件。两次兼容版本的历史原始数据均保留： [Go 优化前](performance/2026-10-27-rust-parity/report.html)、[Rust 修复前](performance/2026-10-27/report.html)。
