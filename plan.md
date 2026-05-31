# Thrift 语言支持 - 计划与优化清单

**当前版本**: 3.0.0
**最后更新**: 2026-05-31
**分支状态**: `origin/master` 位于 `325ae2f`（`Merge pull request #61 from tzzs/codex-remaining-optimization`）
**当前状态**: `master` 已包含单体仓库拆分、命令行包、格式化器稳定性加固、`WorkspaceIndex` 基础、诊断规则配置以及多个编辑器体验 provider。剩余工作主要集中在生产路径接入、一致性收敛和发布信心。

本文档用于记录当前实现状态和下一步优化计划。它替代旧的 2.x 发布线计划；旧计划生成时还没有 `packages/core`、`packages/vscode`、`packages/cli` 的 monorepo 结构。

---

## 1. 当前架构

- `packages/core/src/`: Thrift parser、AST helpers、formatter、diagnostics rules、配置默认值、缓存与内存工具；不依赖 VS Code 运行时。
- `packages/vscode/src/`: VS Code 扩展入口、providers、commands、配置桥接、workspace indexing、诊断调度和编辑器 UX 功能。
- `packages/cli/src/`: 独立 `thrift-support` CLI，支持 `format`、`lint`、`parse`、`symbols`。
- `tests/src/`: core 与扩展行为的规范 Mocha 测试套件。
- `tests/cli/`: CLI 单元测试与集成测试。
- `tests/perf/`: benchmark 与性能断言脚本。
- `tests/debug/`: 手动复现或历史脚本，除非显式接入 Mocha，否则不属于默认测试契约；历史根目录手动脚本已归档到 `tests/debug/manual/`。

---

## 2. master 已完成工作

### 2.1 单体仓库、命令行工具与发布

- [x] 核心逻辑迁移到 `packages/core`，无直接 VS Code 依赖。
- [x] VS Code 扩展代码迁移到 `packages/vscode`。
- [x] CLI 包迁移到 `packages/cli`，支持格式化、诊断、解析和符号输出。
- [x] 构建流程更新为 core build、TypeScript compile、esbuild bundle。
- [x] 发布流程支持 VSIX 与 npm package。
- [x] 增加版本同步脚本。

### 2.2 格式化器与解析器稳定性

- [x] 增加 formatter 幂等性、AST 往返、注释保留、fixture 回归、恶意输入测试。
- [x] 大文件格式化接入分块处理。
- [x] parser 顶层声明解析拆分到 helper 模块。
- [x] 增加 golden AST parser fixtures。
- [x] Thrift 0.23+ 能力覆盖 `uuid`、`stream`、`sink`、`interaction`、`performs`、`reference`。

### 2.3 WorkspaceIndex 基础

- [x] 新增 `WorkspaceIndex` 与 `SymbolIndex`。
- [x] Workspace symbols 在注入共享 index 时可直接读取 index。
- [x] Definition、references、completion、code actions 都已有可使用 `workspaceIndex` 的集成路径。
- [x] 模块解析测试覆盖 core/vscode 编译产物 remapping，避免关键模块被重复加载。

### 2.4 诊断与快速修复

- [x] 增加 diagnostics rule registry 与 rule metadata。
- [x] VS Code 暴露 `thrift.diagnostics.rules` 配置。
- [x] CLI 配置校验会提示未知配置键。
- [x] 增加 include document links。
- [x] Completion 在注入 workspace index 时支持 workspace types。
- [x] 增加 annotation key/value completion。
- [x] 增加部分 missing include、unknown namespace alias、invalid `oneway` return type 的 Quick Fix。

### 2.5 高级编辑器能力

- [x] Semantic tokens provider 已注册。
- [x] Call hierarchy provider 已注册。
- [x] Type hierarchy provider 已注册。
- [x] Document highlight provider 已注册。
- [x] 上述 provider 已有对应测试文件。

---

## 3. 2026-05-31 巡检发现

### P0: WorkspaceIndex 已存在，但生产依赖未创建

`CoreDependencies` 声明了 `workspaceIndex?: WorkspaceIndex`，多个 provider 也会在注入后使用它。但 `createCoreDependencies()` 当前没有实例化或刷新 `WorkspaceIndex`，因此真实扩展激活路径下，多个能力仍会退回 provider-local 扫描；completion 也拿不到来自共享 index 的 workspace-wide types。

- [x] 在 `createCoreDependencies()` 中实例化 `WorkspaceIndex`。
- [x] 在扩展激活阶段 refresh index。
- [x] 将文件 watcher invalidation 接入共享 index。
- [x] 通过 `context.subscriptions` 释放 index 资源。
- [x] 增加 activation/integration 测试，证明正常扩展 setup 下 provider 能拿到 live index。

### P0: WorkspaceIndex 迁移仍不完整

部分 provider 已能使用 index，但还有 provider 自己维护 workspace document cache 或 include scanner。

- [x] 将 call hierarchy 的 workspace document loading 迁移到 `WorkspaceIndex`。
- [x] 将 type hierarchy 的 workspace document loading 迁移到 `WorkspaceIndex`。
- [x] 在行为一致的前提下，将 diagnostics include resolution 与 index include graph 收敛。
- [x] provider-local cache 只保留 provider-specific projection；生产路径下源文件发现与解析由共享 `WorkspaceIndex` 负责，fallback cache 已注册为受限 workspace-doc projection。

### P1: 语义令牌目前仍是整文档生成

当前 provider 实现了 `DocumentSemanticTokensProvider`，但未实现语义令牌编辑增量。正确性上可以接受，但旧 Phase 6 目标曾要求脏区增量更新。

- [x] 决定是否仍值得实现语义令牌增量编辑。
- [x] 本轮不实现 `provideDocumentSemanticTokensEdits`；保留整文档生成，后续以性能预算数据决定是否重启增量实现。
- [x] 如果不需要，更新 README/ARCHITECTURE，明确语义令牌是基于 AST 的整文档生成。
- [x] 为 500 行和 1000 行 fixture 增加语义令牌生成性能预算。

### P1: 类型层级语义需要与文档对齐

当前实现支持 service `extends`、typedef alias supertypes，以及退化的 top-level type items。旧计划中提到 struct/exception 继承，但这不是标准 Thrift IDL 语义。

- [x] 更新功能文档，准确描述当前 hierarchy 语义。
- [x] 增加 service extends chain、typedef alias chain、interaction item、unsupported struct `extends` 输入的测试。
- [x] 除非 parser 明确支持某个扩展语法，否则不要文档化非 Thrift 标准继承语义。

### P1: 配置面仍然分裂

当前存在三套相关配置面：core defaults、VS Code settings、CLI `.thriftrc.json`。它们已有改进，但还没有完全统一。

- [x] 将共享 config schema/default metadata 移入 `packages/core`。
- [x] 在可行范围内从共享 schema 派生 VS Code setting contribution metadata，并用测试对比 `package.json` 防止漂移。
- [x] 确保 CLI 与 VS Code 对等价输入解析出相同的 formatting 和 diagnostics options。
- [x] 增加 `.thriftrc.json`、VS Code settings、defaults 对共享 key 的对比测试。
- [x] 决定并发数、缓存大小、TTL、内存阈值等性能参数暂不暴露给用户；当前作为内部策略与测试边界维护，后续只有在真实工作区反馈需要调参时再公开。

### P1: 运行时与文档需要统一

仓库说明与 package metadata 必须对支持的 Node 运行时保持一致。当前 package metadata 指向 Node 24，但部分本地说明可能仍提到 Node 22.18.0。

- [x] 确认目标 CI/运行时基线。
- [x] 对齐 `package.json`、`.nvmrc`、`.node-version`、README、DEVELOPMENT、AGENTS、CI matrices。
- [x] 将运行时决策与 `undici` 及依赖约束一起说明。

### P2: 手动测试脚本需要整理

规范 Mocha 测试位于 `tests/src/**/*.js`，但根目录历史脚本和 debug runners 仍有旧假设与大量 console 输出。

- [x] 将仍有价值的根目录 `tests/test-*.js` 脚本对应的长期行为保留在现有 `tests/src/**` Mocha 测试中，历史入口统一归档。
- [x] 将剩余手动复现脚本移动到 `tests/debug/**` 或 `tools/debug/**`。
- [x] 文档明确根目录历史脚本不是 release gate。
- [x] 当行为已被规范测试覆盖后，删除根目录过期入口；保留的手动脚本位于 `tests/debug/manual/**` 作为复现材料。

### P2: 性能与缓存边界需要更强可观测性

仓库已有较完整的 cache 与 performance 工具，但状态归属仍分布在 core utilities、provider caches、hierarchy provider caches、workspace indexing 之间。

- [x] 定义 parser、formatter、diagnostics、semantic tokens 的性能预算。
- [x] 补充 workspace index 与 hierarchy provider 的性能预算。
- [x] 让 `npm run perf:benchmark` 使用已提交阈值比较，并提供稳定的机器可读 JSON 输出。
- [x] 为共享 singleton state 增加 cache reset/test hooks。
- [x] 增加围绕 WorkspaceIndex 与 hierarchy provider cache 的内存压力测试。

### P2: 发布信心与打包检查

发布流水线已配置，但 package 级 smoke check 仍可增强发布信心。

- [x] 增加 VSIX 包冒烟测试，验证 `dist/extension.js`、syntax grammar、language configuration、README、CHANGELOG、LICENSE 均存在。
- [x] 增加 CLI 打包产物冒烟测试，验证 bin 执行与 bundle dependency 边界。
- [x] 确保 release-please component versions 与 root/core/cli package metadata 保持一致。
- [x] 将 package smoke 接入 CI，作为发布前的自动化信心检查。

---

## 4. 建议执行顺序

1. **WorkspaceIndex 生产路径接入**: 实例化、refresh、dispose，并证明 provider 能拿到 index。
2. **Provider cache/index 收敛**: 迁移 hierarchy providers，并评估 diagnostics include graph 收敛。
3. **配置 schema 统一**: 让 CLI 与 VS Code 对等价设置给出一致解析结果。
4. **文档与运行时对齐**: 修正 Node 基线、hierarchy 文档、semantic-token 文档。
5. **测试整理与性能门禁**: 整理历史脚本，增加性能预算与 package smoke checks。

---

## 5. 验证门槛

任何代码变更开 PR 前必须运行：

```bash
npm run lint:fix
npm run lint
npm run build
npm test -- --exit
```

额外门槛：

- CLI 行为变更：`npm run coverage:cli`
- 解析器、格式化器、诊断、缓存、索引变更：`npm run perf:benchmark`
- Packaging 变更：`npm run smoke:package`

---

## 6. 建议 PR 边界

- PR 1: 将 live `WorkspaceIndex` 接入 extension dependencies 与 activation。
- PR 2: 将 hierarchy providers 和剩余 provider scanning 迁移到共享 index。
- PR 3: 统一 core、VS Code、CLI 的共享 config schema。
- PR 4: 对齐 runtime 文档和功能文档。
- PR 5: 清理手动测试脚本，增加性能预算和 package smoke checks。
