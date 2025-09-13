# Thrift Support for VSCode — 开发指南

本文件仅保留面向开发者的必要信息，帮助你在本地开发、构建、测试与发布扩展。

## 版本要求（务必统一）
- Node.js: 22.18.0（与 CI 一致）
- VS Code 引擎: ^1.74.0（与 package.json engines.vscode 一致）
- TypeScript: ^4.9.4（与 devDependencies 一致）
- vsce: ^2.15.0（用于本地打包/发布，可选）

提示：如本地 Node 版本不同，可能导致安装或构建失败（如 undici 要求 Node >= 20.18.1）。建议使用 nvm-windows/Volta 等工具固定 Node 版本。

## 项目架构与设计

### 目录结构（简）
```
thrift-support/
├── src/
│   ├── extension.ts            # 扩展入口，注册能力与命令
│   ├── formatter.ts            # 格式化核心逻辑
│   └── definitionProvider.ts   # 跳转到定义/引用解析
├── syntaxes/
│   └── thrift.tmLanguage.json  # 语法高亮的 TextMate 语法
├── language-configuration.json # 语言括号/注释等配置
├── tests/                      # 测试脚本
└── test-files/                 # 示例与测试用 Thrift 文件
```

### 模块划分
- 扩展入口（Extension）— <mcfile name="extension.ts" path="src/extension.ts"></mcfile> ([src/extension.ts](src/extension.ts))
  - 激活时机：onLanguage:thrift
  - 注册命令与提供者（格式化、跳转到定义）
  - 读取并响应配置变更

- 格式化器（Formatter）— <mcfile name="formatter.ts" path="src/formatter.ts"></mcfile> ([src/formatter.ts](src/formatter.ts))
  - 负责文档/选区格式化、对齐策略、缩进与行长控制
  - 受配置项影响（如 alignTypes/alignFieldNames/alignComments/trailingComma/indentSize/maxLineLength/collectionStyle 等）

- 定义提供器（Definition Provider）— <mcfile name="definitionProvider.ts" path="src/definitionProvider.ts"></mcfile> ([src/definitionProvider.ts](src/definitionProvider.ts))
  - 解析 include 关系与跨文件符号定位
  - 支持工作区范围的跳转到定义

- 语法与语言配置— <mcfile name="thrift.tmLanguage.json" path="syntaxes/thrift.tmLanguage.json"></mcfile>、<mcfile name="language-configuration.json" path="language-configuration.json"></mcfile>（[syntaxes/thrift.tmLanguage.json](syntaxes/thrift.tmLanguage.json)、[language-configuration.json](language-configuration.json)）
  - 提供高亮、括号配对、注释等语言层支持

### 设计要点
- 格式化流水线（多步）：
  1) 解析：扫描/分段 Thrift 结构（struct/enum/service/const 等）
  2) 分析：计算对齐宽度与规则（类型、字段名、等号、值、注释）
  3) 变换：根据配置应用缩进、对齐、尾随逗号与集合展开策略
  4) 输出：生成格式化文本，保持语义不变
- 跳转到定义：
  - 构建 include 依赖图，按相对路径解析目标文件
  - 在目标文件中进行符号表/模式匹配，定位标识符定义位置
- 配置驱动：
  - 关键配置见 package.json 的 contributes.configuration（已在本开发指南“版本要求”与“常见问题”中强调）
- 性能与稳定性：
  - 对齐计算按块进行，避免全文件多次回扫
  - 解析过程容错，对异常片段尽量不破坏原有布局

## 快速开始
```bash
# 安装依赖（首次或依赖变更后）
npm install

# 编译 TypeScript
npm run compile

# 开发监听模式
npm run watch

# 运行主要测试
npm run test

# 全量测试
npm run test:all
```

## 常用脚本
- 构建：`npm run build`（等同 clean + compile）
- 清理：`npm run clean`
- 打包 VSIX：`npm run package`（调用 vsce package）
- 本地发布：`npm run publish`（调用 vsce publish，需 VSCE_PAT）

## 本地打包与发布（可选）
- 仅验证产物：执行 `npm run package`，生成 `.vsix` 文件，可在 VS Code 中手动安装测试。
- 本地直发 Marketplace：执行 `npm run publish`，需在环境变量或 CI Secrets 中配置 VSCE_PAT；Open VSX 需使用 ovsx CLI 或交由 CI 发布（推荐）。

## CI/CD 工作流（精简说明）
本仓库使用两条 GitHub Actions 流水线自动完成“版本生成 → 发布”：

- release-please（.github/workflows/release-please.yml）
  - 触发：推送到 master、或手动触发（workflow_dispatch）
  - 作用：根据 Conventional Commits 生成/更新 Release PR；合并后创建 Git Tag + GitHub Release

- publish（.github/workflows/publish.yml）
  - 触发：GitHub Release 发布（released: published）、或手动触发（workflow_dispatch）
  - 作用：安装依赖 → 构建 → 打包 VSIX →（可选）上传到 GitHub Release → 发布到 VS Code Marketplace 与 Open VSX
  - 凭据：VSCE_PAT（Marketplace）、OVSX_PAT（Open VSX），以及内置 GITHUB_TOKEN（上传 Release 附件）

建议流程：功能分支开发 → 合并到 master → 等待/审阅 release-please 生成的 Release PR → 合并 Release PR → 触发 publish 自动发布。

## 提交与分支规范
- 提交信息遵循 Conventional Commits（feat/fix/docs/chore/refactor/perf 等），以便 release-please 正确生成版本与变更日志。
- 默认分支为 master（release-please.yml 已配置 default-branch: master）。

## 常见问题排查
- Node 版本不一致导致 npm ci/install 报错：请切换到 Node 22.18.0 再执行。
- package-lock.json 与 package.json 不同步：在 Node 22.18.0 下执行 `npm install` 修复锁文件并提交。
- 市场命名空间：由 package.json 的 publisher（当前为 tanzz）与 name 决定，令牌需具备对应命名空间的发布权限。
