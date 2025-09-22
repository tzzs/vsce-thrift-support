# Thrift Support for VSCode — 开发指南

本文件仅保留面向开发者的必要信息，帮助你在本地开发、构建、测试与发布扩展。

## 版本要求（务必统一）
- Node.js: 22.18.0（与 CI 一致）
- VS Code 引擎: ^1.74.0（与 package.json engines.vscode 一致）
- TypeScript: ^4.9.4（与 devDependencies 一致）
- @vscode/vsce: ^3.6.0（用于本地打包/发布，已从旧版 vsce 升级）

提示：如本地 Node 版本不同，可能导致安装或构建失败（如 undici 要求 Node >= 20.18.1）。建议使用 nvm-windows/Volta 等工具固定 Node 版本。

### vsce 升级说明
项目已从旧版 `vsce` 升级到新版 `@vscode/vsce` 3.6.0，主要变化：
- 包名从 `vsce` 更改为 `@vscode/vsce`
- 新增安全性增强：打包时会扫描潜在的敏感信息（API 密钥等）
- 改进标签处理：支持标签名包含点号
- 更好的错误处理和依赖项更新
- 要求 Node.js >= 20.x.x（本项目使用 22.18.0 满足要求）

## 项目架构与设计

### 目录结构（简）
```
thrift-support/
├── src/
│   ├── extension.ts            # 扩展入口，注册能力与命令
│   ├── formatter.ts            # 格式化核心逻辑
│   ├── definitionProvider.ts   # 跳转到定义/引用解析
│   ├── codeActions.ts          # 提供抽取类型/移动类型等重构 Code Actions
│   └── refactor.ts             # 重命名（RenameProvider），与重构命令关联
├── syntaxes/
│   └── thrift.tmLanguage.json  # 语法高亮的 TextMate 语法
├── language-configuration.json # 语言括号/注释等配置
├── tests/                      # 测试脚本（包括 test-rename-provider.js / test-code-actions-provider.js）
└── test-files/                 # 示例与测试用 Thrift 文件
```

### 模块划分
- 扩展入口（Extension）— <mcfile name="extension.ts" path="src/extension.ts"></mcfile>
  - 激活时机：onLanguage:thrift
  - 注册命令与提供者（格式化、跳转到定义、重命名、Code Actions）
  - 暴露/绑定重构命令：`thrift.refactor.extractType`、`thrift.refactor.moveType`
  - 读取并响应配置变更

- 格式化器（Formatter）— <mcfile name="formatter.ts" path="src/formatter.ts"></mcfile>
  - 负责文档/选区格式化、对齐策略、缩进与行长控制
  - 受配置项影响（如 alignTypes/alignFieldNames/alignComments/trailingComma/indentSize/maxLineLength/collectionStyle 等）

- 定义提供器（Definition Provider）— <mcfile name="definitionProvider.ts" path="src/definitionProvider.ts"></mcfile>
  - 解析 include 关系与跨文件符号定位
  - 支持工作区范围的跳转到定义

- 重命名与重构（Refactor）— <mcfile name="refactor.ts" path="src/refactor.ts"></mcfile>, <mcfile name="codeActions.ts" path="src/codeActions.ts"></mcfile>
  - `refactor.ts` 提供 RenameProvider：统一实现标识符重命名（F2）
  - `codeActions.ts` 提供重构 Code Actions：抽取类型、移动类型等，并与注册的命令协作

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

### 格式化器配置与优先级（重要）
核心逻辑集中在 <mcfile name="formatter.ts" path="src/formatter.ts"></mcfile> 中。

- 对齐选项：
  - alignTypes / alignFieldNames（外部配置键为 alignNames）：控制类型与字段名的列对齐。
  - 等号/值对齐（Assignments）：由总开关 alignAssignments 统筹；开启时对齐 struct 字段等号与 enum 等号/枚举值；未显式设置时使用各自默认（struct 等号默认关闭、enum 等号/值默认开启）。
  - alignStructDefaults：仅控制 struct 字段“默认值”的等号对齐，独立于 alignAssignments（不随总开关联动）。
  - alignComments：控制“行尾内联注释”的列对齐（例如 // comment）。当其为 false 时不会主动为注释添加对齐填充；但若其它内容（如类型/字段名/注解）恰好等宽，注释列可能“看起来对齐”，这是偶然一致而非 formatter 强制对齐所致。
  - alignAnnotations（主键）与 alignStructAnnotations（兼容别名，已弃用）：
    - 若 alignAnnotations 显式设置，则优先生效；
    - 否则回退到 alignStructAnnotations 的值（默认 true）；
    - 用于控制结构体字段上的圆括号注解（如 (key='value')）是否对齐。
    
    alignAnnotations (primary) and alignStructAnnotations (legacy alias, deprecated):
    - alignAnnotations takes precedence when explicitly set;
    - otherwise falls back to alignStructAnnotations (default true);
    - controls alignment of parentheses annotations on struct fields, e.g. (key='value').
- 尾随逗号（trailingComma）：支持 add | remove | preserve。
  - 规则与分号协同：当行以分号 ; 结束时，视为语句终止，formatter 会尊重分号，不会再强行追加或替换为逗号。
- 其它常见项：
  - indentSize、maxLineLength、collectionStyle（preserve/inline/multiLine）等。

以上选项共同决定“最大内容宽度”和各列的目标对齐位置，详细实现与宽度计算请参考 <mcfile name="formatter.ts" path="src/formatter.ts"></mcfile>。

### 语言规范同步（IDL 0.23）与实现更新
- 背景：自 Apache Thrift IDL 0.23 起，uuid 被纳入内建基础类型（BaseType）。
- 代码同步点：
  - <mcfile name="diagnostics.ts" path="src/diagnostics.ts"></mcfile>
    - 基本类型集合包含 `uuid`
    - 改进字段解析：剥离类型后缀注解、跨行注释剥离，避免在注释中做括号/语法检查
    - 以健壮解析提取字段类型与名称，支持嵌套容器与 required/optional 标志
  - <mcfile name="definitionProvider.ts" path="src/definitionProvider.ts"></mcfile>
    - `isPrimitiveType` 集合包含 `uuid`，防止误将其当作用户类型做“跳转到定义”
  - <mcfile name="thrift.tmLanguage.json" path="syntaxes/thrift.tmLanguage.json"></mcfile>
    - `storage.type.primitive.thrift` 的匹配正则包含 `uuid`，确保语法高亮正确
- 测试建议：
  - 在 <mcfolder name="test-files" path="test-files/"></mcfolder> 添加/复用示例：
    - struct/const/typedef 中直接使用 `uuid` 作为字段或常量类型
    - 交叉验证 `diagnostics` 不再报“未知类型”
    - 验证 `Go to Definition` 在 `uuid` 上不进行跳转（因其为基元类型）
    - 语法高亮对 `uuid` 呈现与其它基元一致的着色
  - 运行：`npm run test` / `npm run test:all`；必要时补充端到端用例

## 参考规范与示例
- Apache Thrift IDL 文档: https://thrift.apache.org/docs/idl
- 官方测试 IDL 示例（ThriftTest.thrift）: https://raw.githubusercontent.com/apache/thrift/master/test/ThriftTest.thrift

### 测试与新增用例说明
主要测试脚本位于 <mcfile name="tests" path="tests/"></mcfile> 目录，格式化相关的组合测试集中在 <mcfile name="test-struct-annotations-combinations.js" path="tests/test-struct-annotations-combinations.js"></mcfile>。

新增/强化的用例（便于回归理解）：
- test_struct_comments_not_aligned_when_disabled：关闭 alignComments、对齐注解以及其它对齐项，验证注释列不会被强制对齐，避免“偶然对齐”造成的脆弱断言。
- test_struct_annotations_trailing_comma_remove_and_semicolon_preserve：在 remove 模式下，确保逗号被移除而分号被保留，并且注解列仍能正确对齐。
- test_struct_comment_alignment_only_comments_true：仅开启 alignComments，关闭其余对齐项，验证注释列在孤立条件下仍会被对齐。

如何运行单个测试文件（便于开发调试）：
```bash
node tests/test-struct-annotations-combinations.js
```
或使用覆盖率脚本一次性查看总体效果：
```bash
npm run coverage
```

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

# 生成覆盖率报告（控制台摘要 + coverage/ 覆盖率目录）
npm run coverage

# 仅运行常量相关测试（如有）
npm run test:const
```

## 本地打包与发布（可选）
- 仅验证产物：执行 `npm run package`，生成 `.vsix` 文件，可在 VS Code 中手动安装测试。
- 本地直发 Marketplace：执行 `npm run publish`，需在环境变量或 CI Secrets 中配置 VSCE_PAT；Open VSX 需使用 ovsx CLI 或交由 CI 发布（推荐）。

注意：项目已升级到 `@vscode/vsce` 3.6.0，脚本命令已更新为使用 `npx @vscode/vsce`。如果遇到打包时的安全扫描警告，可以使用 `--allow-package-secrets` 或 `--allow-package-env-file` 标志绕过检查。

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

## 变更日志规范与发布流程

### 如何撰写 CHANGELOG（强烈建议使用模板）
- 模板文件：参见仓库根目录的 [changelog_template.md](./changelog_template.md)。
- 结构要求：双语（中文/English）并使用固定分节：
  - 中文版本：新功能 / 错误修复 / 性能优化（必要时可加“其他”）
  - English Version: Features / Bug Fixes / Performance Improvements
- 书写规则：
  - 要点一行式；保持简洁、可读；必要时附上提交链接或 PR 链接。
  - 与既有条目保持一致的语气与措辞，尽量沿用“动词开头”的风格（如：Add/Fix/Improve）。
  - 链接稳定性：保留 compare 链接与提交链接的现有格式，避免破坏历史引用。
- 写作时机：
  - 日常开发阶段优先坚持 Conventional Commits（feat/fix/docs/chore/refactor/perf 等）；
  - 如需“策划式/双语化”说明，建议在 release-please 创建的 Release PR 中直接编辑 CHANGELOG.md，再合并。

### 发布流程 Checklist
1) 确保本地环境一致（Node 22.18.0），安装依赖并通过所有检查：
   - npm run lint
   - npm run build
   - npm test 或 npm run test:all
2) 更新变更日志（如需人工补充）：
   - 参照 [changelog_template.md](./changelog_template.md) 的双语结构与一行式要点
   - 确认 compare 链接、提交链接与版本号无误
3) 提交并推送：
   - 遵循 Conventional Commits（例如：docs(changelog): update 0.x.y entry with bilingual sections）
4) 等待 release-please 生成/更新 Release PR：
   - 在该 PR 中再次审阅 CHANGELOG（可继续微调用语/结构）
   - 合并 Release PR 后将自动创建 Tag 与 GitHub Release
5) 发布流水线（publish.yml）将自动构建并发布到 VS Marketplace 与 Open VSX。

### 快速命令（本地辅助）
```bash
# Lint / Build / Test（发布前自检）
npm run lint && npm run build && npm test

# 生成 VSIX（本地验证产物）
npm run package
```

- 提交信息遵循 Conventional Commits（feat/fix/docs/chore/refactor/perf 等），以便 release-please 正确生成版本与变更日志。
- 默认分支为 master（release-please.yml 已配置 default-branch: master）。

## 常见问题排查
- Node 版本不一致导致 npm ci/install 报错：请切换到 Node 22.18.0 再执行。
- package-lock.json 与 package.json 不同步：在 Node 22.18.0 下执行 `npm install` 修复锁文件并提交。
- 市场命名空间：由 package.json 的 publisher（当前为 tanzz）与 name 决定，令牌需具备对应命名空间的发布权限。
