# 未来的优化与维护计划

当前版本：1.0.12（2025-12-29 打包）

本文档按照“近期目标 → 中期规划 → 长期方向 → 待增强清单 → 已完成”组织，所有已完成事项集中在最后，便于跟踪。

## 1. 近期目标（P0 / 本月）

### 1.1 稳定性与性能

- [x] 配置侧开关落地：`config.incremental.analysisEnabled/formattingEnabled/maxDirtyLines` 默认启用（不对用户暴露设置项）
- [x] 增量分析与增量格式化回归用例补齐（诊断、格式化、范围合并、结构性变更）
- [x] 性能基准脚本与文档：新增 `tests/perf/run-performance-benchmark.js` 与 `docs/performance-benchmark.md`
- [x] 采集基准数据并归档（CPU/内存对比）
  - baseline structs=120, fields=30, iterations=10
  - diagnostics full avg 10.19ms (min 6.90 / max 14.64)
  - diagnostics full avg 10.19ms (min 6.90 / max 14.64)
  - diagnostics incremental avg 15.47ms (min 6.57 / max 75.01)
  - formatting full avg 28.45ms (min 20.00 / max 56.35)
  - formatting incremental avg 2.06ms (min 0.17 / max 17.22)

### 1.2 代码健康

- [ ] 代码分割：拆分大文件，降低模块复杂度
  - [x] formatter 拆分为 `src/formatter/*`（core/indent/line-handlers/struct-content 等模块）
  - [x] formatter 单测迁移并拆分至 `tests/src/formatter/*`
  - [x] references provider 拆分为 `src/references/*`，单测迁移至 `tests/src/references/*`
  - [x] formatting provider 拆分为 `src/formatting-bridge/*`，单测迁移至 `tests/src/formatting-bridge/*`
  - [ ] 继续拆分其他大文件（按诊断/格式化/解析优先级逐步推进）
  - [ ] 待拆分清单（按当前文件规模排序，均为未开始）
  - [ ] `src/ast/parser.ts`（≈697 行）
  - [ ] `src/ast/parser-helpers.ts`（≈645 行）
  - [ ] `src/diagnostics/manager.ts`（≈558 行）
  - [ ] `src/definition-provider.ts`（≈548 行）
  - [ ] `src/completion-provider.ts`（≈404 行）
  - [ ] `src/diagnostics/rules/analyzer.ts`（≈373 行）
  - [ ] `src/extension.ts`（≈330 行）
- [x] 单元测试覆盖：补齐 line-range 与增量相关回归并接入 `run-all-unified`
- [ ] 注释标准化：统一中英文注释规则（仅在必要处）

## 2. 中期规划（P1 / 下一阶段）

### 2.1 LSP 化与增量索引

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

### 2.2 体验增强

- [ ] CompletionProvider：跨文件类型/注解键/排序/去重/上下文感知
- [ ] References：上下文过滤与预览面板、取消响应、准确度提升
- [ ] Document/Workspace Symbols：图标与层级优化、跨文件索引准确度
- [ ] Quick Fix：创建缺失类型/枚举成员、修复缺失 namespace/typedef
- [ ] Organize Includes：排序/去重/规范化路径
- [ ] Inlay Hints、Signature Help、Snippets、Semantic Tokens

## 3. 长期方向（P2 / 架构与技术债）

### 3.1 解析器健壮性

- [ ] 从正则迁移到基于状态的解析或 tokenizer/lexer
- [ ] 解析容错与错误恢复（保留部分 AST，标记无效节点）

### 3.2 格式化器重构

- [ ] 拆分 `formatConstFields` 与 `formatStructFields`
- [ ] `normalizeGenericsInSignature` 迁移到可复用的解析逻辑

### 3.3 AST 与类型安全

- [ ] 函数参数/throws 的 name/type 精确范围
- [ ] 多行声明的稳定 range（避免 line-based 偏移）
- [ ] AST 增量解析与子树缓存
- [ ] children/parent 结构一致化，便于通用遍历与索引

## 4. 待增强清单（能力差距）

### 4.1 体验与编辑能力

- [ ] DocumentHighlight（文档内高亮）
- [ ] 补全增强（跨文件、注解键、排序与上下文）
- [ ] Snippets（struct/enum/service/typedef/const/include）
- [ ] Signature Help（服务方法/容器/注解）
- [ ] Inlay Hints（字段编号、默认值、typedef 还原）

### 4.2 符号与导航

- [ ] Document/Workspace Symbol：层级与性能提升
- [ ] References：上下文过滤、预览面板、取消响应

### 4.3 诊断与 Quick Fix

- [ ] 诊断：重复字段 ID、重复/越界枚举值、循环 include、未使用 typedef/无用 include
- [ ] Quick Fix：缺失类型/枚举成员、缺失 namespace/typedef

### 4.4 格式化与重构

- [ ] Organize Includes（排序/去重/规范化路径）
- [ ] 按字段 ID 排序（可选）
- [ ] 抽取/内联 typedef、跨文件引用变更的预览与批量更新

### 4.5 测试与 CI

- [ ] 端到端 UI 测试（补全、F12、Outline、Refs）
- [ ] 性能基准与大仓压力测试
- [ ] moveType/extract/formatter/diagnostics 回归补齐并接入 `run-all-unified`

## 5. 已完成（集中归档）

### 5.1 基础设施与缓存

- [x] `ThriftFileWatcher` / `CacheManager` / `file-reader.ts` 基础设施落地
- [x] AST 缓存（5 分钟 TTL）与 Provider 统一使用 AST
- [x] References/符号共享缓存与文件列表节流
- [x] 工作区/引用文件列表增量更新（file watcher create/delete）
- [x] CacheManager 驱逐策略优化：按缓存分桶管理，过期清理与上限淘汰成本下降

### 5.2 AST 范围与精度

- [x] AST `nameRange` + 类型范围（fieldType/returnType/aliasType/valueType）补齐
- [x] AST 默认值/初始化范围：字段默认值、const 值体、enum initializer 精确 range
- [x] AST 类型范围回归测试新增（tests/src/ast/parser/test-type-ranges.js）

### 5.3 诊断与性能

- [x] 诊断节流（300ms 延迟 + 1s 最小间隔）与性能监控
- [x] 性能监控指标扩展（操作统计与内存摘要）
- [x] 并发控制：诊断分析引入并发上限与排队机制
- [x] 增量分析/增量格式化：脏区跟踪、依赖跳过、include 缓存复用、脏区诊断合并、结构性变更回退、块级局部解析与成员级缓存（enum/service/struct/union/exception）、范围合并统一、LRU/TTL 缓存驱逐
- [x] 增量格式化：脏区范围格式化、阈值回退、最小化 patch、基于 AST 的局部上下文
- [x] 增量分析边界修正：结构性变更与 include 识别改为注释/字符串剔除后判断
- [x] 增量分析脏区合并优化：多段脏区统一合并后在最小包含块内分析

### 5.4 错误处理与配置

- [x] 错误处理与日志统一：主要 Provider + 性能监控/扫描分析工具使用 `ErrorHandler`
- [x] 配置集中化（`src/config/index.ts`）消除魔法字符串/数字

### 5.5 架构与依赖注入

- [x] PerformanceMonitor 改为实例注入，从依赖构造层统一下发
- [x] DI 接线测试补齐：PerformanceMonitor 实例注入 + 诊断侧性能监控注入
- [x] 静态单例入口收敛：核心流程改为实例化依赖注入，避免直接调用 `getInstance()`

### 5.6 修复与回归测试

- [x] Rename 误删定义回归修复 + 回归测试覆盖
- [x] 诊断结构性变更回归测试覆盖

### 5.7 历史更新记录

- 2025-12-27：补齐 include Quick Fix 与 moveType 覆盖保护；CompletionProvider 引入 AST 语境与 include/枚举/容器 snippet；References/Document/Workspace Symbols 引入缓存与文件列表节流；诊断新增节流+性能监控+依赖追踪；测试补齐诊断/重构回归并挂入 unified runner。
- 2025-12-26：moveType 增加目标存在检测并避免覆盖；typedef 仅截取声明行；格式化支持单行逗号与 const 闭合行注释；诊断节流改为延迟队列；新增 AST 缓存层与 fileWatcher/cacheManager/errorHandler；测试目录重组 + 统一 runner。
- 2025-10-09：诊断策略优化（注解语义不透明、字符串内不计括号、仅栈顶为 `<` 匹配 `>`）；完善并通过全部测试。
