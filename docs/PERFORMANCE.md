# Go、Rust 与 JavaScript 性能对比

2026-10-27 完成第二轮 Go 优化。与上一轮相同的 130 篇原始 HTML（25,719,900 字节）、URL、随机种子、预热、重复次数和执行顺序规则；JavaScript、Rust、严格比较器、正式驱动及 worker 代码未改。原有 GC/线程配置保留，没有筛选相同输出子集或剔除离群值。

[最终离线报告](performance/2026-10-27-go-memory-final/report.html)新增 Go 分配与 CLI 内存前后对照，并保留三语言耗时、整批 RSS、详细样例和冷启动。另有 [summary.json](performance/2026-10-27-go-memory-final/summary.json)、[分配对照](performance/2026-10-27-go-memory-final/allocations.json)、[严格差分证据](performance/2026-10-27-go-memory-final/compatibility.json)、[原始采样 evidence.zip](performance/2026-10-27-go-memory-final/evidence.zip)及 [三阶段 Go 源码与诊断](performance/2026-10-27-go-memory-final/go-sources.zip)。实现说明见 [GO_MEMORY_OPTIMIZATION.md](GO_MEMORY_OPTIMIZATION.md)。

## 严格验证与实验边界

- 最终 Go 与 Rust 均通过提取 **604/604**、readerability **282/282**，零差异。JavaScript 参考源文件哈希与基线一致，比较规则及原语料未改。
- 正式性能采样中，两个引擎的 Go/Rust 都是 **130/130** 篇正文签名相同；Go/Rust 各 **54/54** 份详细样例 CLI 完整 Article 全字段相同。文本签名本身不替代完整严格门禁。
- Go 完整 `go test -race ./...`、vet、gofmt 检查通过；20 项实际 Chromium 清洗/执行对照通过。ASCII 匹配快路另与原正则做 30,000 组输入对照，非 ASCII 回退原实现。
- 结束后核对所有 manifest 文件，测量期间运行时代码、二进制和锁文件未变。显示层的内存对照在测量后添加，未修改计时、原始样本或 worker；其后处理源码已归档，重建 HTML 字节一致。

锁定语料通过不等于任意 HTML 的形式化等价，Rust 验收范围见 [RUST_PARITY.md](RUST_PARITY.md)。

## 常驻提取耗时

指标为 **130 篇逐页中位数之和**，每页由 3 个独立进程各记录 3 次，共 9 次。包括解析、提取、默认清洗、语义清理、最终 HTML 和原生 Article JSON 序列化；不是整个进程 wall time，也不是生产吞吐率。

- Chromium：JavaScript **11,695.70 ms**，Go **356.95 ms**，Rust **420.88 ms**。Go/Rust **0.85×**。
- Mozilla：JavaScript **10,096.96 ms**，Go **422.01 ms**，Rust **541.27 ms**。Go/Rust **0.78×**。

与 [本轮优化前](PERFORMANCE_BEFORE_GO_MEMORY.md)对照：

- Chromium：Go **691.90 → 356.95 ms**；Go/Rust **1.51 → 0.85**。
- Mozilla：Go **655.20 → 422.01 ms**；Go/Rust **1.20 → 0.78**。

本轮 Go 的全语料总成本低于 Rust，但不能外推每页或 CLI：分别有 100/130、110/130 页的中位耗时低于 Rust；中等样例和启动基线仍有 Rust 更快的情况。跨轮 JavaScript/Rust 也在波动，历史下降不能全部归因代码；当前比值只描述本机该语料的串行负载。

## 内存：分配流量与 RSS 分开看

额外 Go 诊断使用同一三个尺寸、两个引擎和 URL，计量公开提取＋原生 JSON 序列化；每项预热 2 次、计量 30 次，3 份 testing.B 报告取 B/op 中位数。单次分配量下降 **36.7%–44.4%**：中等样例 Chromium **2,116,278 → 1,263,021 B/op**，大型 Chromium **5,710,325 → 3,611,928 B/op**。这是累计分配流量，不能解释为峰值 RSS 下降同样比例。

整批 worker OS `wait4` 高水位，3 个进程中位数：

- Chromium：JavaScript **1,412.19 MiB**，Go **113.28 MiB**，Rust **90.92 MiB**。Go 上轮为 **112.52 MiB**。
- Mozilla：JavaScript **1,455.50 MiB**，Go **112.58 MiB**，Rust **80.75 MiB**。Go 上轮为 **112.42 MiB**。

**整批 Go RSS 未下降**。它包含全部输入、运行时、初始化、预热、GC 与分配器保留，不是单篇增量内存。仅加载整批输入的单进程诊断也有较高 RSS；不能与完整 worker 相减推导单篇占用。

中等样例 CLI RSS：Chromium **10.30 → 8.94 MiB**，Mozilla **10.19 → 8.95 MiB**；大型样例也下降。小样例 CLI 则由约 **6.6 → 7.1–7.2 MiB**，`--version` RSS 由 **5.94 → 6.45 MiB**，有所增加。完整六组前后数据均在报告中，不只展示改善项。主要收益是减少请求内分配、降低中大型样例 CLI 内存和提取耗时；仍有静态初始化与整批内存成本。

## CLI 冷启动与详细样例

中等 `ehow-2`（107,092 字节）、Chromium，CLI 每项 9 个新进程、常驻每项 30 次：

- JavaScript：CLI 中位数 **446.00 ms**，范围 **373.68–555.04 ms**，峰值 RSS 中位数 **181.23 MiB**；常驻提取 p50/p95 **57.92/74.86 ms**。
- Go：CLI 中位数 **8.25 ms**，范围 **6.86–754.19 ms**，峰值 RSS 中位数 **8.94 MiB**；常驻提取 p50/p95 **3.05/3.70 ms**。
- Rust：CLI 中位数 **7.38 ms**，范围 **6.03–11.86 ms**，峰值 RSS 中位数 **4.86 MiB**；常驻提取 p50/p95 **2.29/3.68 ms**。

所有离群值保留，包括 Go 该项首次 CLI 的 **754.19 ms**。n=9 只报告中位数和范围，不给不可靠 p95。

独立 `--version` 基线（每项 n=9）：JavaScript **264.95 ms / 120.56 MiB**，Go **4.87 ms / 6.45 MiB**，Rust **3.71 ms / 1.86 MiB**。CLI 提取包括进程创建、初始化、读取、提取和 JSON 输出；未清空磁盘缓存。“冷启动”表示新进程，不将两个中位数相减作为纯提取耗时。

## 为什么运行两轮正式实验

第一阶段内存改动通过门禁后，正式测得 Go/Rust 比值 **1.517/1.361**，未优于旧 **1.506/1.196**，因此继续优化 ASCII 匹配和重复正文长度计算。第一阶段的 [报告](performance/2026-10-27-go-memory/report.html)与 [原始证据](performance/2026-10-27-go-memory/evidence.zip)完整保留；两阶段源码分别归档，不与最终结果混用。每轮都是原协议 261 个作业，未改变重复次数或选择最快轮次。

## 环境与实验安排

Apple M5，10 逻辑 CPU，32 GiB，macOS arm64 / Darwin 25.5.0；Node 26.11.1、Go 1.27.1、Rust/Cargo 1.99.1、Python 3.13.13。AC 电源，未固定 CPU 频率或隔离系统后台任务。native release 构建，默认 GC/线程配置；编译和测试在计时前完成，无并行提取、编译或测试。

最终轮共 **261 个进程作业**：72 个常驻 worker、162 个实际提取 CLI、27 个 `--version` 进程。常驻共 **7,560 次计时提取**，另有 **4,788 次预热**。

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

解压 evidence.zip 后可离线重新运行汇总脚本，包内 `SHA256.json` 用于逐文件核验。重复输入请求 JSON 未打包，由仓库原始语料和配置重建。原始测量文件位于 `performance-reports/2026-10-27-go-memory-final/`。复现保证相同输入和统计规则，不保证不同机器或系统状态得到相同数值。离线报告的两种引擎切换、9 行详细样例及兼容性说明已通过 Chromium 156 检查，零网络请求、零页面错误。

本次 evidence.zip SHA-256：`055e5fa0e5f9dcac4d645310f528476ec82a0b475a7e4eea53d167694e7f6486`。


## 分配诊断、源码与显示层复现

`go-sources.zip` 包含 before-memory、memory-stage1、final 三份完整 Go 模块源码、逐文件 SHA-256、附加诊断源文件、go.mod/go.sum、原始 testing.B 输出及输入加载进程规格。Go 源码包 SHA-256：`94c0bb8fe05e404cb4c706db392fecff9fab5cfdab353d861c6bd8a105179e32`。

解压后分别在 allocations/before 与 allocations/after 中，将 go.mod 的 replace 路径调整为解压的 before-memory/go 与 final/go，并设置原仓库语料路径：

```sh
READABILITY_CORPUS_ROOT=/path/to/readability-kit go test -mod=mod -run '^$' -bench . -benchmem -benchtime=30x -count=3
```

附加诊断的 ns 数据保留供审计，但不混入正式三语言计时。输入加载诊断只有一次，不作稳定下界或语言间比较。

evidence.zip 另含 `allocations.json`、`previous-summary.json` 与测量后显示增强脚本；先按上文渲染基础报告，再执行以下命令可得到相同的内存对照区：

```sh
node augment-memory.mjs report.html allocations.json summary.json previous-summary.json
```

旧结果、源码和原始采样全部保留；复现相同输入和统计规则，不保证不同机器或系统状态得到同样数值。
