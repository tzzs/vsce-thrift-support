# 项目优化 Roadmap 实施计划

> **面向 agentic workers：** 必须使用子技能：推荐使用 `superpowers:subagent-driven-development`，也可以使用 `superpowers:executing-plans`，按任务逐项执行本计划。步骤使用 checkbox（`- [ ]`）语法跟踪进度。

**目标：** 在不改变当前 monorepo 包边界的前提下，提升 Thrift VS Code 扩展、核心库和 CLI 的可维护性、正确性、功能完整度与发布信心。

**架构：** 继续保持 `packages/core` 承载纯 Thrift 解析、格式化、诊断逻辑，`packages/vscode` 承载 VS Code API 集成，`packages/cli` 承载命令行编排。只在多个 provider 重复扫描、解析或符号查找时引入共享服务。

**技术栈：** TypeScript、VS Code Extension API、Mocha、pnpm workspaces、esbuild、c8、TextMate grammar 测试。

---

## Review 发现

1. **工作区符号与索引逻辑在多个 provider 中重复实现。**
   - 证据：`packages/vscode/src/definition-provider.ts`、`packages/vscode/src/code-actions-provider.ts`、`packages/vscode/src/workspace-symbol-provider.ts`、`packages/vscode/src/references/*` 都各自扫描、解析、缓存或过滤工作区文件。
   - 风险：定义跳转、引用查找、Quick Fix、工作区符号、层级 provider 和补全之间结果可能不一致；大工作区会产生重复解析和搜索成本。

2. **重构命令仍然偏启发式，不是 AST-first。**
   - 证据：`packages/vscode/src/commands/refactoring.ts` 使用正则和字符串级大括号检查实现 extract/move。
   - 风险：嵌套泛型、注解、注释、typedef、service block 等场景可能被错误移动或替换。

3. **Parser 和诊断工具文件已经成为高风险维护点。**
   - 证据：`packages/core/src/ast/parser.ts` 超过 1600 行；`packages/core/src/diagnostics/rules/type-utils.ts` 超过 500 行。
   - 风险：新增 Thrift 语法支持时改动面过大；诊断边界问题需要触碰过多代码。

4. **诊断能力较完整，但还不是可配置的规则系统。**
   - 证据：`packages/core/src/diagnostics/rules/analyzer.ts` 直接调用规则组并返回扁平 issue。
   - 风险：用户无法在 VS Code 与 CLI 中一致地调整规则开关和严重级别。

5. **补全与 Quick Fix 尚未使用统一项目模型。**
   - 证据：补全主要使用当前文档 AST；未知类型 Quick Fix 会重新扫描工作区。
   - 风险：命名空间类型补全、include-aware 补全和高质量 Quick Fix 能力受限。

6. **文档仍保留旧的单包结构描述。**
   - 证据：`README.md`、`README.zh-CN.md`、`DEVELOPMENT.md` 仍描述 `src/` 为主项目结构；`DEVELOPMENT.md` 引用了 `package.json` 中不存在的 `npm run test:all`、`npm run test:const`。
   - 风险：新贡献者和 agent 可能按错误路径或无效命令工作。

7. **测试基础设施中存在默认 Mocha 契约之外的历史脚本和 debug runner。**
   - 证据：根目录 `tests/test-*.js`、`tests/debug/**`、`tests/run-all-unified.js`、`tests/run-individual-tests.js` 与规范测试 `tests/src/**/*.js` 并存。
   - 风险：稳定回归测试、手动复现脚本、过期工具之间边界不清。

8. **缓存、内存和性能工具需要更清晰的边界。**
   - 证据：`CacheManager`、`MemoryMonitor`、`OptimizedLRUCache`、`PerformanceMonitor` 以及 provider-local cache registration 都持有状态。
   - 风险：singleton 与状态交互难以测试；不同 provider 的失效策略不一致。

9. **CLI 与 VS Code 配置 schema 存在漂移风险。**
   - 证据：CLI 在 `packages/cli/src/config.ts` 读取 `.thriftrc.json`；VS Code 在 `packages/vscode/src/formatting-bridge/options.ts` 读取 `thrift.format.*` 和 legacy keys。
   - 风险：编辑器和 CI 的格式化/诊断行为可能不一致。

10. **导航与编辑器 UX 仍有功能补充空间。**
    - 候选能力：include `DocumentLinkProvider`、include-aware type completion、重复 field id 与 namespace/include 问题的 Quick Fix、高信号 CodeLens、annotation completion。

---

## Phase 0：仓库整理与文档校准

**文件：** `README.md`、`README.zh-CN.md`、`DEVELOPMENT.md`、`package.json`、`tests/README.md`、根目录历史测试/debug 文件。

- [ ] 将旧的 `src/` 结构描述替换为 `packages/core/src`、`packages/vscode/src`、`packages/cli/src`、`syntaxes`、`tests/src`。
- [ ] 删除或修正不存在的脚本引用：`npm run test:all`、`npm run test:const`。
- [ ] 增加测试分类文档：
  - 规范自动化测试：`tests/src/**/*.js`
  - CLI 测试：`tests/cli/**/*.js`
  - 性能测试：`tests/perf/**/*.js`
  - 手动/debug 脚本：`tests/debug/**` 或迁移后的 `tools/debug/**`
- [ ] 决定 legacy root-level `tests/test-*.js` 是提升为 Mocha 测试，还是移动到 debug/manual tooling。
- [ ] 执行：

```bash
npm run lint:fix
npm run lint
npm run build
npm test -- --exit
```

**验收标准：** 文档路径和命令与实际 monorepo 一致；规范测试文档不再指向不存在的脚本。

---

## Phase 1：稳定测试与模块解析

**文件：** `tests/require-hook.js`、`.mocharc.json`、`.mocharc.single.json`、`tests/src/**`。

- [ ] 用基于包边界或显式 package import 的 resolver 替换硬编码的 `CORE_PATH_PREFIXES`。
- [ ] 增加回归测试，覆盖通过现有测试路径风格导入 `packages/core/out` 和 root `out` 的代表模块。
- [ ] 增加测试证明共享缓存类不会通过不同路径被加载两次。
- [ ] 保持 `require('vscode')` 拦截逻辑集中在 `tests/require-hook.js`；将规范测试中的 ad hoc `Module._load` override 删除或隔离到 debug/manual 测试。
- [ ] 执行：

```bash
npm test -- --exit
npm run coverage
```

**验收标准：** 未来在 `packages/core` 与 `packages/vscode` 之间移动模块时，不需要为每个文件维护 prefix list。

---

## Phase 2：引入共享 Workspace Index

**文件：** 新增 `packages/vscode/src/indexing/workspace-index.ts`、新增 `packages/vscode/src/indexing/symbol-index.ts`、新增 `tests/src/indexing/`。

- [ ] 实现 `WorkspaceIndex` 服务，统一负责：
  - thrift 文件发现
  - 基于 document version 的 AST 解析
  - include graph 解析
  - 基于名称和命名空间的 top-level symbol lookup
  - file watcher 事件触发的缓存失效
- [ ] 通过 `CoreDependencies` 或 VS Code 专用 dependency object 注入 `WorkspaceIndex`。
- [ ] 将 `ThriftWorkspaceSymbolProvider` 迁移为从 index 读取 symbols。
- [ ] 将 `ThriftDefinitionProvider` 的 workspace fallback 和 include lookup 迁移到 index。
- [ ] 将 `ThriftRefactorCodeActionProvider` 中未知类型 Quick Fix 的工作区扫描迁移到 index。
- [ ] 将 reference search 的文件发现迁移到 index，同时保持 AST traversal 行为不变。
- [ ] 执行：

```bash
npm run lint:fix
npm test -- --exit
npm run perf:benchmark
```

**验收标准：** 工作区扫描和解析集中管理；definition、references、workspace symbols、Quick Fix 对符号位置的理解一致。

---

## Phase 3：将重构能力改为 AST-Based

**文件：** `packages/core/src/refactor/*`、`packages/vscode/src/commands/refactoring.ts`、`packages/vscode/src/code-actions-provider.ts`、新增 `tests/src/refactor/`。

- [ ] 增加 core refactor helper，返回纯文本 edit：
  - 从选择区域或 cursor-inferred type expression 抽取 type alias
  - 将 top-level type declaration 移动到另一个文件
  - 基于 AST 计算 include 插入位置
- [ ] 使用 parser ranges 替代正则进行 type 和 block 检测。
- [ ] 保留注释、注解、typedef 和嵌套泛型类型表达式。
- [ ] 增加负向测试，覆盖 cursor 位于注释、字符串、include path、primitive type 内的场景。
- [ ] 更新 VS Code commands，将 core edit 结果转换为 `vscode.WorkspaceEdit`。
- [ ] 执行：

```bash
npm run lint:fix
npm test -- --exit
```

**验收标准：** 重构行为由 AST range 驱动，并由 core 纯逻辑测试和 VS Code command 集成测试共同覆盖。

---

## Phase 4：拆分 Parser 并强化语法覆盖

**文件：** `packages/core/src/ast/parser.ts`、`packages/core/src/ast/` 下的新 parser 模块、新增 `tests/src/ast/`。

- [ ] 拆分 parser 内部前，先增加 golden AST fixtures。
- [ ] 将声明解析拆到专用模块：
  - include/namespace
  - typedef/const/enum
  - struct/union/exception fields
  - service/interaction functions
  - annotation 与 container type helper
- [ ] 保持 public `ThriftParser` API 稳定。
- [ ] 为本项目已支持的 Thrift 0.23+ 构造增加 fixture：`uuid`、`stream`、`sink`、`interaction`、`reference`。
- [ ] 执行：

```bash
npm run lint:fix
npm test -- --exit
npm run coverage
```

**验收标准：** Parser 文件更小，且 golden fixtures 证明行为等价。

---

## Phase 5：诊断规则注册表与配置化

**文件：** `packages/core/src/diagnostics/rules/*`、`packages/core/src/diagnostics/diagnostic-codes.ts`、`packages/cli/src/config.ts`、`package.json`。

- [ ] 引入 rule metadata：稳定 rule id、默认 severity、分类、文档说明。
- [ ] 将 `analyzeThriftAst` 重构为通过统一 context 执行注册规则。
- [ ] 支持在 `.thriftrc.json` 中启用/禁用规则和覆盖 severity。
- [ ] 在 VS Code package contribution 中增加匹配的 `thrift.diagnostics.*` 配置。
- [ ] 增加文档列出每个 rule id、默认 severity 和可用 fix。
- [ ] 执行：

```bash
npm run lint:fix
npm test -- --exit
npm run coverage:cli
```

**验收标准：** CLI 与 VS Code 能应用同一套诊断规则配置。

---

## Phase 6：补充高价值编辑器功能

**文件：** `packages/vscode/src/*`、`packages/vscode/src/completion/*`、`package.json`、`tests/src/`。

- [ ] 增加 include `DocumentLinkProvider`，让 `include "x.thrift"` 可点击。
- [ ] 使用 `WorkspaceIndex` 实现命名空间类型补全和 include-aware type completion。
- [ ] 为 formatter 和 diagnostics 测试中常见的 Thrift annotations 增加 key/value completion。
- [ ] 增加 Quick Fix：
  - duplicate field IDs
  - uniquely resolved type 的 missing include
  - 存在匹配 include 时的 unknown namespace alias
  - return type 不是 `void` 时的 invalid `oneway`
- [ ] 仅在 reference indexing 集中后，再评估是否增加高信号 CodeLens，例如类型引用次数。
- [ ] 执行：

```bash
npm run lint:fix
npm test -- --exit
```

**验收标准：** 新编辑器功能复用共享 index 数据，并通过 VS Code mock 拥有确定性测试。

---

## Phase 7：统一 CLI 与 VS Code 配置

**文件：** `packages/core/src/config/*`、`packages/cli/src/config.ts`、`packages/vscode/src/formatting-bridge/options.ts`、`package.json`、docs。

- [ ] 将共享 config schema 和 defaults 移入 `packages/core`。
- [ ] 让 CLI `.thriftrc.json` validation 对未知 key 给出清晰 warning。
- [ ] 让 VS Code setting resolution 映射到同一 schema，同时保留 legacy fallback keys。
- [ ] 增加测试，对比同一逻辑设置在 CLI 和 VS Code 中解析出的 formatting options。
- [ ] 执行：

```bash
npm run lint:fix
npm test -- --exit
npm run coverage:cli
```

**验收标准：** editor、CLI、tests 中的格式化与诊断配置解析一致。

---

## Phase 8：性能、缓存与发布信心

**文件：** `packages/core/src/utils/cache-manager.ts`、`packages/core/src/utils/memory-monitor.ts`、`packages/vscode/src/performance-monitor.ts`、`tests/perf/*`、GitHub workflows。

- [ ] 为有状态工具增加明确的 cache reset/test hooks。
- [ ] 定义 parser、formatter、diagnostics、workspace-index 的 benchmark budgets。
- [ ] 让 `npm run perf:benchmark` 输出机器可读结果，并与已保存阈值比较。
- [ ] 指标稳定后，将性能预算检查加入 CI job 或 optional PR check。
- [ ] 在 `WorkspaceIndex` 接管共享 parse 和 symbol state 后，减少 provider-local cache registration。
- [ ] 执行：

```bash
npm run lint:fix
npm test -- --exit
npm run perf:benchmark
```

**验收标准：** 发布前能发现性能回归，provider cache 行为可测试。

---

## 推荐执行顺序

1. 先执行 Phase 0 和 Phase 1，因为它们能减少上下文混乱，并让后续重构更安全。
2. 然后执行 Phase 2，因为共享 index 会解锁更好的导航、补全、Quick Fix 和性能。
3. Phase 3 与 Phase 4 放在 index 稳定之后，因为重构和 parser 拆分属于更高风险行为变更。
4. Phase 5 到 Phase 8 可以在共享 indexing 落地后拆成独立 PR。

## 建议 PR 边界

- PR 1：docs/test hygiene。
- PR 2：test resolver stabilization。
- PR 3：shared workspace index and provider migration。
- PR 4：AST-based refactoring。
- PR 5：parser split with golden fixtures。
- PR 6：diagnostics registry/config。
- PR 7：editor feature enhancements。
- PR 8：config unification and performance gates。
