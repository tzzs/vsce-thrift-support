# Thrift Support for VS Code 与 CLI

[English](./README.md) | [简体中文](./README.zh-CN.md)

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/tanzz.thrift-support?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=tanzz.thrift-support)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/tanzz.thrift-support?label=Installs)](https://marketplace.visualstudio.com/items?itemName=tanzz.thrift-support)
[![Open VSX](https://img.shields.io/open-vsx/v/tanzz/thrift-support?label=Open%20VSX)](https://open-vsx.org/extension/tanzz/thrift-support)
[![OVSX Downloads](https://img.shields.io/open-vsx/dt/tanzz/thrift-support?label=OVSX%20Downloads)](https://open-vsx.org/extension/tanzz/thrift-support)
[![CI](https://github.com/tzzs/vsce-thrift-support/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/tzzs/vsce-thrift-support/actions/workflows/ci.yml)
[![Publish](https://github.com/tzzs/vsce-thrift-support/actions/workflows/publish.yml/badge.svg)](https://github.com/tzzs/vsce-thrift-support/actions/workflows/publish.yml)

一套基于共享语言核心构建的 Apache Thrift IDL 工具：VS Code 扩展负责交互式开发体验，CLI 负责自动化、脚本与 CI/CD。

![Thrift 诊断与格式化预览](docs/assets/marketplace/format-diagnostics.png)

> 开发者请阅读开发指南：见仓库根目录的 [DEVELOPMENT.md](DEVELOPMENT.md)。
> 配置项详见 [docs/settings-reference.md](docs/settings-reference.md)，安全支持范围与漏洞报告详见 [SECURITY.md](SECURITY.md)。

## 选择使用入口

| 入口 | 适用场景 | 主要能力 | 安装方式 |
|------|----------|----------|----------|
| **VS Code 扩展** | 交互式编写、浏览与评审 | 高亮、补全、诊断、导航、格式化、重命名、重构与层级视图 | 在 VS Code 中搜索 **Thrift Support**，或通过 [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=tanzz.thrift-support) / [Open VSX](https://open-vsx.org/extension/tanzz/thrift-support) 安装 |
| **`thrift-support` CLI** | CI/CD、提交前检查、脚本及独立于编辑器的工作流 | 整文件/行范围格式化、诊断、AST 输出与符号列表 | `npm install --save-dev thrift-support` |

两个入口都复用 `@tanzz/thrift-core` 的 Thrift 解析与语言行为。其中，VS Code 的**格式化选择**与 CLI 的 `format --range` 使用同一套格式化上下文逻辑。

## 🚀 VS Code 扩展

### 语法高亮

- 完整的 Thrift 语法支持，包括关键字、数据类型、字符串、注释和数字字面量
- 支持所有 Thrift 原生类型（包含 uuid）和容器类型
- 智能的语法着色，提升代码可读性

### 代码格式化

- **文档格式化**：一键格式化整个 Thrift 文件
- **选择格式化**：格式化选中的代码块
- **智能对齐**：自动对齐字段类型、字段名和注释
- **可配置选项**：支持自定义缩进、行长度等格式化规则

### 代码导航

- **跳转到定义**：快速导航到类型定义
- **包含文件解析**：支持跟踪 `include` 语句
- **工作区搜索**：在整个工作区中查找定义

### 编辑器语义能力

- **语义令牌**：基于 AST 为类型、字段、枚举、服务、方法、常量等生成 VS Code Semantic Tokens；当前采用整文档生成，不实现增量 token edits。
- **调用层级**：支持 service/interaction 方法的 incoming/outgoing calls。
- **类型层级**：支持 service `extends` 全链路、typedef alias 链路，以及 struct/union/enum/exception/interaction 等顶层类型条目。Thrift 标准 IDL 不支持 struct/exception 继承，因此不会把非标准 `struct ... extends ...` 文档化为继承关系。

### 代码重构

- **标识符重命名（F2）**：跨文件更新引用，内置冲突检测
- **抽取类型（typedef）**：从选区或当前字段推断类型并生成 `typedef`
- **移动类型到文件**：将 `struct/enum/service/typedef` 等移动到新的 `.thrift` 文件并自动插入 `include`

### 高级特性
- **流式传输（stream）**：支持实验性的流式传输语法
- **数据收集（sink）**：支持实验性的数据收集语法
- **交互模式（interaction）**：支持实验性的交互模式语法

## ⚡ 性能表现

- **增量解析**：编辑时只重新解析受影响的代码块，缓存命中时响应 <5ms
- **智能缓存**：LRU-K 多级缓存 + 内存压力自动驱逐，覆盖 AST、诊断、定义、符号等各类查询
- **并发分析**：最多同时分析 3 个文件（较早期版本提升 3×），配合防抖/节流避免 UI 卡顿
- **大文件支持**：>10000 行文件按顶层块边界分块格式化，避免 O(n²) 对齐扫描
- **CI 性能门禁**：内置基准测试，1000 行文件解析 <500ms、格式化 <500ms，超阈值自动失败

详见 [PERFORMANCE.md](PERFORMANCE.md) 了解调优建议与 CI 集成方式。

## 📖 高级特性文档

查看[高级特性文档](docs/advanced-features.md)了解流式传输、交互模式等实验性语法的使用方法。

## 🔐 信任面与发布说明

- MIT 许可证，免费扩展，通过 `tanzz` 命名空间发布到 Visual Studio Marketplace 与 Open VSX。
- 当前源码未实现 telemetry 或 analytics 采集。
- release-please 负责版本生成；GitHub Release published 事件触发 VSIX 打包、Visual Studio Marketplace 发布、Open VSX 发布与 npm CLI 发布。
- CI 门禁覆盖 lint、build、test、coverage、CLI dogfood、package smoke 和 performance assertions。
- 当前验证链路见 [docs/release-verification.md](docs/release-verification.md)，安全模型见 [SECURITY.md](SECURITY.md)。

## 🖥️ CLI 工具

独立 npm 包 `thrift-support` 将共享 Thrift 引擎提供给 CI/CD、提交前检查、Shell 脚本及其他编辑器。完整参数见 [CLI 使用文档](https://github.com/tzzs/vsce-thrift-support/blob/master/packages/cli/README.md)。

### 安装

```bash
npm install -g thrift-support
# 或在项目内局部安装
npm install --save-dev thrift-support
```

### 命令

```bash
# 检查格式化（CI 推荐）
thrift-support format --check src/**/*.thrift

# 格式化并写回文件
thrift-support format --write src/

# 仅格式化第 12 至 18 行（从 1 开始，包含首尾）
thrift-support format --range 12:18 src/example.thrift

# 仅检查或写回该范围
thrift-support format --check --range 12:18 src/example.thrift
thrift-support format --write --range 12:18 src/example.thrift

# 从 stdin 读取并输出
echo "struct Foo{1:i32 id}" | thrift-support format --stdin
echo "struct Foo{1:i32 id}" | thrift-support format --stdin --range 1:1

# 运行诊断（语法 + 语义规则）
thrift-support lint src/**/*.thrift
thrift-support lint --severity error --json src/**/*.thrift

# 解析并输出 AST（JSON）
thrift-support parse --stdin < myfile.thrift

# 列出定义的符号
thrift-support symbols --json src/my.thrift
```

`--range` 只修改选中的行，缩进上下文从范围之前的内容推导。由于两个入口调用同一套 core 实现，其行为与扩展的**格式化选择**一致。

### 配置文件

在项目根目录创建 `.thriftrc.json`，CLI 会自动向上查找：

```json
{
    "format": {
        "indentSize": 4,
        "trailingComma": "add",
        "alignTypes": true,
        "maxLineLength": 100
    },
    "lint": {
        "severity": "error"
    }
}
```

### 退出码

| 代码 | 含义 |
|------|------|
| 0 | 成功 |
| 1 | Lint 错误（或 `--check` 发现未格式化文件） |
| 2 | 用法错误 |
| 3 | 内部错误 |

## 📦 安装 VS Code 扩展

1. 打开 VS Code
2. 进入扩展市场 (`Ctrl+Shift+X`)
3. 搜索 "Thrift Support"
4. 点击安装

## 🧭 项目结构

更完整的 agent 可读目录地图与验证矩阵见 [docs/PROJECT_MAP.md](docs/PROJECT_MAP.md)。

- `packages/core/src/`: 纯 Thrift 解析、格式化、诊断、缓存与通用工具
- `packages/vscode/src/`: VS Code 扩展入口、providers、commands、配置桥接
- `packages/cli/src/`: CLI 参数解析、配置读取、format/lint/symbols 命令
- `syntaxes/`: TextMate 语法高亮 grammar
- `tests/src/`: 规范 Mocha 测试
- `tests/cli/`: CLI 集成与单元测试
- `tests/perf/`: 性能基准测试
- `tests/debug/`: 手动复现与调试脚本
- `test-files/` / `tests/src/**/test-files/`: 测试夹具
- `language-configuration.json`: VS Code 语言括号、注释等配置

## 🔧 VS Code 扩展使用方法

### 格式化代码

- **格式化文档**：`Ctrl+Shift+I` (Windows/Linux) 或 `Cmd+Shift+I` (Mac)
- **格式化选择**：选中代码后使用 `Ctrl+K Ctrl+F` (Windows/Linux) 或 `Cmd+K Cmd+F` (Mac)
- **命令面板**：
    - `Thrift: Format Document`
    - `Thrift: Format Selection`

扩展的格式化选择与 CLI `format --range` 使用同一套 core 格式化上下文实现：交互编辑使用扩展命令，自动化场景使用 CLI。

### 代码导航

- **跳转到定义**：`F12` 或 `Ctrl+点击` 类型名
- **查看定义**：`Alt+F12`

### 语义令牌、调用层级与类型层级

- 语义令牌由 AST 整文档生成，覆盖 struct/union/exception、enum/member、service/interaction、method、field、typedef、const、namespace 和类型引用；暂不实现 `provideDocumentSemanticTokensEdits`。
- 调用层级展示 service/interaction 方法之间的调用与覆写关系。
- 类型层级展示 service `extends` 的完整父链和直接子服务，以及 typedef alias 的父链。
- struct、union、exception、enum、interaction 会作为可查看的顶层类型条目出现，但除 service `extends` 与 typedef alias 外，不声明额外继承语义。

### 代码诊断

- 语法括号配对与未闭合检查（syntax.unmatchedCloser / syntax.unclosed）
- 类型校验：未知类型与 typedef 基类（type.unknown / typedef.unknownBase）
- 容器内部类型校验：校验 list/map/set 的内层类型是否已定义
- 枚举取值约束：必须为非负整数（enum.negativeValue / enum.valueNotInteger）
- 默认值类型校验：包括基础类型与 uuid 字符串格式校验（value.typeMismatch）
- 服务约束：
    - oneway 必须返回 void，且不能声明 throws（service.oneway.returnNotVoid / service.oneway.hasThrows）
    - throws 的类型必须为已知异常类型（service.throws.unknown / service.throws.notException）
    - extends 的父类型必须为 service（service.extends.unknown / service.extends.notService）
- 默认值解析健壮性改进：
    - 忽略字段注解中的 '='，避免被误识别为默认值起始
    - set<T> 默认值同时接受 `[]` 或 `{}` 包裹，并依据顶层括号进行元素分隔校验

说明：诊断在编辑与保存时即时更新，可在 VS Code“问题”面板查看并定位。

### 代码重构

- **标识符重命名（F2）**：跨文件更新引用，内置冲突检测
- **抽取类型（typedef）**：从选区或当前字段推断类型并生成 `typedef`
- **移动类型到文件**：将 `struct/enum/service/typedef` 等移动到新的 `.thrift` 文件并自动插入 `include`

### 重命名与重构

- **重命名符号**：选中标识符按 `F2`，或右键菜单选择 `Rename Symbol`
- **命令面板**：
    - `Thrift: Extract type (typedef)`
    - `Thrift: Move type to file...`
    - `Thrift: Show Performance Report`
    - `Thrift: Clear Performance Data`
    - `Thrift: Show Memory Report`
    - `Thrift: Force Garbage Collection`
- **灯泡菜单（Quick Fix/Refactor）**：在合适位置会出现与重构相关的 Code Action

### 配置选项

在 VS Code 设置中可以配置以下选项：

```json
{
  "thrift.format.trailingComma": "preserve", // "preserve" | "add" | "remove"
  "thrift.format.alignTypes": true,
  "thrift.format.alignNames": true,
  "thrift.format.alignAssignments": true,
  "thrift.format.alignStructDefaults": false,
  "thrift.format.alignAnnotations": true,
  "thrift.format.alignComments": true,
  "thrift.format.indentSize": 4,
  "thrift.format.maxLineLength": 100,
  "thrift.format.collectionStyle": "preserve" // "preserve" | "multiline" | "auto"
}
```

- 对齐总开关（alignAssignments）：开启后统一控制结构体字段等号和枚举等号/枚举值的对齐；未显式设置时，各类对齐遵循各自默认（结构体等号对齐默认关闭，枚举等号/枚举值默认开启）。
- 结构体默认值对齐（alignStructDefaults）：仅控制字段默认值的等号对齐，独立于 alignAssignments，不随总开关联动。

## 规范对齐

- 与 Apache Thrift IDL 0.24 对齐：官方 IDL 文档将 `uuid` 列为内建基础类型，本扩展在语法高亮、诊断与定义跳转中都按 primitive 处理。
- 参考文档：Apache Thrift — IDL（Interface Definition Language）：https://thrift.apache.org/docs/idl

## 📝 格式化示例

### 格式化前：

```thrift
struct User{
1:required string name
2:optional i32 age,
3: string email // user email
}
```

### 格式化后：

```thrift
struct User {
    1:   required string name,
    2:   optional i32    age,
    3:   string          email  // user email
}
```

## 🐛 问题反馈

遇到问题？先查看 [TROUBLESHOOTING.md](TROUBLESHOOTING.md) 中的常见解决方案。

如果仍未解决，请通过以下方式反馈：

1. **GitHub Issues**：在 [项目仓库](https://github.com/tzzs/vsce-thrift-support) 中创建 Issue
2. **描述问题**：请详细描述遇到的问题，包括：
    - VS Code 版本
    - 扩展版本
    - 重现步骤
    - 期望行为
    - 实际行为
3. **提供示例**：如果可能，请提供相关的 Thrift 代码示例

## 🤝 贡献指南

我们欢迎社区贡献！如果您想为项目做出贡献：

### 贡献方式

1. **报告 Bug**：发现问题请及时报告
2. **功能建议**：提出新功能的想法和建议
3. **代码贡献**：提交 Pull Request
4. **文档改进**：帮助完善文档

### 开发环境

开发相关内容已迁移至 [DEVELOPMENT.md](DEVELOPMENT.md)，请前往查看最新要求与步骤（包括 Node.js 版本、构建、测试与发布流程）。

### 提交 Pull Request

1. 创建功能分支：`git checkout -b feature/your-feature`
2. 提交更改：`git commit -m "Add your feature"`
3. 推送分支：`git push origin feature/your-feature`
4. 创建 Pull Request

## 📄 许可证

本扩展基于 MIT 许可证开源。

## 🔄 更新日志

完整的更新记录请查看 CHANGELOG：

- 本地：[CHANGELOG.md](CHANGELOG.md)
- GitHub：https://github.com/tzzs/vsce-thrift-support/blob/master/CHANGELOG.md

## 📚 开发者文档

| 文档 | 说明 |
|------|------|
| [docs/README.md](docs/README.md) | 文档索引与新鲜度提示 |
| [docs/PROJECT_MAP.md](docs/PROJECT_MAP.md) | 目录所有权、生成产物和验证矩阵 |
| [DEVELOPMENT.md](DEVELOPMENT.md) | 开发环境搭建、构建、测试、发布流程 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 缓存系统、增量解析/格式化、并发控制详解 |
| [PERFORMANCE.md](PERFORMANCE.md) | 性能调优、CI 集成、内存管理建议 |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | 常见问题排查指南 |

## 🔗 相关链接

- **Apache Thrift — IDL 文档**：https://thrift.apache.org/docs/idl
- **Thrift 类型系统**：https://thrift.apache.org/docs/types
- **GitHub 仓库**：[https://github.com/tzzs/vsce-thrift-support](https://github.com/tzzs/vsce-thrift-support)
- **问题反馈**：[GitHub Issues](https://github.com/tzzs/vsce-thrift-support/issues)
- **功能请求**：[GitHub Discussions](https://github.com/tzzs/vsce-thrift-support/discussions)
- **CI 状态**：[CI Workflow](https://github.com/tzzs/vsce-thrift-support/actions/workflows/ci.yml)
- **发布状态**：[Publish Workflow](https://github.com/tzzs/vsce-thrift-support/actions/workflows/publish.yml)

---

**享受使用 Thrift Support 扩展！** 如果觉得有用，请在 [GitHub](https://github.com/tzzs/vsce-thrift-support) 给我们一个 ⭐️
