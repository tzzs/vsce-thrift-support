# Thrift Language Support - 计划与进度（2.1.1 优化发布线）

**当前版本**: 2.2.0
**最新状态**: ✅ `pnpm test` 全量通过（999 passing）｜✅ Monorepo + CLI 包已实现（Phase 5 A/C/E）｜✅ CodeQL ReDoS 修复
**最后更新**: 2026-05-19（基于 claude/blissful-goodall-979518 分支，PR #52）

本文档用于统一当前阶段的目标、风险、里程碑与验收方式，便于在多次迭代中保持方向一致与可回溯。

---

## 0. 文档范围与原则

- **范围**: VS Code 扩展核心能力（格式化、诊断、导航、重构、语法高亮）及其性能与质量保障
- **原则**: 先稳定再演进、先可测再优化、先一致再扩展

---

## 1. 当前现状摘要

### 1.1 架构与能力概况

- ✅ **语言特性扩展**: 完整支持 Thrift IDL 新关键字 `interaction`、`stream`、`sink`、`performs`，涵盖 AST 解析、格式化、诊断、导航、补全、引用查找等所有语言特性
- ✅ **构建系统优化**: 引入 esbuild 打包，减少发布文件数量；CI 支持 Node.js 22/24 双运行时矩阵
- ✅ **AST 解析器重构**: 从 optimized-parser 迁移至统一的标准 parser，移除 `slist` 废弃类型，关键字与 Thrift 规范对齐
- ✅ **缓存系统统一化**: 已删除冗余实现，统一使用 `optimized-lru-cache.ts` 和 `cache-manager.ts`
- ✅ **并发控制增强**: `maxConcurrentAnalyses` 从 1 提升至 3，多文件处理能力显著提升
- ✅ **增量解析器优化**: 使用 URI + 版本号 + 内容哈希作为缓存键，缓存命中率提升 30-40%
- ✅ **智能内存管理**: 改进内存估算函数，考虑对象类型和结构深度，内存监控轮询间隔优化至 120s
- ✅ **配置管理系统**: 创建 `ConfigService` 统一管理配置读取、验证、监听和重置
- ✅ **错误处理统一化**: `ErrorHandler` 支持错误聚合和性能统计，统一日志格式
- ✅ **性能基准测试**: 424 个测试全部通过（含 84 个低覆盖率模块新增测试），编译无错误
- ✅ **类型安全增强**: 添加显式泛型类型、修复空引用问题、优化 TypeScript 类型定义
- ✅ **性能监控统一**: 删除冗余监控器实现，统一到 `performance-monitor.ts`
- ✅ **代码清理**: 删除未使用的遗留文件和死代码，移除 Qodana CI 集成

### 1.2 已解决的技术债

- ✅ 缓存管理器双实现并存问题已解决（删除 `new-cache-manager.ts`）
- ✅ LRU 缓存多版本并存问题已解决（删除 `advanced-lru-cache.ts`, `lru-cache.ts`）
- ✅ 性能监控器多版本并存问题已解决（删除冗余监控器实现）
- ✅ AST 解析器双实现并存问题已解决（迁移 optimized-parser → 标准 parser）
- ✅ `slist` 废弃类型已清理，关键字与 Thrift 规范对齐
- ✅ 缓存 TTL 策略优化完成（延长 2-3 倍，增加容量 2.5 倍）
- ✅ 诊断并发控制已优化（`maxConcurrentAnalyses: 1 → 3`）
- ✅ 代码审查发现的问题已修复（竞态条件、内存泄漏、范围验证）
- ✅ `Performs` 节点映射到 interaction 符号类型

---

## 2. 关键风险与影响

- 性能监控口径分裂导致指标不可比较
- 缓存命中与驱逐统计不一致导致内存评估失真
- 重复实现并存导致行为差异扩大维护成本
- 增量脏区计算不稳影响格式化与诊断一致性
- 诊断调度重叠导致队列堆积与 UI 卡顿
- 新关键字（interaction/stream/sink/performs）在所有 provider 中的一致性覆盖

---

## 3. 近期目标（P0 / 已完成）

### 3.1 缓存治理与一致性 ✅ 已完成

- [x] 统一 CacheManager 单一实现与注册入口
- [x] 统一 LRU 缓存实现与使用边界
- [x] include 缓存迁移至 LRU 并增加容量上限与 TTL
- [x] 增强缓存主动清理策略（内存压力触发）

### 3.2 增量解析与格式化稳定性 ✅ 已完成

- [x] 修复 AST 缓存重复注册问题
- [x] 优化脏区计算准确性
- [x] 改进缓存键构造策略：URI + 版本号 + 内容哈希
- [x] 变更合并算法回归测试补齐（增量路径一致性）

### 3.3 质量门槛固化 ✅ 已完成

- [x] 所有优化通过 424 个测试验证（新增 115 个测试，含 84 个低覆盖率模块测试）
- [x] 编译无错误，lint 无警告
- [x] 缓存 TTL 策略优化（延长 2-3 倍，容量提升 2.5 倍）
- [x] 并发控制优化（`maxConcurrentAnalyses: 1 → 3`）
- [x] 代码审查发现的问题已全部修复（竞态条件、内存泄漏、范围验证）
- [x] 类型安全增强（添加显式泛型类型、修复空引用、优化类型定义）
- [x] 性能监控统一（删除冗余监控器实现）

### 3.4 增量格式化测试覆盖 ✅ 已完成

- [x] 新增增量格式化 vs 完整格式化等价性测试
- [x] 新增超出范围脏区夹紧行为测试
- [x] 创建可重用的测试选项辅助函数

### 3.5 Thrift 语言规范支持 ✅ 已完成

- [x] AST 解析器支持 `interaction`、`stream`、`sink`、`performs` 关键字
- [x] 所有 language provider 支持 interaction 类型（格式化、诊断、导航、补全、引用、重命名、符号等）
- [x] `Performs` 节点正确映射到 interaction 符号类型
- [x] 范围格式化时保留 interaction 上下文
- [x] 清理废弃的 `slist` 类型，关键字与 Thrift 0.23+ 规范对齐

### 3.6 构建与 CI 优化 ✅ 已完成

- [x] esbuild 打包减少发布文件数量
- [x] CI 工作流优化（Node.js 22 + 24 双运行时矩阵）
- [x] CI 构建脚本、npm ci、tsconfig 对齐
- [x] 添加 pnpm-lock.yaml 支持本地 pnpm 开发
- [x] 性能优化：预分配 body 数组、提取 createRange 辅助函数
- [x] 内存监控轮询间隔从 30s 优化至 120s

### 3.7 Quick Fix 与 Code Action 修复（P0 / 2.3.0）

- [x] 修复 code-actions-provider 取消令牌逻辑反转（无 token 时提前 break）
- [x] 接入 findWorkspaceDefinitions，include 建议改为工作区解析的真实相对路径
- [x] Quick Fix 按 context.diagnostics（type.unknown）门控，消除无错误时的噪音
- [x] manager.ts 为 vscode.Diagnostic 补 code / source 元数据
- [x] 新增/调整 5 个 P0 专项测试用例，全量 676 passing

### 3.8 Monorepo + CLI 工具（Phase 5）🔧 进行中

将核心逻辑从 VS Code 依赖中解耦，发布独立 CLI npm 包。

#### Phase 5A: Monorepo 骨架 + Core 包 ✅

- [x] pnpm workspace 配置（`pnpm-workspace.yaml` 添加 `packages/*`）
- [x] `packages/core/` — 零 vscode 依赖的核心包（`@tanzz/thrift-core`, private）
  - `types.ts`: Position, Range, Uri, DiagnosticSeverity 等（与 vscode.* 结构兼容）
  - `ast/`: parser, tokenizer, nodes.types — 所有 `vscode.Range` → `core.Range`
  - `formatter/`: formatter-core 去掉 TextDocument 依赖，始终接受 string
  - `diagnostics/`: rules + types — `vscode.DiagnosticSeverity` → `core.DiagnosticSeverity`
  - `utils/`: line-range, cache-manager, error-handler（console.error 版）
  - `config/`: 默认配置 + cache-config
- [x] Core tsc 编译通过，`grep -r "from 'vscode'" packages/core/` 无残留
- [x] CodeQL ReDoS 修复：parser.ts 正则消除字符类重叠、formatter-core.ts `trimEnd()`、types.ts `indexOf` 替代正则

#### Phase 5C: CLI 包 ✅

- [x] `packages/cli/` — npm 包名 `thrift-support`，bin: `thrift-support`
- [x] 四个命令：`format`（--check/--write/--stdin）、`lint`（--severity/--json/--include-path）、`parse`（--stdin）、`symbols`（--json/--flat）
- [x] 手写参数解析（~170 行），零运行时依赖
- [x] esbuild bundle: 333KB，npm pack 157KB compressed
- [x] `.thriftrc.json` 配置级联（CLI flags > --config > 向上查找 > 默认值）
- [x] Exit codes: 0 成功 / 1 lint 错误 / 2 用法错误 / 3 内部错误

#### Phase 5E: CI/Publish + 版本同步 ✅

- [x] `ci.yml`: 新增 Build core、Build CLI、CLI dogfood 步骤
- [x] `publish.yml`: 新增 `npm_publish` job（npm environment + provenance）
- [x] `scripts/sync-versions.js`: 根版本 → packages/core + packages/cli 同步
- [x] GitHub npm Environment + NPM_TOKEN secret 已配置

#### Phase 5B: VS Code 扩展迁移 ⏳ 待做

- [ ] 创建 `packages/vscode/`，移动 ~40 个 provider/bridge/diagnostics/commands 文件
- [ ] 所有 core 引用从相对路径改为 `import from '@tanzz/thrift-core'`
- [ ] esbuild bundle（vscode external，core 被 bundle）
- [ ] `vsce package` 验证

#### Phase 5D: 测试迁移 ⏳ 待做

- [ ] 更新 `require-hook.js` 路径映射
- [ ] 创建 CLI 集成测试
- [ ] 测试结构按包组织

#### Phase 5F: 文档更新 ⏳ 待做

- [ ] README.md / README.en.md 添加 CLI 章节
- [ ] `packages/cli/README.md` + `LICENSE`

---

### 3.9 Formatter 工程化演进（Phase 0–4）✅ 已完成

#### Phase 0: 测试基础 ✅

属性级测试套件，所有后续 Phase 的安全网。

- [x] **幂等性穷举** (`test-idempotency-exhaustive.js`): 168 输入 × 9 配置矩阵，覆盖所有 Thrift 类型 + 脏代码 + 配置变体
- [x] **AST 语义往返** (`test-ast-roundtrip.js`): 40 场景，parse(format(x)) 与 parse(x) 递归比对节点类型/名称/字段/类型
- [x] **注释永不丢失** (`test-comment-preservation.js`): 36 场景，tokenizer 提取注释集合比对（`//`/`#`/`/* */`/`/** */`/CJK）
- [x] **Fixture 回归** (`test-fixture-regression.js`): 6 个黄金文件回归测试 + `regenerate.js` 重生成脚本
- [x] **性能基准入 CI** (`run-performance-benchmark.js`): 添加 `--threshold-full-ms` / `--threshold-incremental-ms` 参数，超阈值 exit 1

#### Phase 1: 正确性加固 ✅

- [x] **主循环防崩溃** (`formatter-core.ts`): `safeLine()` 包装器，单行格式化失败时原样输出并继续
- [x] **恶意输入韧性** (`test-malformed-input.js`): 178 行测试覆盖未闭合大括号、缺字段 ID、超深嵌套、10K 字符单行、空输入、纯注释文件
- [x] **`parseStructFieldText` 长度守卫** (`field-parser.ts`): >4000 字符行直接 bail-out 防止 regex 回溯

#### Phase 2: 注释稳定性 ✅

- [x] **CommentMap 并行结构** (`comment-map.ts`): `buildCommentMap(source, astIndex)` 基于 tokenizer 提取所有注释 token，按 `leading`/`trailing`/`dangling`/`inline` 分类
- [x] **接入格式化主流程** (`formatter-core.ts`): 延迟构建，`getCommentMap()` lazy getter 避免未使用时的 ~5ms 开销
- [x] **注释 edge case 测试** (`test-comment-edge-cases.js`): 181 行测试覆盖 flush 间注释、文件末尾、空 struct 内 dangling 注释等

#### Phase 3: Printer 抽象 ✅

- [x] **PrintBuffer** (`printer.ts`): `PrintItem` 中间表示（`text`/`indent`/`newline`/`softline`/`comment`/`group`），`render(maxWidth)` 输出
- [x] **ConstPrinter** (`const-printer.ts`): 首个迁移目标，const 集合展开使用 `PrintBuffer`
- [x] **单元测试** (`test-printer.js` + `test-const-printer.js`): 覆盖 group 折行、softline 语义、const 集合展开

#### Phase 4: 大文件性能 ✅

- [x] **性能回归检测** (`perf-assertions.js`): 12 个硬断言测试（small/medium/large 三档 × parser/astIndex/commentMap/formatter），JSON Lines 输出
- [x] **热路径优化**: CommentMap lazy 构建（避免 ~5ms tokenizer 开销）、`parseStructFieldText` 长度守卫
- [x] **分块格式化** (`chunked-format.ts`): >10000 行时按 AST 顶层块边界切分独立格式化再拼接
- [x] **CI 性能断言** (`.github/workflows/ci.yml`): 新增 `Performance assertions (multi-size)` 步骤

---

## 4. 未来优化方向（待实施）

### 4.1 Phase 5 剩余工作（近期）

- [ ] **Phase 5B**: VS Code 扩展迁移到 `packages/vscode/`（~40 文件移动 + import 重写，风险最高）
- [ ] **Phase 5D**: 测试结构迁移（require-hook 路径更新 + CLI 集成测试）
- [ ] **Phase 5F**: 文档更新（README CLI 章节 + packages/cli/README.md + LICENSE）
- [ ] release-please monorepo manifest 模式评估

### 4.2 性能基准与监控体系

- [x] 建立自动化性能测试流程（Phase 4.1 已完成）
- [x] 集成性能回归检测（Phase 4.1 perf-assertions.js，超阈值 CI 失败）
- [ ] 将错误统计集成到性能监控报告中
- [x] 大文件（>1000 行）性能测试（Phase 4.3 分块格式化，CHUNK_THRESHOLD=10000）
- [ ] 边界情况和并发场景测试补充

### 4.3 代码质量与维护性

- [ ] ESLint 配置优化：启用更多严格规则（如 `@typescript-eslint/no-explicit-any`）
- [ ] 补充 JSDoc 文档，特别是配置参数和性能阈值的说明
- [ ] 考虑对象池化优化频繁创建的对象（如 LineRange、Token 等）
- [ ] 清理未使用的 import 和变量

### 4.4 配置扩展与用户定制

- [ ] 考虑将部分配置项暴露给用户（如并发数、缓存大小）
- [ ] 添加配置迁移提示（向后兼容旧配置）
- [ ] 配置验证与边界值检查

### 4.5 文档与开发者体验

- [ ] 更新 README 突出性能改进
- [ ] 创建 `PERFORMANCE.md` 使用技巧和最佳实践
- [ ] 更新 `ARCHITECTURE.md` 详细描述缓存、增量、并发机制
- [ ] 添加故障排除指南

---

## 5. 架构演进方向（长期规划）

### 5.1 架构解耦与可扩展性

- [x] 核心逻辑从 VS Code 解耦（Phase 5A — packages/core 零 vscode 依赖）
- [x] 独立 CLI 工具发布（Phase 5C — npm 包 thrift-support）
- [ ] 语言服务层抽象与接口定义
- [ ] 规划 LSP 迁移路径与兼容策略
- [ ] 完成 VS Code 扩展迁移到 packages/vscode（Phase 5B）

### 5.2 高级功能扩展

- [ ] Web Worker 迁移（将格式化核心移至 Worker）
- [ ] 预解析与缓存预热策略
- [ ] 高级编辑功能（Call Hierarchy/Type Hierarchy/Refactor）
- [ ] 语义诊断与 Quick Fix 扩展

### 5.3 质量保障与生态扩展

- [ ] 性能基准体系与大型仓库压力测试
- [ ] 遥测数据收集（匿名）以了解真实使用场景
- [ ] 支持其他 IDL 语言（Protocol Buffers、gRPC）
- [ ] 插件系统开放

---

## 6. 里程碑与验收指标

### 6.1 性能指标 ✅ 已验证

- ✅ 1000 行文件格式化 <500ms
- ✅ 导航 <100ms
- ✅ 诊断全量分析 <200ms
- ✅ 并发处理能力提升 3 倍（`maxConcurrentAnalyses: 1 → 3`）
- ✅ 缓存命中率提升 30-40%
- ✅ 内存使用估算更精确、监控轮询间隔优化至 120s
- ✅ 性能监控统一化（单一 `performance-monitor.ts`）
- ✅ esbuild 打包减小扩展体积
- ✅ **CI 性能回归检测**：small <20ms / medium <100ms / large <500ms 硬断言
- ✅ **分块格式化**：>10000 行文件按顶层块边界切分，避免 O(n²) 对齐扫描

### 6.2 可靠性指标 ✅ 已验证

- ✅ 错误日志零崩溃
- ✅ 999 个测试全部通过（从 676 → 999，+48%）
- ✅ 关键操作错误率 <1%
- ✅ 编译无错误、lint 无警告
- ✅ 代码审查问题已全部修复
- ✅ **属性级测试覆盖**：幂等性穷举、AST 语义往返、注释永不丢失、fixture 回归

### 6.3 可维护性指标 ✅ 已验证

- ✅ 删除冗余代码（含遗留文件、死代码、废弃 parser）
- ✅ 统一的缓存管理系统
- ✅ 配置管理集中化
- ✅ 错误处理标准化
- ✅ 代码结构更清晰
- ✅ 类型安全性增强（显式泛型、空引用修复）
- ✅ AST 解析器统一（单一标准 parser 实现）
- ✅ 关键字与 Thrift 规范对齐

---

## 7. 验证与发布门槛 ✅ 已实施

- ✅ 变更提交前必须运行 `pnpm run lint` 与 `pnpm test`
- ✅ 关键修复需包含最小回归测试
- ✅ 所有优化通过 999 个测试验证（含属性级测试 + 性能断言）
- ✅ 编译无错误、lint 无警告
- ✅ CI 工作流：lint → build → test → benchmark → perf-assertions → CLI dogfood

---

## 8. 版本变更记录

| 版本 | 日期 | 主要更新 |
|------|------|----------|
| 2.4.0 | 2026-05-19 | **Monorepo + CLI 工具（Phase 5 A/C/E）+ CodeQL 安全修复**<br>- ✅ `packages/core/`: 核心逻辑零 vscode 依赖（AST、formatter、diagnostics、utils）<br>- ✅ `packages/cli/`: 独立 CLI 工具 `thrift-support`（format/lint/parse/symbols），333KB bundle<br>- ✅ CI 新增 CLI dogfood 步骤；publish 新增 npm_publish job<br>- ✅ `scripts/sync-versions.js` 版本同步<br>- ✅ CodeQL ReDoS 修复：parser 正则字符类重叠消除、formatter `trimEnd()`、Uri.parse `indexOf` 替代<br>- ⏳ Phase 5B/D/F 待做（VS Code 迁移、测试迁移、文档） |
| 2.3.1 | 2026-05-17 | **Formatter 工程化演进（Phase 0–4）+ Quick Fix P0 修复**<br>- ✅ Quick Fix P0：取消令牌逻辑反转、include 路径工作区解析、诊断门控、元数据补全<br>- ✅ Phase 0 测试基础：幂等性穷举(168×9)、AST 往返(40)、注释不丢失(36)、fixture 回归(6)、性能基准入 CI<br>- ✅ Phase 1 正确性加固：safeLine 防崩溃、恶意输入韧性、parseStructFieldText 长度守卫<br>- ✅ Phase 2 注释稳定性：CommentMap 并行结构、lazy 构建集成、edge case 测试<br>- ✅ Phase 3 Printer 抽象：PrintBuffer IR + ConstPrinter 迁移<br>- ✅ Phase 4 大文件性能：CI 性能回归断言(12 tests)、分块格式化(>10000 行)、热路径优化<br>- ✅ 测试从 676 → 999 passing (+48%)，31 文件 +4386 行 |
| 2.3.0 | 2026-05-15 | **Quick Fix / Code Action P0 修复**<br>- ✅ 取消令牌逻辑反转修复（无 token 时命名空间循环提前 break）<br>- ✅ include 建议接入 `findWorkspaceDefinitions`（真实相对路径替代文件名猜测）<br>- ✅ 灯泡与诊断按 `type.unknown` 联动（`context.diagnostics` 门控 Quick Fix）<br>- ✅ `vscode.Diagnostic` 补 `.code` / `.source='thrift'` 元数据<br>- ✅ 新增/调整 5 个 P0 专项测试，全量 676 passing |
| 2.1.1 | 2026-05-07 | **语言规范增强与构建优化**<br>- ✅ 完整支持 `interaction`、`stream`、`sink`、`performs` 关键字（AST + 所有 provider）<br>- ✅ esbuild 打包减小扩展体积<br>- ✅ CI 支持 Node.js 22 + 24 双运行时矩阵<br>- ✅ AST 解析器统一（optimized-parser → 标准 parser）<br>- ✅ 清理废弃 `slist` 类型，关键字与 Thrift 规范对齐<br>- ✅ 删除遗留文件和死代码<br>- ✅ 内存监控轮询间隔优化（30s → 120s）<br>- ✅ 新增 84 个低覆盖率模块测试 + 其他测试，从 309 → 424 通过<br>- ✅ 格式化修复：逗号/分号位置、service 大括号缩进、enum 空等号 |
| 2.1.0 | 2026-02-08 | **性能与内存优化发布**<br>- ✅ 统一缓存管理系统（删除 3 个冗余实现）<br>- ✅ 增量解析器优化（URI + 版本 + 内容哈希缓存键）<br>- ✅ 并发控制增强（`maxConcurrentAnalyses: 1 → 3`）<br>- ✅ 智能内存管理（精确内存估算）<br>- ✅ 配置服务统一化（`ConfigService`）<br>- ✅ 错误处理增强（错误聚合 + 性能统计）<br>- ✅ 性能监控统一化（删除冗余监控器实现）<br>- ✅ 类型安全增强（显式泛型类型、空引用修复）<br>- ✅ 代码审查问题修复（竞态条件、内存泄漏、范围验证）<br>- ✅ 新增 3 个增量格式化测试，总计 309 个测试通过 |
| 2.0.4 | 2026-02-08 | 代码审查问题修复与稳定性改进 |
| 2.0.3 | - | 格式化与诊断修复 |
| 1.0.19 | - | 增量格式化缩进修复与回归测试；覆盖率脚本修复；全量测试通过 |
| 1.0.13 | - | Mocha 测试迁移与 formatter/diagnostics 相关修复 |
| 1.0.12 | - | AST/Parser 重构，增量分析/格式化与性能优化 |
