# 历史测量：Go 性能优化之前

以下保留 Rust 已兼容、Go 尚未进行本轮优化时的原始记录。最新结果见 [PERFORMANCE.md](PERFORMANCE.md)。

本轮在 Rust 严格差分全部通过后，于 2026-10-27 重新测量三个版本。使用与上一轮完全相同的 130 篇原始 HTML（25,719,900 字节）、来源 URL、随机种子、预热次数、重复次数和执行顺序规则。没有筛选相同输出子集，也没有修改基准 worker 或比较器。

[离线交互报告](performance/2026-10-27-rust-parity/report.html)包含两种引擎、逐页与详细样例统计、RSS 和 CLI 范围；另有 [summary.json](performance/2026-10-27-rust-parity/summary.json)、[严格差分证据](performance/2026-10-27-rust-parity/compatibility.json)及 [完整采样 evidence.zip](performance/2026-10-27-rust-parity/evidence.zip)。上一轮记录保留在 [历史说明](PERFORMANCE_BEFORE_RUST_PARITY.md)和 [旧报告](performance/2026-10-27/report.html)。

## 输出与构建验证

- Rust 与 Go 各自提取严格差分 **604/604 通过，零差异**；readerability 各自 **282/282 通过，零差异**。JavaScript 基线重新采集，未修改原始语料、参考实现或比较规则。
- 本次性能采样中，两个引擎的 Go/Rust 均 **130/130** 篇正文状态、UTF-16 长度和 UTF-8 指纹匹配 JavaScript。
- 三种尺寸、两个引擎、各 9 次实际 CLI：Go 与 Rust 各 **54/54** 份完整 Article 全字段相同。正文指纹本身不替代完整严格门禁。
- 运行结束后逐项核对 manifest，输入、锁文件、源码和二进制哈希均未发生变化；与上一轮的语料清单及除输出目录外的实验配置完全一致。

这是锁定语料上的兼容性，不是任意 HTML 输入的形式化等价证明。Rust 修复与验证细节见 [RUST_PARITY.md](RUST_PARITY.md)。最终 readerability 串行复核全部通过；此前并行复核曾有一个 `videos-2` 子进程触发原有 30 秒超时，未修改超时阈值。

## 常驻提取耗时

全语料指标是 **130 篇逐页中位数之和**，每页由 3 个独立进程各记录 3 次，共 9 次。计时包含解析、提取、默认清洗、语义清理、最终 HTML 及原生 Article JSON 序列化；不代表整批进程 wall time 或生产吞吐率。

- Chromium：JavaScript **14,162.15 ms**，Go **1,150.20 ms**，Rust **447.69 ms**。JavaScript/Go 为 **12.31×**，JavaScript/Rust 为 **31.63×**，Go/Rust 为 **2.57×**。
- Mozilla：JavaScript **10,740.30 ms**，Go **947.81 ms**，Rust **651.99 ms**。JavaScript/Go 为 **11.33×**，JavaScript/Rust 为 **16.47×**，Go/Rust 为 **1.45×**。

本轮两种引擎上 Rust 的总成本均最低，Go 次之。以上比值限于本机、本版本和该语料的串行负载。与旧测量相比，JavaScript 和未修改的 Go 也存在变化，不能把两次运行的 Rust 差值直接归因于兼容性修复。

## 峰值 RSS

同一 OS `wait4` 记录每个子进程高水位，以下为整批 worker 的 3 个进程中位数：

- Chromium：JavaScript **1,479.39 MiB**，Go **112.62 MiB**，Rust **91.14 MiB**。
- Mozilla：JavaScript **1,407.61 MiB**，Go **112.56 MiB**，Rust **79.48 MiB**。

这包括运行时、全部输入 JSON、预热、测量、GC 与分配器保留，不是单篇增量内存。完整范围在交互报告和 summary 中。Mozilla JavaScript 的范围为 **1,034.22–2,054.06 MiB**，说明内存高水位同样有轮间波动；不混用 Node heapUsed、Go 分配字节或 Rust allocator 指标。

## CLI 新进程与详细样例

以中等样例 `ehow-2`（107,092 字节）、Chromium 为例，实际 CLI 每项 9 个新进程，常驻提取每项 30 次：

- JavaScript：CLI 中位数 **429.82 ms**，范围 **387.84–549.92 ms**，峰值 RSS 中位数 **181.12 MiB**；常驻提取 p50/p95 为 **90.41/197.49 ms**。
- Go：CLI 中位数 **12.22 ms**，范围 **10.74–27.85 ms**，峰值 RSS 中位数 **10.77 MiB**；常驻提取 p50/p95 为 **8.73/10.60 ms**。
- Rust：CLI 中位数 **7.72 ms**，范围 **6.77–691.41 ms**，峰值 RSS 中位数 **4.89 MiB**；常驻提取 p50/p95 为 **3.94/5.23 ms**。

所有离群值保留，包括 Rust 该项 **691.41 ms** 的一次 CLI 样本，以及 JavaScript `parsely-metadata` 常驻提取中 **2,043.75 ms** 的一次样本（该页中位数 **12.64 ms**）。n=9 只报告中位数和范围，不将最大值标作可靠 p95。三个尺寸的所有样例与 Mozilla 数据见离线报告。

独立执行 `--version` 的启动基线，每项 9 次：JavaScript **281.65 ms / 120.53 MiB**，Go **4.91 ms / 5.86 MiB**，Rust **4.34 ms / 1.86 MiB**。

CLI 时间包含进程创建、运行时/模块初始化、同一源文件读取、提取和完整 JSON 输出到文件。“冷启动”只表示新进程；未清空磁盘缓存。不将 `--version` 和提取 CLI 的两个中位数相减当作纯提取时间。

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

解压 evidence.zip 后可离线重新运行汇总脚本，包内 `SHA256.json` 用于逐文件核验。重复输入请求 JSON 未打包，由仓库原始语料和配置重建。原始测量文件位于 `performance-reports/2026-10-27-rust-parity/`。复现保证相同输入和统计规则，不保证不同机器或系统状态得到相同数值。离线报告的两种引擎切换、9 行详细样例及兼容性说明已通过 Chromium 156 检查，零网络请求、零页面错误。

本次 evidence.zip SHA-256：`3aab53acc9ec1a568c47441f8ea14795af30371e7d06c2349f85fd0d604de329`。
