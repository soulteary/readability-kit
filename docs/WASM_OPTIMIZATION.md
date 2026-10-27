# WASM 体积与性能优化

本轮保留公开 `init`、`extractHTML`、`isProbablyReaderable` 和 Worker 接口、默认清洗策略、
既有 HTML 及选项语料。对比对象是上一版实际 npm 产物与本轮实际 npm 产物，不以原生 Rust
结果代替 WASM 计时。初版报告保留在 [WASM.md](WASM.md)。本轮没有发布 npm 包。

## 最终改动

- HTML 通过单独的 WASM 字符串参数传入，JSON 仅承载小型选项对象，省去整篇 HTML 的 JSON 转义和解析。
- Rust 直接序列化 `Option<Article>`，公开调用不再构造 `serde_json::Value` Article 树与状态封套。
  readerability 直接返回布尔值；共享选项解码和 JS 校验次序保持原样。
- 内部兼容性封套改为 JS shim，通过相同原生提取函数获取结果，并执行原有 raw 字段适配。
  完整语料仍比较 raw 结果；没有删掉 raw 用例，也没有放宽错误或字段比较。
- 清洗策略常量变为排序后的静态字符串表，用二分查找替代每次分割并线性遍历长字符串。
  共用的查找函数禁止内联以控制重复代码。原始 14 组策略字符串保存在独立测试 fixture，
  测试逐项核对全部成员、排序和大小写/前缀/后缀变体。策略成员没有增加或删减。
- esbuild 压缩 facade、Worker 与生成的绑定代码。WASM 保持 `opt-level=s`、LTO、单 codegen unit
  和 panic abort；没有新增运行时 npm 依赖。

清洗查表的优化位于共享 Rust 核心，因此也复核原生 CLI 的严格语料。公开 WASM 接口、
返回的完整 Article、错误消息以及 Worker 生命周期行为由原有门禁继续验证。
`request_json` 是测试用内部 shim，不是公开应用接口；完整请求 JSON 的非语料诊断不构成稳定协议。

## 候选筛选

保留探索报告以解释取舍；最终收益仅依据后面的独立正式对比，不采用候选筛选中的最快数字。

- Binaryen 132.0.0 的 `-Oz` / `-O3` 能缩小未压缩 WASM，但当前候选的 gzip/Brotli 下载体积反而增加，未采用。
- 全局 `opt-level=z` 降低压缩体积，但三个代表样例中出现明显耗时退化，未采用。
- 对 URL/IDNA/ICU 单独使用 `z` 的压缩收益很小，未保留额外配置。
- 保留独立 HTML 传参、直接 Article 序列化、静态策略查表与 JS 压缩。

早期候选筛选期间有后台编译/优化器负载，只用于粗筛。正式前后对比时未并行编译、跑测试或执行优化器。
Binaryen 仅作本次实验工具，不是最终构建依赖；它的优化/收缩选项见
[Binaryen 官方说明](https://github.com/WebAssembly/binaryen)。

## 正式对比协议

同一个 Chromium 浏览器进程，三个独立新页面 realm；每轮对全部 130 篇原始上游 HTML、
两个引擎运行原版主线程、原版 Worker、优化版主线程、优化版 Worker。页面顺序按种子
`20261027 + round` 打乱，方法顺序和初始化顺序轮换。每页每方法先预热一次，再记录五批，
每批连续调用三次，批耗时除以三，得到每次调用耗时样本。

每页每方法总计 15 个批平均样本，包含 45 次实际提取；全部方法、页面和引擎合计
46,800 次计时提取，另有 3,120 次预热。每次计时提取均在计时区域外检查完整 Article
是否稳定，每个方法的预热结果另与锁定 JS 参考做完整字段深比较。

整批指标为“130 篇逐页中位数之和”，不等于进程 wall time，也不是生产吞吐率。
样例指标采用同批数据。Worker 数字包含序列化、结构化克隆、排队与消息往返；
主线程数字包含 JS/WASM 字符串和 JSON 边界。新页面初始化仍可能命中浏览器编译缓存，
不解释为首次下载冷启动。

完整兼容性门禁独立于性能样本，继续使用全部 604 个提取（公开 API 302 + raw 302）和
282 个 readerability 用例。性能样本没有删掉较慢页面，没有只选择匹配输出的子集。
短页面接近浏览器计时分辨率，不根据微小绝对差异宣称稳定倍数优势。

## 复现

先按 [包说明](../packages/wasm/README.md)构建并验证当前版本：

```sh
bun run build
bun run build:wasm
WASM_REPORT_DIR=wasm-reports/optimization/after WASM_EXTRA_BROWSERS=1 bun run test:wasm
READABILITY_WASM=1 node tools/check-rust-sanitizer.mjs
```

前后产物归档提供已经验证的原版和本轮 npm 压缩包，包含许可证与对应 MPL 源码。解压原版到
`wasm-reports/optimization/before` 后，其 `package/pkg` 可直接作为比较对象：

```sh
WASM_COMPARE_VARIANTS='{"before":"wasm-reports/optimization/before/package/pkg","after":"packages/wasm/pkg"}' \
WASM_COMPARE_REFERENCE=wasm-reports/optimization/after/javascript.json \
bun run benchmark:wasm
```

`WASM_COMPARE_ROUNDS`、`WASM_COMPARE_ITERATIONS` 可调整轮数和每页批数；
`WASM_COMPARE_DETAIL_ONLY=1` 仅用于三个尺寸样例的候选粗筛，正式结果不启用。
`WASM_COMPARE_OUTPUT` 可指定报告位置。源码哈希、资源哈希、完整样本及 npm 包 SHA-256
随报告保留；只检出测量时原始 HEAD 不足以复现包含未提交改动的优化实现。

## 2026-10-27 正式结果
[前后对比原始数据](wasm-optimization/comparison.json)、[最终包测量与源码哈希](wasm-optimization/measurement.json)。
环境：Apple M5，Darwin 25.5.0，Chromium 156.0.8078.4，rustc 1.99.1 (58cf8f9c3 2026-10-13)，Node v22.16.0，npm 10.9.2。

130 篇逐页中位数之和，单位 ms；百分比为耗时降低：
- chromium / main：**597.27 → 507.13 ms**，降低 **15.09%**。
- chromium / worker：**607.00 → 516.70 ms**，降低 **14.88%**。
- mozilla / main：**576.53 → 487.67 ms**，降低 **15.41%**。
- mozilla / worker：**586.00 → 497.77 ms**，降低 **15.06%**。

同批尺寸样例的每次提取 p50，依次列出主线程优化前 → 后、Worker 优化前 → 后，单位 ms：
- `ehow-2` / chromium（107,092 bytes）：3.067 → 2.600；3.100 → 2.700。
- `ehow-2` / mozilla（107,092 bytes）：2.933 → 2.500；2.967 → 2.533。
- `rtl-4` / chromium（1,214 bytes）：0.133 → 0.100；0.133 → 0.133。
- `rtl-4` / mozilla（1,214 bytes）：0.133 → 0.100；0.133 → 0.133。
- `schema-org-context-object` / chromium（459,526 bytes）：4.767 → 3.567；4.933 → 3.700。
- `schema-org-context-object` / mozilla（459,526 bytes）：4.833 → 3.633；4.967 → 3.800。

四个运行时资源（facade、Worker、绑定 JS、WASM）合计：
- 未压缩：**1,258,880 → 1,226,117 bytes**（1229.4 → 1197.4 KiB），减少 2.60%。
- gzip level 9：**459,045 → 448,728 bytes**（448.3 → 438.2 KiB），减少 2.25%。
- Brotli quality 11：**363,284 → 355,849 bytes**（354.8 → 347.5 KiB），减少 2.05%。
- 完整 npm 包（保留许可证与 MPL 源码）：**748,855 → 738,413 bytes**，减少 1.39%。

最终版 Chromium 主线程和 Worker 各通过提取 **604/604**、readerability **282/282**，严格零差异。
Firefox 157.0、WebKit 27.2 各通过 8 项浏览器/Worker 冒烟检查；JS 特有值校验、并发响应匹配、
初始化失败重试、超时及终止行为检查通过。WASM 清洗器 **20 项**真实 Chromium oracle/执行检查通过。

本轮体积收益较小，主要收益是减少调用管线的拷贝、JSON 转换和查找开销。结果不保证每个页面都更快，
也不外推为所有浏览器或设备的固定提速。正式初始化样本只有三个 realm，且未清空编译缓存，
不据此宣称稳定冷启动收益。旧的三样例、15 次计时结果与本次全语料协议不同，不混为同一轮数据。

前后 npm 产物、测试门禁和原始样本保存在 [evidence.zip](wasm-optimization/evidence.zip)，
包内 `SHA256SUMS` 可核验归档内容。将 `before.tgz` 解压到复现步骤中的 before 目录即可重测。

原版 npm 包 SHA-256：`f449c8f7d7cef2f9372e064dfc81216904b56cbbbd4aa6000a219feb8ac065dd`。

优化版 npm 包 SHA-256：`da20584783251f38e059a9888464f914eb8af32a52227b4ae2174d76ef297127`。

逐页中位数分布（差值小于 0.000001 ms 计为持平）：Chromium 主线程 114 篇下降、16 篇持平；
Chromium Worker 114 篇下降、15 篇持平、1 篇上升；Mozilla 主线程 105 篇下降、25 篇持平；
Mozilla Worker 111 篇下降、19 篇持平。这些是本轮观察，不是统计显著性判断。

共享核心的原生 CLI 复核也通过提取 604/604、readerability 282/282，严格零差异；
Rust workspace 测试、native/WASM Clippy、格式检查和 TypeScript 类型检查通过。

证据包 SHA-256：`0cb73870cd7515c440a75bb1341123be43741e9b3613bbe9602fec30b67f72d3`。包内还包含测量时的源文件快照及策略 fixture；
重建仍需原仓库的上游语料、许可证目录和常规工具链。
