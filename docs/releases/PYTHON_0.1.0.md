# Python 0.1.0 发布说明（草稿）

状态：发布前准备，**尚未发布到 PyPI**。本说明基于 `main` 的
`d5649833b57bc67720490d4355767e3d20485c75`，最终发布提交和产物需按
[发布前检查清单](../PYTHON_RELEASE_CHECKLIST.md)冻结。

## 本次新增

`readability-kit` 首个 Python 版本复用现有 Rust 提取核心，提供 Chromium 和
Mozilla 两种模式。安装后的调用不依赖 Node.js，不启动提取子进程，不执行输入
HTML 中的脚本，也不获取外部资源。

- `extract_html()`：提取正文和元数据，返回不可变 `Article`，无文章时返回 `None`。
- `is_probably_readerable()`：提供轻量的可读性启发式判断。
- `Article.to_dict()`：默认使用 Python snake_case，可输出兼容其他实现的 camelCase。
- `readability-kit` / `python -m readability_kit`：支持 UTF-8 文件或标准输入，
  输出 JSON、HTML 或纯文本。
- 类型标注与 `py.typed`；默认清洗；原生提取期间释放 GIL，支持独立的并发调用。

Python API 对参数类型和值进行校验。`length` 使用 UTF-16 码元计数，以保持跨语言
兼容；它不一定等于 Python 的 `len(text_content)`。完整签名、异常和 CLI 退出码见
[安装与 API 文档](../../python/README.md)。

## 性能与修复

绑定直接传递选项和结果字段，减少重复 JSON 转换；基准工具增量解码批量输入，
降低一次装载完整 JSON 的内存开销。公开 API 仍一次接收一篇 HTML，没有新增批量 API。

同时修复 Article dataclass 子类兼容性、GIL 释放期间的输入所有权处理、版本来源
不一致、依赖许可清单过期检测、源码包提取安全性，以及 Windows 打包的 UTF-8
元数据解码。相关问题和测试见 [审查记录](../PYTHON_REVIEW.md)。

在已记录的 Apple M5 / CPython 3.13 本机实验中，审查修复后的 Python 常驻耗时
约为 Rust 的 1.14 倍；相对审查前没有观察到明显的性能或整批内存回退。这些是
特定语料和环境的结果，不是吞吐、尾延迟或任意输入的性能保证。
测量方法、区间及原始证据见 [四语言复测](../PYTHON_REVIEW_PERFORMANCE.md)。

## 安装与平台范围

发行包名为 `readability-kit`，导入名为 `readability_kit`，版本 **0.1.0**。
需要普通、启用 GIL 的 CPython **3.10+**。使用匹配的预编译 wheel 时，不需要
Rust、maturin 或第三方 Python 运行时依赖。

当前 main CI 实际构建并验证的 wheel：

- `readability_kit-0.1.0-cp310-abi3-manylinux_2_34_x86_64.whl`：Linux x86_64，glibc 2.34+。
- `readability_kit-0.1.0-cp310-abi3-macosx_11_0_arm64.whl`：macOS 11+，Apple Silicon。
- `readability_kit-0.1.0-cp310-abi3-win_amd64.whl`：Windows x64。

三个系统均通过 CPython 3.10、3.12、3.14 的安装与测试；3.13 用于构建、安装及
源码重建检查。3.11 不是单独的 CI 条目。最低 OS/libc 版本来自 wheel 标签，
不代表 CI 已在每个最低版本系统实测。

未提供 Intel macOS、Linux ARM64、musl/Alpine、Windows ARM64 wheel，也未声明
支持 PyPy 或 free-threaded CPython。不要把 abi3 解释为跨操作系统或跨架构通用。

尚未发布时，请安装本地 wheel 的明确路径：

```sh
python -m pip install --no-index --no-deps /path/to/readability_kit-0.1.0-cp310-abi3-PLATFORM.whl
python -m readability_kit --version
```

将 `PLATFORM` 替换为实际文件的完整平台标签。源码包
`readability_kit-0.1.0.tar.gz` 可以独立重建，但需要 Rust/Cargo、系统链接工具链、
maturin 1.15.0 和构建依赖；它不是完整 vendoring 的离线 Cargo 包。
Windows PowerShell 的具体命令见 [安装文档](../../python/README.md)。

## 许可证与验证

项目许可证声明为 Apache-2.0。第三方组件保留各自的许可证，包内
`readability_kit/_licenses/` 包含依赖清单、许可证、NOTICE、校验和以及对应 MPL
源文件。当前三平台清单均覆盖 99 个依赖条目；不能据项目的许可证声明移除这些材料。

合并提交的五个工作流全部通过：28 个作业成功，2 个手动开启的 fuzz/benchmark
作业按配置跳过。包含 Python 三平台 wheel/sdist 构建、隔离安装、sdist 重建、
九个 Python 版本/系统组合，以及各语言严格差分。
参见 [main Python CI](https://github.com/soulteary/readability-kit/actions/runs/40491356849)。

本说明不宣布发布。最终发布需要选定唯一 sdist、冻结新的发布提交、重建全部
平台产物并核对检查清单；当前文档更新不会自动更新已有 CI 包中的 README。
