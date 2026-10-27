# Go 原生版本技术方案

状态：设计稿，尚未实现。设计日期：2026-10-27。

## 1. 目标和技术决策

在同一仓库提供纯 Go 的正文提取库和命令行程序，输入 HTML 和来源 URL，输出与现有 JavaScript 公共 API 对应的 Article。默认使用 Chromium 启发式，支持独立的 Mozilla 模式。运行时不依赖 Node、JavaScript 虚拟机、Rust、CGO 或浏览器。

建议沿用仓库锁定的 JavaScript 引擎逐阶段移植，以 JavaScript 输出作为行为基准。Go 现成提取库可用于前期实验和结果对照，不直接充当两个引擎的共同实现。两个引擎名称必须对应各自的算法，不能只切换结果中的 engine 字段。

交付分为三个状态：可运行实验版、具备明确差异记录的原生预览版、通过兼容门禁的兼容版本。编译成功、提取成功、正文相似均不能证明兼容。现有 npm 后端继续保持 JavaScript；替换后端属于独立决策。

首期范围：静态 HTML、Article 元数据、双引擎、readerability、默认清洗、语义清理、CLI、差分测试、基准测试与原生发行物。网页抓取、动态渲染、HTTP 服务、Markdown 导出、浏览器绑定和 WASM 暂不纳入。

## 2. 已有实现与可复用资产

必须以以下源文件为依据，而不是根据 README 推测实现：

- `packages/javascript/src/index.ts`：准备来源 URL → 引擎 → 可选 DOMPurify → 以 div 为上下文解析片段 → 语义清理 → 归一化。
- `packages/javascript/src/node.ts`：必填 HTTP(S) URL、惰性静态解析、禁止脚本与资源加载。
- `packages/shared/src/types.ts`、`packages/shared/src/validation.ts`：字段、默认值、类型和校验顺序。
- `packages/javascript/src/cleanup.ts`：广告标签、无障碍播报、空容器与内联空白规则。
- `vendor/{mozilla,chromium}`、`upstream.json`、`PATCHES.md`：独立引擎快照、上游追溯及 Chromium 差异。
- `tools/compatibility.mjs`、`tests/compatibility-fixtures.json`：通用的快照与候选执行协议。
- `docs/RUST_COMPATIBILITY.md`、`docs/RUST_MIGRATION.md`：已发现的移植边界及验收经验。

现有 Rust 文档记录 604 个提取用例有 420 个不同，readerability 的 282 个用例全部匹配。这是已有记录，并非本方案重新运行的测量。它说明应先处理 DOM、空白和序列化语义，再判断算法是否一致。用例总数以后由实际捕获动态产生，不能硬编码为验收条件。

## 3. 模块和目录

建议在 `go/` 建立独立模块 `github.com/soulteary/readability-kit/go`，包名 `readability`。根目录现有 JavaScript 和 Rust 构建保持各自入口，不引入根级 go.work。单模块内含库与两个命令，避免多模块版本协调。

```text
go/
  go.mod / go.sum
  readability.go             # ExtractHTML、Extract、IsProbablyReaderable
  article.go / options.go / errors.go
  internal/
    dom/                      # 节点操作、遍历、textContent、序列化
    jscompat/                 # UTF-16、trim、正则语义辅助
    urlutil/                  # 来源、base、链接、媒体、srcset
    engine/                   # 单次提取状态和共享算法
    mozilla/                  # Mozilla 配置与独有行为
    chromium/                 # Chromium 明确差异
    metadata/                 # title、meta、JSON-LD
    sanitize/                 # 清洗策略和策略版本
    cleanup/                  # 可移植语义清理
    cli/                      # 可测试的 CLI run 函数
  cmd/readability-kit/main.go
  cmd/readability-kit-compat/main.go
  testdata/                   # Go 专项回归，避免复制上游语料
  README.md / NOTICE / UPSTREAM.md
tools/
  go-compatibility.mjs        # 候选构建与运行入口
  benchmark-go.mjs
  package-go.*
docs/
  GO_IMPLEMENTATION_PLAN.md
  GO_COMPATIBILITY.md         # 实现期间补充实际结果
```

Go 子目录模块发行标签应使用 `go/v0.1.0` 形式；二进制发行物使用独立名称区分 JS/Rust 实现。正式冻结前验证模块下载与 `go install .../go/cmd/readability-kit@版本`，不能仅验证本地构建。

## 4. 依赖选型

DOM 首选 `golang.org/x/net/html`，使用其树结构，补充少量项目所需 DOM 操作，不实现完整浏览器 DOM。其解析与 Render 提供基础能力，但不承诺浏览器序列化等价；需要专门的差分适配。

算法直接移植仓库快照。`go-shiori/go-readability` 已归档并推荐 Readeck v2，不能作为新实现的默认基础；Readeck 可作为独立实验候选，接入相同语料测量，是否借用代码取决于源码审计、许可及实测差异。

清洗优先评估 `github.com/microcosm-cc/bluemonday` 的显式自定义策略。它不天然等价于 DOMPurify，默认 UGC 策略也不能作为本项目策略。若 SVG/MathML、命名空间及属性语义无法用其策略表达，则采用更保守且有版本标识的策略发布预览；严格公共 API 兼容门禁继续失败。只有确有必要且有独立安全验证能力时再扩展专用 DOM 清洗层。

CLI 首期使用标准库 `flag` 和 `encoding/json`；URL 从 `net/url` 起步，WHATWG 不一致处由独立适配层解决。正则优先标准库 `regexp`，逐条审计 JS 表达式，不能机械替换语法。Go 版本与依赖的精确版本在 P0 通过实际构建和漏洞检查后锁定，不在设计阶段猜测最新版本。

依赖选定时提交 go.mod/go.sum、工具链版本及许可证清单。已核实 x/net/html 的 GO-2026-5029 影响 v0.55.0 之前版本，因此至少排除这一已知受影响范围，并针对最终锁定图执行 govulncheck；这个下限不代表以后没有漏洞。

## 5. Go 公共 API

建议签名如下，以下为设计接口而非已存在的代码：

```go
func ExtractHTML(ctx context.Context, input string, opts ExtractOptions) (*Article, error)
func Extract(ctx context.Context, input io.Reader, opts ExtractOptions) (*Article, error)
func IsProbablyReaderable(ctx context.Context, input string, opts ReaderableOptions) (bool, error)
```

提取无正文返回 `(nil, nil)`；参数、读取、解析、资源限制、取消等失败返回 error。readerability 的 false 是正常成功结果，不是无正文状态。字符串接口与 Reader 接口共享同一流水线；Reader 最终仍需建立整棵 DOM，不宣称流式正文算法。

Article 包含 Title、Content、TextContent、Length、URL、Engine，以及 `*string` 类型的 Byline、Dir、Lang、Excerpt、SiteName、PublishedTime。JSON tag 与 JS 的 camelCase 完全一致；可空字段不加 omitempty，输出显式 null，title 缺省为空字符串。原始引擎结果另用内部类型表示缺失字段，不让公共 Article 的 null 规则污染 raw 对照。

ExtractOptions 的 URL 为 string，Engine 为 string 枚举；可选整数、布尔和浮点字段采用指针表示“未提供”，特别是 Sanitize、CharThreshold、NbTopCandidates。ClassesToPreserve 为 []string，nil 与空数组的意义由适配器保留。提供 DefaultExtractOptions(sourceURL) 辅助构造，但直接使用零值 Options 也必须按相同规则补全缺省值，URL 仍必填。

默认值：engine=chromium、charThreshold=500、maxElemsToParse=0、nbTopCandidates=5、keepClasses=false、disableJSONLD=false、linkDensityModifier=0、sanitize=true。classesToPreserve 与上游内置保留项合并，不能替换掉内置项。readerability 默认 minContentLength=140、minScore=20。

原生 API 不暴露 live Shadow DOM 参数：字符串和 Reader 没有活动 shadow root。兼容 JSON 适配器接受并校验 flattenShadowRoots，对静态输入保持与 JS 字符串入口相同效果；不能宣称 Go 提供浏览器 flatten 能力。将来浏览器先导出扁平化 HTML 的方案须独立测试。

校验要求：charThreshold≥1、maxElemsToParse≥0、nbTopCandidates≥1，均为整数；linkDensityModifier 有限；readerability 的 minContentLength 为非负整数，minScore 为有限非负数。Go 原生整数仍检查负数，float 检查 NaN/Inf。

错误使用带 Code、Option、Cause 的结构，支持 errors.Is/As；稳定分类包括 invalid_option、invalid_url、input_limit、element_limit、parse、canceled、output。兼容适配器保留现有 JS 错误文字和验证先后顺序，CLI 对外退出码与库错误码分别维护。

## 6. DOM 和语言语义适配

### 6.1 节点与修改

内部封装 ElementChildren、TextContent、InnerHTML、Clone、Replace、Remove、NextElement、属性及 class token 操作。区分节点子项与元素子项，不允许将 JS children 和 childNodes 混用。遍历修改遵照源代码使用快照还是动态遍历的语义；删掉祖先后跳过已离开内容容器的后代。

候选分数存入每次调用的 map[*html.Node]float64，不写进 HTML 属性。缓存文本、链接密度时必须有失效策略；首版先不做跨修改缓存。模板内容、注释、重复属性、noscript、畸形表格、SVG/MathML 命名空间纳入独立 fixture。

新解析的 HTML 归本次调用所有，无需重复克隆源 DOM。算法回退重试则必须恢复原文或克隆预处理快照，不能继续使用上一轮已删改的树。

### 6.2 文本与序列化

所有对齐 JS length 的场景统一使用 UTF16Len，逐 rune 将非 BMP 字符计为 2，其余计为 1。正文阈值、标题、无障碍清理和 readerability 都要审计，不能只修正最终 Article.Length。

TextContent 按文本节点拼接，不擅自添加块级换行，不 Trim 整篇正文，不为 prettier 输出重新格式化。JS trim、正则 \s、大小写、split 的边界与 Go 对应函数逐项测试；URL、class 与 CSS 标识符不采用全文 Unicode 规范化。

建立与浏览器 innerHTML 对应的序列化测试，覆盖属性顺序、转义、空元素、原始文本元素和命名空间。安全转义始终优先；不能用字符串替换删除转义以降低差分。先按容器语义生成正确 DOM，再解决序列化差异；若无法安全做到字节一致，明确保留兼容阻塞。

JS 输入可以包含孤立代理项，而 Go string 通常表示 UTF-8。P0 为 JSON 中孤立 UTF-16 代理项建立边界用例；未实现可逆表示前，不承诺覆盖这类输入。不得由 Go JSON 解码静默替换后仍声称完整 JS 字符串兼容。

### 6.3 URL

单独保存 canonicalSourceURL 和 effectiveBaseURL，不向 DOM 注入额外 base 节点。先取第一个 base[href] 并相对 source 解析；无效或非 HTTP(S) 时回退 source，不继续选择后面的 base。元素限制对准备后的原输入 DOM 计数，不能计入实现引入的节点。

镜像 packages/javascript/src/index.ts：img[src] 在 Chromium 首图提取前解析，其余链接、懒加载属性、媒体和 srcset 按引擎对应阶段处理。url 输出来源地址，而非 base。锚点、协议相对 URL、查询串、空值、默认端口、IDNA、反斜杠、百分号编码及以 http 开头的相对文件名单测。

net/url 与 WHATWG URL 不完全相同。P0 先建立两者差分，必要时评估 WHATWG 实现或受控适配；仅通过 HTTP(S) scheme 和 host 校验不足以证明对齐。srcset 用词法扫描器解析 URL 与描述符，覆盖无空格逗号、URL 内逗号、data URL 和非法描述符，禁止简单 strings.Split(',')。

## 7. 双引擎移植

先完成 Mozilla，再将 Chromium 改动作为可审计策略接入。共享代码只承载行为相同的步骤，分歧用明确 hook 或策略函数表达，禁止散落大量含义不明的 bool 分支。

移植顺序：

1. 常量、标签集合、正则、readerability 与元素上限。
2. 元数据：文档标题、meta、JSON-LD、作者、语言、方向及日期。
3. 预处理：脚本/style/noscript、br 链、div/p 转换、懒加载图片和媒体。
4. 候选：段落文本与逗号分数、祖先累计、class 权重、链接密度、top candidates、兄弟节点合并。
5. 回退：按源引擎顺序关闭 strip-unlikely、class-weight、conditional-clean，保留各轮候选结果和正确原始树。
6. 收尾：标题/作者清理、条件删除、表格、媒体、URL 重写、class 保留及 raw 返回。
7. Chromium 差异：figure 图片、首图和 caption/cite、JSON-LD name/headline、recipe、单子节点提升、孤立 label、shopping 关键词、ad-break 词边界。

每项 Chromium 差异同时添加“应发生变化”和“不应误改”的用例，并对 Mozilla 运行负向验证。移植记录包含源快照 hash、方法/代码位置、Go 对应文件、差异 fixture 及许可来源。调试分数和阶段事件通过内部可选 trace 输出到 stderr 或测试观察器，不进入 Article。

## 8. 清洗与语义清理

流水线顺序固定：引擎 raw HTML → 可选 sanitizer → 以 div 为上下文解析结果片段 → cleanContent → 最终序列化与 textContent/length。sanitize=false 仍执行语义清理，不能直接返回 raw Article。

清洗策略必须从当前 DOMPurify 默认配置加项目 FORBID_TAGS/FORBID_ATTR 出发测量。建立显式标签、属性、URL scheme、命名空间规则，删除 on*、style 属性、style 标签和交互表单控件；区分“删除整个子树”和“解包保留文本”。保留图片、响应式媒体、表格、代码、必要 SVG/MathML 的目标均须以测试确认，不能以通用白名单推断。

不默认添加 rel 或重排 class 来改变兼容输出。保留相对链接与片段的具体规则服从参考；禁用清洗不意味着执行脚本，原生提取过程始终无页面执行能力。

cleanContent 按 packages/javascript/src/cleanup.ts 移植：无媒体时删除 UTF-16 长度小于 200 的活动播报；广告仅匹配 trim 后的小写完整标签；媒体和数学容器保留；空 inline 若隔开两侧文字则替换单个空格。避免删除段落中讨论 sponsored research 的正常内容。

独立验证清洗后 HTML 在 Chromium 重新解析时的安全性，包括 namespace 混淆、mXSS、畸形表格、SVG/MathML、属性编码和 srcset。测试页阻断真实外网请求，记录脚本执行、事件、导航及 DOM 变化；资源阻断不能被当作清洗成功。严格兼容与安全验证是两个门禁，任何一个通过均不能替代另一个。

## 9. 兼容协议与差分验收

复用现有 schema=1 快照；通过配置候选命令运行 Go，而不是复制一套会分叉的比较器。前期保留 compatibility.mjs 文件名也可复用其 run 功能，后续如抽取通用模块，必须让 Rust/Go 共用并保持既有 harness 测试。

候选命令每次从 stdin 读取一个 JSON 请求 `{html, options, layer}`，输出一个 envelope 后退出：

```json
{"status":"ok","article":{}}
```

上例仅示意 envelope，实际 article 必须是完整对象。无正文输出 status=empty 和 article=null；语义错误 status=error、article=null、error=参考文字。readerable 输出 status=ok、article=true/false。语义错误进程退出 0，崩溃或协议失败为非零。stdout 只放协议数据，日志进入 stderr。

支持 raw、api、readerable 三层。raw 直接对齐相应上游引擎，不能调用公共 API 校验器，否则会重复 Rust 的 raw 参数边界差异。使用 json.RawMessage/UseNumber 保留未传、null、错误类型、未知字段和数值信息；JS 忽略的未知字段不应因 DisallowUnknownFields 被额外拒绝。engine=null 的 nullish 默认、数字零的 raw 缺省语义均单独验证。

快照记录输入 hash、选项、引擎、源码/构建产物 hash、upstream manifest、Node/jsdom 版本、Go 版本、go.mod/go.sum 与候选二进制 hash。设置每个候选进程 30 秒超时，与现有 harness 保持一致。

严格检查缺失/额外用例、状态、全部字段、null/缺失、HTML 字节、文本、length 和错误信息；空白归一化仅作诊断。报告按 engine/layer/field 分类。不能用相似度阈值、allowlist 或覆盖 JS 基准隐藏差异。

预览版可以发布，但须附完整差异报告并明确不兼容；声称兼容必须在锁定环境和完整语料下零差异，且安全测试独立通过。日后有意变更输出必须另设有版本的行为合同，不降低原有严格门禁。

## 10. CLI、资源与并发

CLI 对齐现有文件/stdin、必填 --url、--engine、--format json|html|text、--output、帮助和版本行为。错误和说明写 stderr，内容写 stdout；退出码 0=成功/帮助/版本，2=无正文，1=错误。未知参数、缺失值、多输入、输出编码和换行行为逐项测试现有 CLI。

输出文件先在目标目录创建临时文件，完整写入、检查 Close，再原子替换；失败清理临时文件并保留旧输出。不要假设 Windows rename 覆盖行为与 Unix 相同，采用经平台验证的替换实现，记录权限及符号链接策略。不给 shell 或网络留隐式调用路径。

库提供独立 Limits（MaxInputBytes、MaxDepth、MaxNodes），默认兼容配置不额外裁剪；CLI 可显式开启受限模式。maxElemsToParse 仍是上游选项，与额外资源限制区分。Reader 输入上限通过 N+1 读取检测，不截断后继续提取。MaxDepth/MaxNodes 的解析前保护可先做 tokenizer 预算扫描，解析后再校验实际树；预扫描是额外限制，不能替代真实元素计数。

每次调用独立状态，无共享可变 DOM、分数和缓冲区。ctx 在读取及算法遍历阶段检查；x/net/html 的解析不能被包装 goroutine 真正强制终止，超时返回后让后台继续跑不构成资源限制。对于无法协作取消的阻塞 Reader 或解析，调用方需关闭 reader 或采用进程隔离；兼容 harness 的进程超时提供硬终止。首版不额外引入并发批处理 API。

## 11. 性能测量

分别测常驻库调用与冷启动 CLI，均包含解析、默认清洗、语义清理、序列化；raw 性能单列。语料固定 hash，覆盖中文/英文/emoji、图片表格、长文章、密集节点、畸形及对抗输入。

Go 测 ns/op、B/op、allocs/op，跨进程驱动测 p50/p95、吞吐和峰值 RSS；报告 CPU、系统、Go/Node/Rust 版本、构建参数及所有候选 hash。公平比较相同输入与相同默认功能；只有行为差异可理解时才解读速度差异。

P0 先采集 JS/Rust 当前版本基准，P5 再据实设定性能预算，不预先承诺倍数。优化先看 pprof 的 DOM 克隆、重复 textContent、正则、清洗解析和序列化热点；每轮优化重新跑受影响兼容用例。避免未经测量的 sync.Pool 及跨请求节点复用。

## 12. 阶段和完成标准

以下为单名熟悉 Go/DOM 工程师的工作量估计，不是兼容结果承诺；整体约 6–10 周，严格兼容可能因解析器、URL 和 sanitizer 追加投入。

1. **P0：语义可行性，3–5 天。** 固定依赖与许可证，复用候选协议；建立 parser/serializer、WHATWG URL、UTF-16 与 sanitizer 差分尖峰。输出风险和实现路径决策。若序列化或清洗成本失控，先交付明确不兼容的预览路线。
2. **P1：接口和 DOM，4–6 天。** 完成类型、默认值、验证、错误、DOM 工具、readerability 及 raw/api 协议分层。完成专项与上游 readerability 差分，报告必须区分未实现和行为错误。
3. **P2：Mozilla 引擎，7–10 天。** 完成元数据、候选、回退、清理及 URL 阶段。全 corpus raw 差分，逐项修复；未达零差异时保留阻塞记录。
4. **P3：Chromium 引擎，4–6 天。** 根据快照差异移植，每项附回归和 Mozilla 隔离测试，生成两个 raw 引擎完整报告。
5. **P4：公共流水线与 CLI，5–8 天。** 完成 sanitizer、cleanContent、最终字段、三格式、文件保护、平台行为与浏览器重解析安全验证。产出公共 API 差分和策略说明。
6. **P5：稳健性和发行，4–7 天。** race/fuzz/基准、跨平台 CI、模块安装、发行包许可证与 checksum、迁移文档。严格门禁未过则仅发布标注差异的预览，不宣布可替换 JS。

先后依赖为 P0 → P1 → P2 → P3 → P4 → P5；P4 中 CLI 和专项清洗用例可提前准备，但完整验收必须等待双引擎。

## 13. CI 与发布验收

新增独立 Go workflow，工作目录 go/；根脚本明确 cd 或指定目录，不能让贡献者误以为根目录 go test ./... 已测试子模块。

每次变更执行 gofmt、go vet、go test 和构建；支持的平台执行 race。PR 附双引擎 raw/api 及 readerability 报告，未实现阶段允许明确标识的实验性失败报告，但 release 的 strict gate 必须是阻塞条件。运行 govulncheck、有限 fuzz smoke 和浏览器安全回归，完整 fuzz/性能测量按手动或定时作业运行，不以短期 fuzz 无崩溃声明完全正确。

使用 Linux/macOS/Windows 的实际 runner 做 CLI 集成验证，构建目标先覆盖 amd64/arm64（以各平台工具链支持为准），CGO_ENABLED=0。仅交叉编译不代表已运行验证。

计划命令（在 Go 代码和脚本落地后才可执行）：

```sh
cd go
go test ./...
go test -race ./...
go vet ./...
go build -trimpath -o ../go-dist/readability-kit ./cmd/readability-kit
go build -trimpath -o ../go-dist/readability-kit-compat ./cmd/readability-kit-compat
cd ..
node tools/compatibility.mjs capture --output /tmp/readability-js.json
node tools/compatibility.mjs run --baseline /tmp/readability-js.json --command ./go-dist/readability-kit-compat --output /tmp/readability-go-diff.json
node tools/compatibility.mjs capture-readerable --output /tmp/readability-readerable-js.json
node tools/compatibility.mjs run --baseline /tmp/readability-readerable-js.json --command ./go-dist/readability-kit-compat --output /tmp/readability-go-readerable-diff.json
```

发布包包括二进制、LICENSE/NOTICE、依赖许可、对应源码修订、策略版本、构建信息、逐文件 SHA-256 和压缩包 checksum；已移植的 Mozilla/Chromium 版权和修改记录保持追溯。根 NOTICE 在实际引入代码后更新，设计阶段不声称已引入依赖或移植实现。

最终兼容验收必须同时满足：完整严格差分零差异；两个真实独立引擎；默认清洗浏览器验证通过；CLI 失败保护通过；无隐式网络/脚本执行；并发 race 与专项边界测试通过；完整可复现性能报告；目标平台运行与独立消费者安装通过。

## 14. 外部依据

以下资料于设计时核实，实际实施须重新核实并锁定具体版本：

- [x/net/html 官方 API](https://pkg.go.dev/golang.org/x/net/html)：DOM、片段解析和 Render 行为。
- [go-shiori/go-readability](https://github.com/go-shiori/go-readability)：归档状态及 Readeck 迁移说明。
- [Readeck Go Readability v2 API](https://pkg.go.dev/codeberg.org/readeck/go-readability/v2)：候选实现的独立评估入口。
- [bluemonday 源仓库](https://github.com/microcosm-cc/bluemonday)：策略型 HTML sanitizer，需项目自定义策略与独立验证。
- [GO-2026-5029 官方记录](https://pkg.go.dev/vuln/GO-2026-5029)：HTML 解析与重新序列化的已知安全边界及修复范围。
