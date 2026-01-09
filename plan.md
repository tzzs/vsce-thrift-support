# 未来的优化与维护计划

当前版本：1.0.12（2026-01-08 重构完成）

本文档按照“近期目标 → 中期规划 → 长期方向 → 已完成”组织，所有已完成事项集中在最后，便于跟踪。

## 1. 近期目标（P0 / 本月）

### 1.1 LSP 化与增量索引

- [ ] 目标范围：诊断/格式化/补全/跳转/引用/重命名的 LSP 能力矩阵与优先级
- [ ] 交付形态：独立发布 LSP 可执行文件，可被 VS Code/Neovim/IntelliJ/CLI 等客户端复用
- [ ] 可支持能力：诊断、格式化（全量/范围）、补全、悬停、跳转定义/实现、引用、符号、重命名、代码操作、语义高亮、折叠、选择范围、Inlay Hints（可选）
- [ ] 架构拆分：扩展层（UI/命令）与语言服务层（解析/索引/诊断）职责边界
- [ ] 增量索引：文件级索引结构、dirtyRange 驱动的局部更新策略
- [ ] 缓存策略：索引缓存的 TTL/LRU/失效条件与清理触发点
- [ ] 并发模型：后台解析任务队列/取消/限流策略
- [ ] 测试计划：LSP 端到端测试、增量索引回归用例与基准样例
- [ ] 里程碑拆分：诊断 → 符号/跳转 → 引用/重命名 → 格式化/补全
- [ ] 风险与依赖：协议兼容、与现有 AST/缓存体系的衔接方案

### 1.2 体验增强

- [ ] CompletionProvider：跨文件类型/注解键/排序/去重/上下文感知
- [ ] References：上下文过滤与预览面板、取消响应、准确度提升
- [ ] Document/Workspace Symbols：图标与层级优化、跨文件索引准确度
- [ ] Quick Fix：创建缺失类型/枚举成员、修复缺失 namespace/typedef
- [ ] Organize Includes：排序/去重/规范化路径
- [ ] Inlay Hints、Signature Help、Snippets、Semantic Tokens

### 1.3 代码健康

- [ ] 注释标准化：统一中英文注释规则（仅在必要处）

## 2. 中期规划（P1 / 下一阶段）

### 2.1 体验与编辑能力（进阶）

- [ ] DocumentHighlight（文档内高亮）
- [ ] 补全增强（跨文件、注解键、排序与上下文）
- [ ] Snippets（struct/enum/service/typedef/const/include）
- [ ] Signature Help（服务方法/容器/注解）
- [ ] Inlay Hints（字段编号、默认值、typedef 还原）

### 2.2 符号与导航（进阶）

- [ ] Document/Workspace Symbol：层级与性能提升
- [ ] References：上下文过滤、预览面板、取消响应

### 2.3 诊断与 Quick Fix（进阶）

- [ ] 诊断：重复字段 ID、重复/越界枚举值、循环 include、未使用 typedef/无用 include
- [ ] Quick Fix：缺失类型/枚举成员、缺失 namespace/typedef

## 3. 长期方向（P2 / 架构与完善）

### 3.1 格式化与重构

- [ ] Organize Includes（排序/去重/规范化路径）
- [ ] 按字段 ID 排序（可选）
- [ ] 抽取/内联 typedef、跨文件引用变更的预览与批量更新


### 3.2 测试与 CI

- [ ] 端到端 UI 测试（补全、F12、Outline、Refs）
- [ ] 性能基准与大仓压力测试
- [ ] **[NEW]** 迁移至 Mocha 测试框架
    - [ ] 安装 mocha, @types/mocha, ts-node
    - [ ] 配置 .mocharc.json (集成 tests/require-hook.js)
    - [ ] 迁移现有测试用例 (tests/src/**/*.js)
    - [ ] 移除旧的 Worker Runner (run-all-unified.js)

## 5. 已完成（集中归档）

### 5.11 稳定性与性能（v1.0.12）

- [x] 配置侧开关落地：`config.incremental.analysisEnabled/formattingEnabled/maxDirtyLines` 默认启用
- [x] 增量分析与增量格式化回归用例补齐
- [x] 性能基准脚本与文档（`tests/perf`）
- [x] 采集基准数据并归档（CPU/内存对比）

### 5.12 解析与架构重构（v1.0.12）

- [x] **Parser**: 迁移到基于 Tokenizer/Lexer 的状态解析，支持精确 Range
- [x] **Error Recovery**: 解析容错与错误恢复
- [x] **Formatter**: `formatConstFields` 与 `formatStructFields` 拆分
- [x] **AST**: `nameRange` + 类型范围精确化，多行声明稳定 Range
- [x] **Code Health**: 代码大拆分（AST/Diagnostics/Completion/Entry）
- [x] **Coverage**: 单元测试覆盖率提升及统一 Runner

### 5.1 基础设施与缓存

- [x] `ThriftFileWatcher` / `CacheManager` / `file-reader.ts` 基础设施落地
- [x] AST 缓存（5 分钟 TTL）与 Provider 统一使用 AST
- [x] References/符号共享缓存与文件列表节流
- [x] 工作区/引用文件列表增量更新（file watcher create/delete）
- [x] CacheManager 驱逐策略优化：按缓存分桶管理

### 5.2 AST 范围与精度

- [x] AST `nameRange` + 类型范围（fieldType/returnType/aliasType/valueType）补齐
- [x] AST 默认值/初始化范围：字段默认值、const 值体、enum initializer 精确 range
- [x] AST 类型范围回归测试新增

### 5.3 诊断与性能

- [x] 诊断节流（300ms 延迟 + 1s 最小间隔）与性能监控
- [x] 性能监控指标扩展（操作统计与内存摘要）
- [x] 并发控制：诊断分析引入并发上限与排队机制
- [x] 增量分析/增量格式化：脏区跟踪、局部解析、缓存复用
- [x] 增量分析边界修正与脏区合并优化

### 5.4 错误处理与配置

- [x] 错误处理与日志统一：`ErrorHandler`
- [x] 配置集中化（`src/config/index.ts`）

### 5.5 架构与依赖注入

- [x] PerformanceMonitor 实例注入
- [x] DI 接线测试补齐
- [x] 静态单例入口收敛

### 5.6 修复与回归测试

- [x] Rename 误删定义回归修复 + 回归测试覆盖
- [x] 诊断结构性变更回归测试覆盖

### 5.7 定义导航拆分

- [x] `ThriftDefinitionProvider` 逻辑拆解与测试迁移

### 5.10 历史更新记录

- 2026-01-08：完成 v1.0.12 全量代码重构（AST/Diagnostics/Completion/Extension），所有 106 个测试通过；项目结构显著优化，模块职责清晰。
- 2026-01-08：Review 项目状态，确认 v1.0.12 版本进度与文档一致；Code Splitting (Formatter/References/Definition) 已完成，AST 增强 (Ranges/Safety) 已落地。

## 当前执行计划（Issue 修复）

1. **定义导航稳定性**
   - [x] 修复 `vscode.Location` 在 mock 环境中不可构造的问题，统一由 `src/utils/vscode-utils.ts` 生产位置。
   - [x] 更新 `DefinitionLookup/DefinitionHelpers/WorkspaceSymbolProvider/ReferenceSearch/HoverProvider` 等模块，让其复用该工具并保持 mock 兼容。
   - [x] 编译 `tsc` 并运行定义/hover相关单测验证，通过 `tests/src/definition-provider/test-definition-provider.js` 和 `tests/src/definition/lookup/test-definition-lookup.js`。

2. **文件监听 & workspace 模拟**
   - [x] 重写 `ThriftFileWatcher` 以包裹真实 watcher，新增 `fireCreate/Change/Delete` 便于测试触发事件；保持原有事件订阅与缓存清理逻辑。
   - [x] 运行相关 workspace symbol/test-file-list 单测观察 `findFiles` 被调用次数，确认 watcher 行为可控。

3. **剩余优先级任务（持续进行中）**
   - [ ] 对 `tests/mock_vscode.js` 的 workspace/mock 方法进行补充，确保 `findFiles/openTextDocument` 在各测试顶部不被重写为空（解决 `test-definition-lookup` 中 `vscode.workspace` 失联、`findFiles` 未被调用的问题）。
   - [ ] 跟进 diagnostics/formatting/references 测试失败（including cross-file references、formatter options/trailing commas、enumeration combos、incremental/DI hooks 等）并补充对应 mock 配置或代码修复。
   - [ ] 明确剩余 Priority 1-5 中的测试失败根因（如 `test-di-injection`、`test-include-resolver`、`test-format-options`、`test-references-provider`）并制定逐项解决措施，保持计划文档同步。
