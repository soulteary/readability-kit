# Python 0.1.0 发布前检查清单

状态：**准备完成不等于已经发布；本次不上传 PyPI 或 TestPyPI，不创建 release/tag。**
基线是 `main@d5649833b57bc67720490d4355767e3d20485c75`。
[发布说明草稿](releases/PYTHON_0.1.0.md)与
[机器可读核对记录](releases/python-0.1.0-preflight.json)一起使用。

## 已核对：版本与接口

- [x] Cargo workspace 版本为 `0.1.0`，`readability-python` 继承该版本。
- [x] `pyproject.toml` 使用动态版本；发行名 `readability-kit`，导入名 `readability_kit`。
- [x] 三平台 wheel 和 sdist 的 Name、Version、Requires-Python、License-Expression 一致：
  `readability-kit` / `0.1.0` / `>=3.10` / `Apache-2.0`。
- [x] 安装包校验要求 distribution、模块及原生扩展的 `__version__` 一致，CLI 也报告同一版本。
- [x] 元数据没有 `Requires-Dist`：无第三方 Python 运行时依赖。Rust/Cargo 和 maturin
  是源码构建依赖，不能混写成 wheel 的运行时依赖。
- [x] 发布说明保留空结果、异常、UTF-16 length 和 GIL 支持范围，不承诺 free-threaded 或 PyPy。

## 已核对：产物与许可证

- [x] 直接下载 main 的三平台 CI 产物，检查真实 wheel/sdist，而非只看文件名或本地旧包。
- [x] wheel 均为 `cp310-abi3`，平台标签分别为 `manylinux_2_34_x86_64`、
  `macosx_11_0_arm64`、`win_amd64`。不包含未构建架构的承诺。
- [x] wheel 含一个原生扩展、类型标注、`py.typed`、包入口和 CLI。
- [x] 三平台 wheel 的 `_licenses/SHA256SUMS` 全量校验通过；每个 sdist 中相应材料
  与同平台 wheel 逐字节一致。
- [x] LICENSE / NOTICE 与源码基线一致（Windows 换行按 LF 归一核对），依赖清单均为
  `target=all`，包含 99 个条目，保留 PyO3 和对应 MPL 源码。
- [x] 三平台 wheel/sdist 元数据内嵌 README 与**基线提交**的 README 一致；
  wheel 元数据允许格式生成器增加末尾空行。
- [x] 记录三个 CI wheel 与三个 CI sdist 的 SHA-256，见机器记录。
- [x] 已识别三个 CI sdist 文件名相同而字节不同；不把它们当成同一文件或声称可复现构建。

项目元数据的 Apache-2.0 声明不替代第三方许可材料。校验和证明打包完整性，
不替代分发方对适用许可条款的最终确认。

## 已核对：测试与文档

- [x] 合并后的五个 main 工作流全部成功：28 个作业通过，2 个手动任务跳过。
- [x] Python 在 Linux/macOS/Windows 完成 wheel 安装、CLI、许可证及隔离 sdist 重建测试。
- [x] CPython 3.10、3.12、3.14 × 三平台的九个组合通过；3.13 通过完整打包检查。
- [x] Go、Rust、Python 严格提取和 readerability 差分通过；保留已有兼容性边界说明。
- [x] 安装文档补充了本地 wheel、源码包、PowerShell 命令与准确的平台范围。
- [x] 包 README 中指向仓库文档的链接改为绝对 URL，便于作为包描述阅读。
- [x] 更新后的 README 已重新打入本地 wheel/sdist，并复验版本、许可证、隔离安装和源码重建。
  这是一组本地文档候选包，不替代基线的三平台 CI 包。
- [x] 三平台 CI 包及本地候选包共 8 个文件通过 `twine 6.2.0 check --strict`。

## 真正发布前仍需完成

- [ ] 将本次文档改动纳入经审核的发布提交；明确最终 tag 和完整 commit SHA。
  本地候选包在文档尚未提交时构建，不能将其当成已经冻结的最终发布产物。
- [ ] 确认 PyPI 项目名的可用性/所有权和发布账号权限。本次未确认命名空间归属，也没有上传。
- [ ] 确认接受当前三种 wheel 范围与 Linux glibc 2.34 基线；若增加架构或降低系统基线，
  先补构建与安装验证，不能只修改 wheel 标签。
- [ ] 在最终发布提交上重建三平台产物，确保每个包都包含最终 README 和同一版源码。
  当前 main CI 包仍嵌入更新前的 README，不能直接作为这次文档更新后的最终发布包。
- [ ] 对拟发布文件执行本地 `twine check --strict` 等包描述检查，并核对最终摘要清单。
- [ ] 只选定一个 `readability_kit-0.1.0.tar.gz`，记录其构建平台和 SHA-256；
  每个平台 wheel 各一份。不要混装三组同名 sdist，也不要覆盖已经发布的文件。
- [ ] 再次核对项目许可证声明、所有第三方许可证/NOTICE、MPL 对应源码和清单校验和。
- [ ] 明确批准发布后，再执行实际发布操作。本清单没有附带或执行任何上传命令。

## 本地重建与复验

先使用已安装 maturin 1.15.0 的环境，在仓库根目录选择**新的空目录**：

```sh
python/.venv/bin/python tools/build-python-package.py --out python-reports/release-candidate
python/.venv/bin/python tools/check-python-package.py --dist python-reports/release-candidate
```

Windows 将解释器替换为 `python/.venv/Scripts/python.exe`。检查完成后按平台标签
核对文件，而不是把当前机器构建的 wheel 重命名给另一平台。

发布包版本不得手工只改一个 Python 字段：版本源是 Cargo workspace。若决定更改
版本，重建全部 wheel/sdist，更新说明中的版本和文件名，再运行上述验证与 CI。

当前核对记录区分了 main CI 原始包与包含这次 README 更新的本地候选包；
SHA-256 只能用于对应那一份文件，不能跨构建套用。

平台标签含义参考 [PyPA 平台兼容标签规范](https://packaging.python.org/en/latest/specifications/platform-compatibility-tags/)。
