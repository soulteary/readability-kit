# Python 与 JavaScript、Go、Rust 性能对比

最新的审查修复后复测见 [PYTHON_REVIEW_PERFORMANCE.md](PYTHON_REVIEW_PERFORMANCE.md)。本页保留当时的历史数据。

后续优化及完整复测见 [PYTHON_OPTIMIZATION.md](PYTHON_OPTIMIZATION.md)。本页继续保留优化前的原始数据。

2026-10-27 在同一台 Apple M5 / macOS arm64 机器重新采样四种实现。这里的
Python 是 PyO3 绑定的 Rust 核心，不是纯 Python 移植。本轮未修改提取算法，
仅新增独立的诊断入口和基准工具；公开 API 不包含诊断计时。

[交互报告](performance/2026-10-27-python/report.html)包含双引擎切换、四语言
耗时与 RSS、三种页面大小、CLI、分阶段开销和原始采样口径。
[汇总](performance/2026-10-27-python/summary.json)、
[诊断汇总](performance/2026-10-27-python/profile-summary.json)、
[输入装载诊断](performance/2026-10-27-python/memory-profile.json)与
[完整证据及测量源码](performance/2026-10-27-python/evidence.zip)可独立下载。
旧的三语言结果保留在 [PERFORMANCE.md](PERFORMANCE.md)，不能与本轮数字拼接成比值。

## 结论

Python 的全语料常驻成本约为独立 Rust 的 **1.20–1.21 倍**、Go 的
**1.25–1.27 倍**；本轮 JavaScript 成本约为 Python 的 **19.6–20.4 倍**。
这描述的是本机、此语料、串行调用和当前输出路径，不是语言本身的速度排名。

以 130 篇文章各自中位数之和计，包含默认清洗与完整 Article JSON 输出：

- Chromium：JavaScript **7,571.88 ms**，Go **305.33 ms**，Rust **322.14 ms**，
  Python **386.79 ms**。
- Mozilla：JavaScript **7,586.41 ms**，Go **297.10 ms**，Rust **307.82 ms**，
  Python **372.23 ms**。

**不能把这约 20% 的差距全部归因于 FFI。** 独立分阶段诊断中，Rust 提取占
Python 总成本的 **94.4%–94.5%**；提取核心之外共 **5.5%–5.6%**，绑定残差
仅 **0.36%–0.38%**。不同进程中的 Rust 核心耗时受分配器、缓存、运行时状态、
动态库构建方式与采样波动影响；本实验没有进一步隔离这些因素，不能作单因果解释。
诊断的阶段均值与正式排名的逐页中位数也是不同统计量。

单页也不总是 Python 更慢：Chromium 的中等页面 `ehow-2`，Python 常驻 p50
**2.103 ms**，Rust **2.127 ms**。这不足以证明 Python 更快，反而说明不能用
两次独立运行的差值当作微小绑定成本。小页面 `rtl-4` 则分别为
**0.114 / 0.071 ms**，固定的参数和对象转换成本更显著。

## 开销分解：不是一次调用就只有 FFI

当前 Python 输出路径为：

```text
Python 校验 / HTML UTF-8 检查 / 选项 JSON
  → PyO3 参数转换
  → Rust 选项解码与校验
  → Rust 解析、提取、清洗
  → Rust Article 序列化为 JSON
  → PyO3 返回 Python 字符串
  → Python JSON 解码并构造 Article
  → Article.to_dict()
  → Python 最终 JSON 序列化
```

最后两步属于本次四语言完整 JSON 管线的计时范围。只调用 `extract_html()`、
直接读取 Article 字段的用户不承担这两步。

以 Chromium 的 130 页**分阶段均值之和**计：

- Rust 解析、提取与清洗：**371.70 ms / 94.49%**。
- Python 参数处理和选项 JSON：**1.94 ms / 0.49%**。
- Rust 选项 JSON 解码、校验：**0.26 ms / 0.07%**。
- Rust 结果 JSON：**2.25 ms / 0.57%**。
- 绑定边界残差：**1.43 ms / 0.36%**。
- Python 结果解析与 Article 构造：**5.99 ms / 1.52%**。
- `Article.to_dict()`：**0.76 ms / 0.19%**。
- 最终 Python JSON：**9.04 ms / 2.30%**。

Mozilla 的比例接近：核心 **94.40%**、边界残差 **0.38%**，最终 JSON
**2.31%**。边界残差包括传参/返回转换、派发、计时及诊断 tuple 的成本；
Python 结果解析阶段还含观察回调返回的少量工作。这些都是分阶段估计，
不是无扰动的纯 FFI 指令微基准。

固定成本对小页面更明显。Chromium `rtl-4` 的诊断均值 **104.02 µs**，其中
核心 **76.82 µs**、其余 **27.21 µs（26.2%）**；绑定残差本身仅 **1.23 µs**。
`ehow-2` 的核心外约 **5.1%**，大型页面约 **5.7%**。因此不能把一个页面的
开销比例推广到所有长度和输出大小。

## CLI 与常驻调用应分开选择

仅 `--version` 的新进程中位数（各 n=12）：

- JavaScript **211.87 ms**；Go **4.20 ms**；Rust **2.81 ms**；Python **31.55 ms**。

中等页面 `ehow-2` / Chromium 的实际 CLI 中位数：JavaScript **323.48 ms**、
Go **6.26 ms**、Rust **5.23 ms**、Python **32.95 ms**。Python 同页常驻调用
约 **2.10 ms**。高频处理适合复用 Python 进程；每篇文章启动一个 Python CLI
会显著增加时间。这里未清空系统文件缓存，所谓“冷启动”仅指新进程。
不能将两组中位数相减视为精确的解释器初始化时间。

## 内存：批量输入协议显著影响峰值

完整 130 页 worker 的 RSS 中位数：

- Chromium：JavaScript **1,595.38 MiB**，Go **113.02 MiB**，Rust **80.67 MiB**，
  Python **274.86 MiB**。
- Mozilla：JavaScript **1,572.86 MiB**，Go **113.05 MiB**，Rust **78.80 MiB**，
  Python **287.34 MiB**。

这是包含全部输入、运行时、解码、预热、GC 与分配器保留的进程高水位，
不是单篇文章或绑定本身的占用。额外每项四次独立进程诊断发现（中位数取排序后中间两项均值）：

- 仅导入相同运行时模块：RSS 中位数 **14.44 MiB**。
- 仅装载整批相同文章、不执行提取：RSS 中位数 **215.17 MiB**。
- 该批 JSON 的 UTF-8 约 **25.53 MiB**；同一内容的 Python 字符串对象约
  **101.80 MiB**，解析后各 HTML 字符串的 `sys.getsizeof` 合计约 **52.47 MiB**。
  最后一项不包括容器等对象；大输入字符串和解码结果在解析期间可能同时存在。

这些实测值支持“批量输入解码是重要来源”，但不能将独立进程的峰值相减，
推导出提取的增量内存。真实调用方不需要先拼成包含 130 篇 HTML 的巨型 JSON。
逐页或小批处理可以避免这类装载峰值，具体收益仍需按实际输入方式测量。

单篇 `ehow-2` / Chromium 的 CLI RSS：Python **19.06 MiB**，Rust
**4.88 MiB**，Go **9.03 MiB**。Python 启动基线 RSS **16.47 MiB**；这些
数字也不能相减当作单篇分配量，但能帮助区分运行时底座和整批协议的影响。

## 优化优先级

1. **先选择合适的进程和输入生命周期。** 高频任务复用进程，控制批大小。
   本轮最明显的 CLI 延迟和批量 RSS 不会仅靠改造 FFI 自动消失。
2. **如果业务只要 JSON，可评估直接 JSON 输出入口。** 避免返回 JSON 后先解码成
   Article、再转 dict、再编码 JSON。公开 API 目前未新增这个入口；其正确性、
   Unicode 及输出形式应单独验收。
3. **如果业务要 Python 对象，可评估 PyO3 直接返回结构化对象。** 本轮内部
   Rust JSON + Python 解码/Article 阶段合计约 **2.1%**，不能据此承诺回收
   全部 20% 差距：新路径仍要构造 Python 对象，也会有自己的转换成本。
4. `dataclasses.asdict` 可用直接字段映射替代，但本轮全语料约 **0.2%**，
   优先级低于处理重复序列化。小页面需要单独观察。
5. 输入 UTF-8 校验与 PyO3 String 转换也值得评估，但边界残差并非主导项。
   本轮没有线程吞吐测试，不能根据“释放 GIL”推断并发扩展效率。

本次只测量和分析，没有为获得更漂亮的数字而改动公开转换路径。

## 方法、验证和复现

使用相同 130 页、**25,719,900 字节**、来源 URL 与双引擎。4 个独立进程，
每页预热 2 次、记录 3 次，共 **12 次/页**；详细样例每进程记录 10 次，
共 **40 次/项**；CLI 和 `--version` 各 **12 个新进程/项**。样例依输入字节数
10/50/90 百分位索引选择：`rtl-4`、`ehow-2`、`schema-org-context-object`。
4 种实现使用同轮相同打乱顺序，4 轮保证各占一次执行位置；CLI 同样平衡轮换。
种子 **20261027**。保持默认 GC/线程配置，串行执行，不并行编译或测试。

正式采样共 **464 个进程作业、13,440 次计时提取**，预热另计。阶段诊断独立
运行，不加入正式排名；每个样本验证各阶段之和等于总耗时。分位数用 nearest-rank；
n=12 的 CLI 仅报告中位数与范围。JSON 的 UTF-8 大小和正文指纹在计时外计算。
各实现使用各自正常 JSON 路径，不声称是等工作量的字节编码微基准。

Node **26.11.1**、Python **3.13.13**、PyO3 **0.29.0**、Go **1.27.1**、
Rust/Cargo **1.99.1**；Apple M5、10 逻辑 CPU、32 GiB、Darwin 25.5.0。
未固定 CPU 频率或隔离所有后台任务。本机复现不保证不同硬件得到相同数值。

Go、Rust、Python 均通过完整 **604 项提取 + 282 项 readerability**；性能采样
双引擎正文签名均 **130/130** 一致，所有详细 CLI Article 全字段一致。
计时结束后核对全部 manifest 源码/二进制哈希未变，诊断使用同一 Python
扩展二进制。工作区有未提交内容，证据包提供实际测量源码与构建产物；只检出
HEAD 不能还原本轮。

从仓库根目录，先按各语言 README 完成 release 构建、Python 安装和严格验证，
再执行（必须使用项目支持的 Node 版本）：

```sh
PYTHON_BINARY="$PWD/python/.venv/bin/python" \
GO_BINARY=/path/to/go GOROOT=/matching/go/root \
node tools/benchmark-all.mjs --include-python \
  --output performance-reports/reproduce-python --seed 20261027 \
  --replicates 4 --full-iterations 3 --detail-iterations 10 --warmup 2 --cold-iterations 12
node tools/summarize-benchmark.mjs performance-reports/reproduce-python/raw.json performance-reports/reproduce-python/summary.json
python/.venv/bin/python tools/profile-python.py --output performance-reports/reproduce-python/profile-raw.json
python/.venv/bin/python tools/summarize-python-profile.py performance-reports/reproduce-python/profile-raw.json performance-reports/reproduce-python/profile-summary.json
python/.venv/bin/python tools/profile-python-memory.py --input performance-reports/reproduce-python/input-full-chromium-0.json --output performance-reports/reproduce-python/memory-profile.json
```

渲染使用 `tools/render-python-benchmark.mjs`，归档使用
`tools/package-python-benchmark.py`。完整比较报告必须来自严格比较器的真实输出，
不可手写通过标记。既有三语言驱动默认行为保留，只有显式 `--include-python`
才加入 Python；汇总脚本也仍能读取历史三语言结果。

证据包 SHA-256：`31757f5518213fdd6385f1739c54be3aa8fba7e1e52e4b853e4b9a6e0e3e22db`。离线报告已通过 Chromium 156 双引擎切换、四语言行数、诊断区块、零网络请求和零页面错误检查。
