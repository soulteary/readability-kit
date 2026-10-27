# Rust WASM 实现与验证

后续优化及当前前后对比见 [WASM_OPTIMIZATION.md](WASM_OPTIMIZATION.md)；下方实测数据保留为初版历史结果。

WASM 使用现有 `readability-core`，提供独立 ESM 包
`@soulteary/readability-kit-wasm`。源码和构建流程已加入仓库，本次未发布到 npm。
使用说明见 [packages/wasm/README.md](../packages/wasm/README.md)。

## 接口和实现

- `await init(input?)`：初始化当前 JS realm 的 WASM；并发初始化共享首个输入，失败后可重试。
- `extractHTML(html, options)`：沿用现有 HTML 提取接口、选项和 `Article | null` 结构；默认清洗。
- `isProbablyReaderable(html, options?)`：采用相同选项和布尔结果，输入改为 HTML 字符串。
- `await createWorkerReader(options?)`：创建并初始化专属 module Worker，返回上述操作的异步版本以及 `terminate()`。

Rust CLI 和 WASM 共用 `readability-core::boundary` 的 JSON 解码、校验及错误信息。
JS facade 复用原有 `packages/shared/src/validation.ts` 和公开类型，在 JSON/structured clone 前校验
JavaScript 特有的 NaN、Infinity 等值，并排除未知选项，避免循环引用等未知字段影响调用。
WASM 与 JS 之间通过 UTF-8 字符串和 JSON 传输；性能数字包含这些转换成本。

Worker 按顺序执行请求，并通过 ID 匹配响应。初始化及请求默认超时 30 秒，包含排队时间。
超时、Worker 加载失败和显式终止会拒绝所有待处理请求并结束 Worker；再次使用需新建实例。
不提供单次提取的抢占式取消。

WASM 字符串接口不依赖 DOM，不执行 HTML 内脚本或加载其中资源，也不能直接观察 Shadow DOM。
`flattenShadowRoots` 保留选项兼容性；需要此功能时应在宿主中先展开再序列化。
UTF-8 边界会将 JS 孤立 UTF-16 代理项替换为 replacement character，正文长度仍按 UTF-16 计算。

## 验证范围

完整测试从真实 `npm pack` 归档解包并通过 HTTP 加载，不直接使用工作区 JS 入口。
JavaScript 参考结果由现有 `tools/compatibility.mjs` 和原有语料生成，严格比较结果状态、
完整 Article 字段、HTML、空白、缺失字段、null 和错误消息，不进行宽松归一化。

每个环境的 604 个提取用例包含 302 个公开 API 用例和 302 个原始引擎用例。
原始引擎仅通过内部绑定和专用测试 Worker 验证；公开提取、readerability 测试使用实际发布的
JS facade 和 Worker client。原始未清洗接口不属于应用层公开 API。

JS 边界测试覆盖非字符串输入、NaN/Infinity、未知循环引用及 BigInt 字段、初始化失败重试、
初始化前调用、Worker 模块初始化失败、超时、并发响应匹配、终止时待处理请求以及终止后调用。
清洗检查复用 `tools/check-rust-sanitizer.mjs`：WASM 产生输出，在真实 Chromium 中重解析和
检查执行行为，并与现有 DOMPurify 策略 oracle 对照，包含负对照。

语料通过不等于任意 HTML 的形式化等价，也不证明清洗器在所有输入下都正确。

## 复现

```sh
bun install --frozen-lockfile
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.117 --locked
bun run build
bun run build:wasm
bunx playwright install chromium firefox webkit
WASM_EXTRA_BROWSERS=1 bun run test:wasm
READABILITY_WASM=1 node tools/check-rust-sanitizer.mjs
```

`WASM_BINDGEN` 可指定绑定生成器路径，`PYTHON` 可指定 Python 3。
默认测试每次重建 JS 参考结果；开发时可用 `WASM_REUSE_BASELINES=1` 复用同一个报告目录下的
参考文件，脚本仍逐项验证参考源码哈希和每个 HTML 的 SHA-256，陈旧参考会失败。
`WASM_REPORT_DIR` 可调整输出位置，`READABILITY_TEST_CHROMIUM` 可选择 Chromium 可执行文件。
额外浏览器 smoke 验证由 `WASM_EXTRA_BROWSERS=1` 开启，CI 同时启用 Firefox 和 WebKit。

生成文件和临时报表不进入版本控制。归档的测量报告包含环境、每次原始计时、兼容性摘要、
资源哈希、源码哈希、JS 参考来源以及 npm integrity。源码以工作区为准，不能只检出报告中的
原始 Git HEAD 而忽略这些未提交改动。

## 测量方法和边界

使用同一个 Chromium、相同 HTML、相同源 URL 和相同引擎比较三个可调用管线：
浏览器 JS 的 `DOMParser + extractDocument`（含克隆、DOMPurify 和语义清理）、
主线程 WASM 的 `extractHTML`、以及 Worker 的 `extractHTML` 往返。
Worker 数字包含结构化克隆、排队、消息传递与返回值；主线程 WASM 包含 UTF-8/JSON 边界。
计时后验证标题、完整正文文本和 UTF-16 长度一致；完整字段兼容性另由全部语料门禁验证。

样例沿用原性能报告的三个尺寸样例；每组预热 3 次，记录 15 次，按 Latin rotation 交替执行
三种管线。p50 使用排序后的中间样本，p95 使用 nearest-rank；全部样本保留，不剔除离群值。
这些是单机探索性结果，不是整批吞吐率或跨设备性能保证。短样例接近浏览器计时分辨率。

初始化测试使用同一浏览器进程内的 9 个新页面 realm，HTTP `no-store`，但不清空浏览器
WASM 编译缓存。先初始化主线程，再创建 Worker，所以不能解释成首次安装的纯冷启动。
资源 gzip（level 9）和 Brotli（quality 11）大小按文件离线计算；测试服务器未实际压缩传输。
npm 压缩包还包括许可证、标准库声明、依赖清单和 MPL 对应源码，不能与网页下载量混为一谈。

包构建固定使用 `wasm-release`：`opt-level=s`、LTO、单 codegen unit、panic abort、strip。
本次未使用 wasm-opt。未测量浏览器峰值内存。

## 2026-10-27 实测结果
归档数据：[measurement.json](wasm/measurement.json)。环境为 Apple M5、macOS / Darwin 25.5.0、Chromium 156.0.8078.4、rustc 1.99.1 (58cf8f9c3 2026-10-13)。
测试辅助进程使用 Node v22.16.0、npm 10.9.2。

兼容性结果：
- browser-extraction：604/604，零差异。
- browser-readerable：282/282，零差异。
- worker-extraction：604/604，零差异。
- worker-readerable：282/282，零差异。
- firefox 157.0：浏览器和 Worker 各跑两个引擎的提取、readerability，8 项冒烟检查通过；未在该浏览器重复完整语料或计时。
- webkit 27.2：浏览器和 Worker 各跑两个引擎的提取、readerability，8 项冒烟检查通过；未在该浏览器重复完整语料或计时。
- JS 边界和 Worker 生命周期检查通过；WASM 清洗器的 20 项真实 Chromium oracle/执行检查通过。

资源体积（1 KiB = 1024 bytes）：
- `index.js`：原始 6,715 bytes，gzip 2,032 bytes，Brotli 1,773 bytes。
- `worker.js`：原始 701 bytes，gzip 420 bytes，Brotli 357 bytes。
- `readability_wasm.js`：原始 6,966 bytes，gzip 2,051 bytes，Brotli 1,798 bytes。
- `readability_wasm_bg.wasm`：原始 1,244,498 bytes，gzip 454,542 bytes，Brotli 359,356 bytes。
- 四个运行时资源合计：原始 1,258,880 bytes（1229.4 KiB），gzip 459,045 bytes（448.3 KiB），Brotli 363,284 bytes（354.8 KiB）。仅主线程使用时无需下载 `worker.js`。
- npm 归档（含声明、许可证和 MPL 源码）：748,855 bytes（731.3 KiB），解包 4,508,958 bytes，235 个文件。

提取 p50，下面每行依次为浏览器 JS / 主线程 WASM / Worker 往返，单位 ms：
- `rtl-4`（1,214 bytes），chromium：0.20 / 0.10 / 0.10。
- `rtl-4`（1,214 bytes），mozilla：0.30 / 0.10 / 0.10。
- `ehow-2`（107,092 bytes），chromium：2.60 / 3.10 / 3.20。
- `ehow-2`（107,092 bytes），mozilla：2.50 / 3.00 / 3.00。
- `schema-org-context-object`（459,526 bytes），chromium：3.40 / 4.80 / 4.90。
- `schema-org-context-object`（459,526 bytes），mozilla：3.50 / 4.80 / 4.90。

9 个新页面的中位初始化耗时：JS 模块导入 3.10 ms；主线程 WASM 初始化 2.70 ms；随后创建并初始化 Worker 4.90 ms；这些数字受本地传输和编译缓存影响。

在本次两个中大型样例中，WASM 的总调用耗时高于浏览器 JS，不能据原生 Rust/Go 报告推断 WASM 提速。
Worker 的主要价值是将解析和提取移出主线程；它仍有消息复制和往返成本。短样例的差别接近计时分辨率，
不能解读为稳定倍数优势。

归档包 SHA-256：`f449c8f7d7cef2f9372e064dfc81216904b56cbbbd4aa6000a219feb8ac065dd`。
