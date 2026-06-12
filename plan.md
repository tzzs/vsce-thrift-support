# Thrift Support 市场与平台优化实施计划

> **给后续 agent 工作者：** 实施本计划时必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`。任务使用 checkbox（`- [ ]`）跟踪。

**目标：** 将 2026-06-11 的市场调研和 VS Code 生态趋势分析转化为可执行路线图，提升 Thrift Support 的公开信任面、语言体验、平台覆盖、安全姿态和后续 Agent 集成能力。

**架构原则：** 保留当前直接注册 VS Code Provider 的架构，并继续以 `packages/core` 作为可复用语言核心。先补齐用户可见的产品化和信任面，再以小 Provider 增量扩展编辑器能力；Web、MCP、AI 能力必须放在明确的兼容性和安全边界之后推进。

**技术栈：** TypeScript、VS Code Extension API、Node 24.x、pnpm 11.5.0、Mocha、GitHub Actions、`@vscode/vsce`、Open VSX、npm CLI 包，以及后续受控接入的 VS Code AI/MCP API。

---

## 当前快照

- **快照日期：** 2026-06-11
- **本地 worktree 版本：** 当前 `package.json` 显示 `3.0.0`。
- **线上状态差异：** Open VSX API 查询到 `tanzz.thrift-support` 已是 `3.1.0`；后续实现分支在开始前必须确认是否已同步最新 `master`。
- **Marketplace 竞争态势：** `thrift` 搜索结果仍主要由旧的语法高亮、格式化和早期 language-server 插件占据安装量优势。
- **当前插件定位：** 本项目已经具备 parser、formatter、diagnostics、navigation、completion、rename/refactor、semantic tokens、hierarchy providers、CLI、性能门禁和 package smoke checks。剩余重点不再是“有没有基础能力”，而是产品信任、可发现性、现代编辑器体验、平台兼容和 Agent 生态适配。

## 外部信号

- Visual Studio Marketplace Gallery API（2026-06-11）显示：
  - `cduruk.thrift`：约 82k installs，基础语法高亮，2016 年后未更新。
  - `mrkou47.thrift-syntax-support`：约 26k installs，支持 syntax/definition/completion/hover，最后更新 2023。
  - `alingse.thirft-formatter`：formatter-focused，约 4k installs，最后更新 2023。
  - `jiangpengfei.thrift-language-server`：LSP-based，安装量低于 1k，功能列表覆盖 highlight/completion/definition/references/hover/diagnostics/rename/format。
  - `ocfbnj.thrift-ls`：较新的 language-server 插件，但安装量仍低。
- VS Code 1.124（2026-06-10）发布说明强调 Agents、Autopilot、background sessions，以及更高自治度的 agent workflow。
- VS Code 官方文档当前重点包括 Programmatic Language Features、Web Extensions、Workspace Trust、pre-release/platform-specific publishing、Language Model API、Chat Participant API 和 MCP developer support。
- Apache Thrift 官方 IDL 文档当前描述的是 `0.24.0`，且 `uuid` 已在 `BaseType` 中。
- 最近 VS Code/Open VSX 扩展安全事件表明：恶意扩展、不可见 Unicode、文件泄露和供应链攻击已经成为企业采用扩展时的核心顾虑。

## 路线图概览

| 优先级 | 领域 | 目标 |
| --- | --- | --- |
| P0 | 产品化与公开信任面 | 提高 Marketplace 转化率，并降低企业用户采用阻力 |
| P0 | Apache Thrift 0.24 规范跟进 | 避免 parser、diagnostics、grammar、docs、CLI 之间的语言漂移 |
| P1 | 高频语言体验缺口 | 补齐通用语言扩展用户自然期待的能力 |
| P1 | Workspace diagnostics parity | 让 VS Code Problems 与 CLI lint 在大型工作区中更可信 |
| P1 | Web/Remote/Codespaces | 在 `vscode.dev`、`github.dev`、Codespaces 中提供安全子集 |
| P2 | AI/MCP readiness | 为 Agent 提供只读、领域化上下文工具 |
| P2 | 安全与企业治理 | 明确 Workspace Trust、供应链和包内容边界 |
| P3 | LSP 策略记录 | 避免为了趋势盲目重写，同时保留未来复用路径 |

---

## 任务 1：P0 产品化与 Marketplace 信任面

**文件范围：**
- 修改：`package.json`
- 修改：`README.md`
- 修改：`README.zh-CN.md`
- 修改：`DEVELOPMENT.md`
- 修改：`PERFORMANCE.md`
- 修改：`TROUBLESHOOTING.md`
- 新增：`SECURITY.md`
- 新增：`docs/settings-reference.md`
- 新增：`docs/release-verification.md`
- 新增：`docs/assets/marketplace/format-diagnostics.png`

- [x] **步骤 1：确认当前 package 与 release 元数据**

运行：

```bash
node -e "const p=require('./package.json'); console.log({version:p.version, packageManager:p.packageManager, engines:p.engines, publisher:p.publisher})"
rg -n "Node 22|Node 24|pnpm 10|pnpm 11|2\\.2\\.0|workflow_dispatch|publish.yml|ci.yml|IDL 0\\.23|IDL 0\\.24" README.md README.zh-CN.md DEVELOPMENT.md PERFORMANCE.md TROUBLESHOOTING.md package.json .github
```

验收：

- 先记录当前版本、package manager、engine 和 publisher。
- 在改动前列出所有版本漂移和发布文档漂移位置。

- [x] **步骤 2：补齐 Marketplace 信任元数据**

在 `package.json` 中补充显式元数据：

```json
{
  "license": "MIT",
  "bugs": {
    "url": "https://github.com/tzzs/vsce-thrift-support/issues"
  },
  "homepage": "https://github.com/tzzs/vsce-thrift-support#readme",
  "qna": "https://github.com/tzzs/vsce-thrift-support/discussions",
  "galleryBanner": {
    "color": "#1E1E1E",
    "theme": "dark"
  },
  "pricing": "Free"
}
```

保持现有 publisher、repository、categories 和 keywords，除非新的 Marketplace 查询证明存在明确关键词缺口。

- [x] **步骤 3：修正 README 首屏和 badge**

更新 `README.md` 与 `README.zh-CN.md`，首屏需要清晰分离：

- VS Marketplace version/install badges。
- Open VSX version/download badges。
- 指向 `.github/workflows/ci.yml` 的 CI 质量门禁 badge。
- 指向 `.github/workflows/publish.yml` 的 publish/release badge。
- 一段简短能力描述：language intelligence、formatter、diagnostics、refactor、CLI、performance gates。

在 `docs/assets/marketplace/format-diagnostics.png` 添加一张可用于 README/Marketplace 的视觉证明图。图片应至少展示两个能力：diagnostics squiggles、formatter output、definition/reference navigation、completion、Quick Fix。

- [x] **步骤 4：发布设置参考文档**

从 `package.json#contributes.configuration` 创建 `docs/settings-reference.md`，内容包含：

- `thrift.format.*` 的默认值和示例。
- `thrift.diagnostics.rules` 的关闭规则与调整 severity 示例。
- 仍然支持的 legacy fallback 行为。
- 指向 `docs/diagnostics-rules.md` 的链接。

验证命令：

```bash
node -e "const p=require('./package.json'); const keys=Object.keys(p.contributes.configuration.properties); console.log(keys.join('\n'))"
```

验收：

- 命令输出的每个配置 key 都能在 `docs/settings-reference.md` 中找到。

- [x] **步骤 5：新增发布与验证说明**

创建 `docs/release-verification.md`，说明真实发布链路：

- release-please 生成版本变更。
- GitHub Release published 事件触发 `publish.yml`。
- `publish.yml` 打包 VSIX 并发布到 Visual Studio Marketplace、Open VSX、npm。
- CI 门禁包含 lint、build、test、coverage、CLI dogfood、package smoke 和 performance assertions。

不要写 `workflow_dispatch` 发布能力，除非 workflow 实际支持。

- [x] **步骤 6：新增安全披露入口**

创建 `SECURITY.md`，内容包含：

- 支持版本策略。
- 漏洞报告路径：GitHub Security Advisories；如果没有私有联系方式，不要虚构。
- 仅在源码确认后声明“无 telemetry”。
- dependency、VSIX、npm、Open VSX 供应链姿态。
- Workspace Trust 和 untrusted workspace 当前行为。

- [x] **步骤 7：产品化变更验证**

运行：

```bash
git diff --check
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"
npm run smoke:package
```

验收：

- 无 whitespace 错误。
- `package.json ok`。
- package smoke 通过。

---

## 任务 2：P0 Apache Thrift IDL 0.24 规范跟进

**文件范围：**
- 修改：`README.md`
- 修改：`README.zh-CN.md`
- 修改：`docs/advanced-features.md`
- 修改：`docs/diagnostics-rules.md`
- 修改：`docs/annotation-policy.md`
- 修改：`syntaxes/thrift.tmLanguage.json`
- 检查：`language-configuration.json`
- 修改：`packages/core/src/**`
- 修改：`packages/vscode/src/**`
- 检查：`packages/cli/src/**`
- 新增或修改测试：`tests/src/**`

- [x] **步骤 1：创建 IDL 0.24 对齐说明**

在 `docs/advanced-features.md` 中新增 `Apache Thrift IDL 0.24 Alignment` 小节，并链接：

- `https://thrift.apache.org/docs/idl`
- `https://thrift.apache.org/docs/types`

记录本插件对以下语法/语义的支持状态：

- `uuid`
- `stream`
- `sink`
- `interaction`
- `performs`
- `reference`
- `cpp_include`
- `cpp_type`
- list separators `,` 和 `;`
- reserved keywords

- [x] **步骤 2：替换陈旧 IDL 0.23 描述**

运行：

```bash
rg -n "IDL 0\\.23|Thrift 0\\.23|0\\.23" README.md README.zh-CN.md docs packages syntaxes tests
```

验收：

- 所有过时引用都更新为 `IDL 0.24`，或明确标为历史背景。

- [x] **步骤 3：增加规范对齐 fixtures**

在 `tests/src/parser/test-files/` 及相关 diagnostics/highlighting 测试中新增或刷新 fixture，覆盖：

```thrift
namespace * example
cpp_include "custom/header.h"

typedef uuid UserId
typedef map<string, list<UserId>> UserMap

struct User {
    1: required UserId id;
    2: optional string name = "anonymous";
}

service UserService {
    User getUser(1: UserId id) throws (1: UserNotFound error);
}

exception UserNotFound {
    1: string message;
}
```

同时增加：

- 一个包含非法 enum 值的 fixture。
- 一个同时使用逗号和分号 list separator 的 fixture。

- [x] **步骤 4：修正 README 与规则目录漂移**

重点审计这些已知漂移：

- README 声称 enum value 必须是非负整数，但当前规则目录可能只有 `enum.valueNotInteger`。
- `docs/advanced-features.md` 提到 `thrift.tmLanguage-enhanced.json`，但 `package.json` 实际贡献的是 `syntaxes/thrift.tmLanguage.json`。
- `reference` 在文档中的宣传可能强于 completion 当前支持。

每个漂移点必须在同一个 PR 中选择一种处理方式：

- 实现文档声称的行为并补测试。
- 或收窄文档，只描述当前真实行为。

- [x] **步骤 5：增加规范漂移防护**

增加一个小测试或脚本，至少验证 core primitive keywords 与 grammar primitive scopes 对齐：

```text
bool byte i8 i16 i32 i64 double string binary uuid void
```

运行：

```bash
npm run lint:fix
npm run build
npm run test:single -- tests/src/test-grammar-tokenization.js
npm test
```

验收：

- grammar tokenization 测试通过。
- 完整测试套件通过。

---

## 任务 3：P1 高频语言体验缺口

**文件范围：**
- 修改：`package.json`
- 修改：`packages/vscode/src/setup.ts`
- 检查：`packages/vscode/src/utils/dependencies.ts`
- 新增：`packages/vscode/src/signature-help-provider.ts`
- 新增：`packages/vscode/src/inlay-hints-provider.ts`
- 新增：`packages/vscode/src/code-lens-provider.ts`
- 新增：`packages/vscode/src/include-organizer.ts`
- 修改：`packages/vscode/src/code-actions-provider.ts`
- 修改：`packages/vscode/src/rename-provider.ts`
- 新增测试：`tests/src/signature-help-provider/`、`tests/src/inlay-hints-provider/`、`tests/src/code-lens-provider/`、`tests/src/code-actions-provider/`、`tests/src/rename-provider/`

- [ ] **步骤 1：实现 service method signature help**

注册：

```typescript
vscode.languages.registerSignatureHelpProvider('thrift', provider, '(', ',');
```

行为要求：

- 在 service 和 interaction method 参数列表内展示 field id、requiredness、type、name、throws 签名。
- 优先使用 `packages/core` AST 和已注入的 `WorkspaceIndex`。
- 非 service/interaction 方法参数上下文返回空结果。

最小测试：

- `getUser(` 后显示 signature help。
- 逗号后 active parameter 正确变化。
- throws 列表不干扰参数索引。
- cancellation 不返回过期结果。

- [ ] **步骤 2：增加低噪音 inlay hints**

默认配置：

```json
{
  "thrift.inlayHints.requiredness": false,
  "thrift.inlayHints.includeAliases": false,
  "thrift.inlayHints.serviceOverrides": true
}
```

首批 hints：

- 未显式写 requiredness 的字段展示 `default`。
- 跨文件类型引用展示 resolved include alias。
- service extends 链上的 method 展示 override source。

要求：

- hint 不修改文档文本。
- comment/string literal 内不显示 hint。
- 大文件处理尊重 cancellation。

- [ ] **步骤 3：增加高信号 CodeLens**

只提供有导航价值的 CodeLens：

- 顶层 `struct`、`union`、`exception`、`enum`、`typedef`、`service`、`interaction` 的引用计数。
- `extends` 链中 service method override 计数。

避免为每个 field 增加低价值 CodeLens。

- [ ] **步骤 4：增加 include organization**

新增命令：

```text
Thrift: Organize Includes
Thrift: Remove Unused Includes
```

支持：

- unknown type 且 workspace 中有唯一命中时插入 include。
- 移除 unused include。
- 排序 include block，并保留注释和 header 分组。

- [ ] **步骤 5：增强 rename 校验**

`ThriftRenameProvider.prepareRename` 应拒绝：

- primitive types。
- reserved keywords。
- 非法 identifier。
- 与同 scope 顶层 symbol 冲突的新名字。
- 与同 struct/union/exception 的 field 或同 enum 的 member 冲突的新名字。

- [ ] **步骤 6：扩展 Quick Fix 覆盖**

补齐可确定修复的规则：

- `service.oneway.hasThrows`：删除 throws clause。
- `service.throws.notException`：仅在目标类型为本地 struct 且 range 安全时提供转换。
- `syntax.unclosed`：仅在 opener 和 insertion point 明确时插入 closer。
- `enum.negativeValue`：在任务 2 创建或确认该规则后，改为下一个非负值。

---

## 任务 4：P1 Workspace Diagnostics 与 CLI Parity

**文件范围：**
- 修改：`packages/vscode/src/diagnostics/**`
- 修改：`packages/vscode/src/indexing/workspace-index.ts`
- 修改：`packages/cli/src/**`
- 修改：`packages/core/src/diagnostics/**`
- 新增测试：`tests/src/diagnostics/`
- 新增 CLI 测试：`tests/cli/`

- [ ] **步骤 1：定义 workspace diagnostics 模式**

新增配置：

```json
{
  "thrift.diagnostics.workspaceMode": "openFiles"
}
```

支持值：

- `openFiles`：当前保守行为。
- `workspace`：在 workspace file limit 内扫描 `.thrift` 文件。
- `off`：禁用 extension diagnostics，但保留 CLI lint。

- [ ] **步骤 2：复用 CLI diagnostics engine**

VS Code workspace diagnostics 与 `thrift-support lint` 必须共享：

- Rule IDs。
- Severity mapping。
- Include resolution。
- Config normalization。
- Default value checking。

- [ ] **步骤 3：让 workspace scan 可取消且有边界**

要求：

- 尊重 workspace file limit。
- 尊重 cancellation token。
- 避免对有 unsaved content 的 open document 重复发布过期 diagnostics。
- include graph 变化后 debounce broad scan。

- [ ] **步骤 4：增加 diagnostics 状态命令**

新增命令：

```text
Thrift: Show Diagnostics Status
```

报告：

- Workspace mode。
- Indexed `.thrift` 文件数量。
- 有 diagnostics 的文件数量。
- 最近一次 scan duration。
- 按数量排序的主要 rule IDs。

---

## 任务 5：P1 Web、Remote 与 Codespaces 兼容

**文件范围：**
- 修改：`package.json`
- 修改：`build.js`
- 修改：`packages/vscode/src/extension.ts`
- 新增：`packages/vscode/src/web/extension.ts`
- 新增：`packages/vscode/src/platform/fs.ts`
- 新增：`packages/vscode/src/platform/node-fs.ts`
- 新增：`packages/vscode/src/platform/web-fs.ts`
- 新增：`tests/package-web-smoke.js`

- [ ] **步骤 1：定义 Web 支持子集**

Web mode 首批支持：

- Syntax grammar 和 language configuration。
- 使用 bundled core code 的 formatter。
- open file parser-backed diagnostics。
- Document symbols。
- 基于当前文档 symbol 的 hover 和 completion。

Web mode 首批不宣称支持：

- Node filesystem scanning。
- 不可用文件系统上的完整 workspace include graph。
- CLI execution。
- Garbage collection command。
- 任何依赖 shell 的行为。

- [ ] **步骤 2：增加平台文件系统抽象**

新增薄层抽象：

- Web/remote-safe 读取使用 `vscode.workspace.fs`。
- Node filesystem API 只保留在 desktop Node extension host adapter 中。

Provider 代码不应直接 import Node `fs`，Node adapter 除外。

- [ ] **步骤 3：增加 browser entry**

在 `package.json` 中增加：

```json
{
  "browser": "./dist/web/extension.js"
}
```

desktop bundle 与 web bundle 使用独立输出。

- [ ] **步骤 4：隐藏不支持的命令**

Web mode 中隐藏或禁用：

- `thrift.showMemoryReport`
- `thrift.forceGarbageCollection`
- 当前文件系统不支持时的 full workspace scan

---

## 任务 6：P2 AI 与 MCP Readiness

**文件范围：**
- 修改：`package.json`
- 修改：`pnpm-workspace.yaml`
- 修改：`packages/core/src/**`
- 新增：`packages/vscode/src/ai/chat-participant.ts`
- 新增：`packages/vscode/src/ai/language-model-tools.ts`
- 新增：`packages/mcp/package.json`
- 新增：`packages/mcp/src/server.ts`
- 新增：`docs/ai-and-agent-integration.md`
- 新增测试：`tests/src/ai/`
- 新增测试：`packages/mcp/test/`

- [ ] **步骤 1：第一版只暴露只读工具**

首批只读能力：

- 解析当前文档并总结 top-level symbols。
- 按 rule id 解释 diagnostic。
- 返回某个文件的 include graph。
- 按名称查找 symbol definition。
- 在内存中运行 format check，不写文件。
- 为 CI 集成返回 CLI command 建议。

第一版不提供写文件工具。

- [ ] **步骤 2：先交付独立 MCP 包**

先创建 `packages/mcp`，保持主扩展 `engines.vscode` 稳定，同时评估 VS Code Chat Participant 和 Language Model API 的最低稳定版本要求。

- [ ] **步骤 3：注册 MCP server 前先完成 trust review**

如果后续从 extension 注册 MCP server，使用：

- `contributes.mcpServerDefinitionProviders`
- `vscode.lm.registerMcpServerDefinitionProvider`

所有首批工具都应标注：

```json
{
  "readOnlyHint": true
}
```

---

## 任务 7：P2 安全、Workspace Trust 与供应链

**文件范围：**
- 修改：`package.json`
- 修改：`.github/workflows/ci.yml`
- 修改：`.github/workflows/publish.yml`
- 新增：`SECURITY.md`（如果任务 1 尚未创建）
- 新增：`docs/security-model.md`
- 新增：`scripts/check-invisible-unicode.js`
- 新增测试：`tests/src/security/`

- [ ] **步骤 1：声明 Workspace Trust 能力**

建议初始声明：

```json
{
  "capabilities": {
    "untrustedWorkspaces": {
      "supported": "limited",
      "description": "Thrift syntax, formatting, and open-file analysis are available in Restricted Mode. Workspace-wide indexing, include traversal, and generated reports may be limited until the workspace is trusted.",
      "restrictedConfigurations": [
        "thrift.diagnostics.workspaceMode"
      ]
    }
  }
}
```

- [ ] **步骤 2：增加不可见 Unicode 扫描**

新增 `scripts/check-invisible-unicode.js`，扫描：

- `packages/**`
- `syntaxes/**`
- `language-configuration.json`
- `package.json`
- `.github/**`
- `scripts/**`

允许 fixture 路径：

- `tests/fixtures/security/invisible-unicode/**`

- [ ] **步骤 3：接入 CI 安全检查**

新增 CI 步骤：

```bash
node scripts/check-invisible-unicode.js
pnpm audit --audit-level high
```

- [ ] **步骤 4：记录扩展安全模型**

新增 `docs/security-model.md`，覆盖：

- 当前架构没有 language-server subprocess。
- Workspace file reads 和 include traversal。
- CLI 写操作边界。
- Workspace Trust 行为。
- AI/MCP 行为边界。
- Release provenance 和 package smoke gates。

---

## 任务 8：P2 Release Channels 与 Adoption Feedback

**文件范围：**
- 修改：`package.json`
- 修改：`.github/workflows/publish.yml`
- 新增：`.github/workflows/pre-release.yml`
- 新增：`docs/release-channels.md`
- 新增：`scripts/marketplace-metrics.js`

- [ ] **步骤 1：记录 pre-release channel 决策**

文档化：

- stable release 尽量使用偶数 minor。
- pre-release 尽量使用奇数 minor。
- pre-release publishing 使用 `vsce publish --pre-release`。
- 启用自动发布前明确 Open VSX 和 npm 行为。

- [ ] **步骤 2：增加 adoption metric 脚本**

`scripts/marketplace-metrics.js` 查询：

- Visual Studio Marketplace Gallery API 的 `tanzz.thrift-support`。
- Open VSX API 的 `tanzz/thrift-support`。

输出 JSON：

```json
{
  "visualStudioMarketplace": {
    "version": "x.y.z",
    "installs": 0,
    "ratingCount": 0
  },
  "openVsx": {
    "version": "x.y.z",
    "downloads": 0
  }
}
```

网络失败时以非 0 exit code 和清晰错误退出。

---

## 任务 9：P3 LSP 策略 ADR

**文件范围：**
- 新增：`docs/adr/0001-lsp-strategy.md`
- 修改：`ARCHITECTURE.md`
- 修改：`docs/PROJECT_MAP.md`

- [ ] **步骤 1：记录当前决策**

ADR 结论：

- 主扩展继续使用直接 VS Code Provider 架构。
- 不为了趋势本身重写为 LSP。
- 继续把可复用语言逻辑沉淀到 `packages/core`。
- 只有出现明确的 VS Code 之外目标时才重新评估 LSP，例如 Zed、Neovim、JetBrains、远程分析服务，或需要编辑器无关协议的共享 MCP server。

- [ ] **步骤 2：定义 LSP readiness 边界**

LSP 可行前需要稳定的 core API：

- Parse document。
- Format document and range。
- Compute diagnostics。
- Resolve include graph。
- Query symbols。
- Find definition and references。
- 不依赖 VS Code 类型的 rename planning。

---

## 建议 PR 边界

1. **PR A：产品化与 docs sync**
   - 仅任务 1。
   - 风险最低，Marketplace 收益最高。

2. **PR B：IDL 0.24 对齐**
   - 仅任务 2。
   - 需要 parser、diagnostics、grammar 测试。

3. **PR C：语言 UX Provider 包**
   - 任务 3 可拆成多个 PR：
     - Signature help。
     - Inlay hints + CodeLens。
     - Include organization + rename validation。

4. **PR D：Workspace diagnostics parity**
   - 仅任务 4。

5. **PR E：Web extension 子集**
   - 仅任务 5。

6. **PR F：Security 与 Workspace Trust**
   - 仅任务 7，或和任务 1 中的 `SECURITY.md` 合并处理。

7. **PR G：AI/MCP 只读上下文**
   - 任务 6 必须在 Workspace Trust 和 security docs 之后推进。

8. **PR H：Release channels 与 metrics**
   - 仅任务 8。

9. **PR I：LSP 策略 ADR**
   - 仅任务 9。

## 验证策略

文档-only PR：

```bash
git diff --check
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"
```

package metadata 或 Marketplace 变更：

```bash
npm run smoke:package
```

Provider、parser、diagnostics、formatter、CLI、安全脚本变更：

```bash
npm run lint:fix
npm run lint
npm run build
npm test
```

CLI 可见行为变更：

```bash
npm run coverage:cli
```

parser、formatter、diagnostics、cache、indexing、semantic tokens、hierarchy、workspace scan 变更：

```bash
npm run perf:benchmark
```

Web extension 变更：

```bash
npm run build:web
npm run smoke:package:web
```

## 首批推荐实施顺序

1. 任务 1：产品化与信任面。
2. 任务 2：IDL 0.24 对齐。
3. 任务 7：Workspace Trust 与安全模型。
4. 任务 3 步骤 1：signature help。
5. 任务 3 步骤 4 和 5：include organization 与 rename validation。
6. 任务 4：workspace diagnostics parity。
7. 任务 5：web extension 子集。
8. 任务 6：只读 AI/MCP 上下文。
9. 任务 8：release channels 与 metrics。
10. 任务 9：LSP 策略 ADR。
