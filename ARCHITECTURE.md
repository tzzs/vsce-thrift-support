# Architecture

本文档描述 Thrift Support 扩展的核心机制：缓存系统、增量解析/格式化与并发控制。

---

## 目录

- [整体结构](#整体结构)
- [缓存系统](#缓存系统)
- [增量解析与格式化](#增量解析与格式化)
- [并发控制](#并发控制)
- [依赖注入](#依赖注入)
- [性能监控](#性能监控)

---

## 整体结构

```
extension.ts
  └─ createCoreDependencies()      packages/core + packages/vscode/src/utils/dependencies.ts
       ├─ CacheManager             统一 LRU-K 缓存
       ├─ ErrorHandler             错误聚合与统计
       ├─ FileWatcher              工作区文件变更监听
       ├─ IncrementalTracker       脏区跟踪（per-document）
       ├─ PerformanceMonitor       操作计时与慢操作告警
       └─ MemoryMonitor            堆内存压力检测
  └─ registerProviders(deps)       packages/vscode/src/setup.ts
       ├─ ThriftFormattingProvider
       ├─ DiagnosticsManager
       ├─ DefinitionProvider
       ├─ ReferencesProvider
       ├─ CompletionProvider
       ├─ HoverProvider
       └─ ...（其余 provider）
```

所有 provider 仅通过 `CoreDependencies` 接口访问基础设施，不直接实例化缓存或监控器。

---

## 缓存系统

### 实现层级

| 层级 | 类 | 位置 |
|------|----|------|
| 底层存储 | `OptimizedLRUCache<K, V>` | `packages/core/src/utils/optimized-lru-cache.ts` |
| 统一管理 | `CacheManager` | `packages/core/src/utils/cache-manager.ts` |
| 配置声明 | `cacheConfig` | `packages/core/src/config/index.ts` |

### LRU-K 策略

`OptimizedLRUCache` 实现 LRU-2 策略（`lruK = 2`）：只有被访问过 ≥2 次的项才进入"热区"，避免一次性扫描污染热数据。

```
访问频率 < lruK  →  候选区（第一次访问时插入）
访问频率 ≥ lruK  →  热区（LRU 驱逐）
```

### 内存压力驱逐

`CacheManager` 通过 `MemoryMonitor` 监听堆使用率（默认轮询间隔 120s）：

```
heapUsed / heapTotal > memoryPressureThreshold (0.8)
  → 对所有注册缓存按 evictionThreshold 比例驱逐
  → evictionThreshold 越低，内存压力时驱逐越激进
```

各缓存的 `evictionThreshold` 在 `cacheConfig` 中按使用场景独立配置（0.7–0.8）。

### TTL 过期

每次 `get()` 时检查条目年龄，超过 `ttlMs` 的条目视为过期并返回 `undefined`。TTL 按功能区差异化：

| 缓存区 | maxSize | TTL |
|--------|---------|-----|
| AST | 按文档 URI | 5 分钟 |
| diagnosticsBlocks | 500 | 10 分钟 |
| diagnosticsMembers | 1000 | 10 分钟 |
| references | 1000 | 30 秒 |
| workspaceSymbols | 1000 | 60 秒 |
| definition | 1000 | 30 秒 |
| hover* | 100–200 | 30 秒 |

### 缓存键设计

AST 缓存键 = `URI + 文档版本号 + 内容 SHA-1`，三要素缺一不可：

- **URI**：隔离不同文件
- **版本号**：VS Code 每次编辑递增，保证同文档不同时刻的键不同
- **内容哈希**：防止版本号相同但内容因外部工具变更的情况

---

## 增量解析与格式化

### 增量解析

`IncrementalTracker`（`packages/vscode/src/utils/incremental-tracker.ts`）追踪每个文档的"脏区"（dirty range）：

```
onDidChangeTextDocument
  → 计算变更影响的 LineRange
  → 与已有脏区合并（mergeLineRanges）
  → 超过 maxDirtyLines (200) 时退回全量
```

解析器在增量模式下：
1. 检查 AST 缓存（命中率 30–40%）
2. 仅对脏区所在的顶层块重新解析
3. 将新块拼回上次的完整 AST

### 增量格式化

`ThriftFormattingProvider`（`packages/vscode/src/formatting-bridge/index.ts`）：

```
rangeFormat 请求
  → expandRangeToStructuralBlocks()  将选区扩展到完整的 struct/enum/service 边界
  → 格式化扩展后的文本块
  → buildMinimalEdits()              diff 原文本与新文本，只输出变化的行级 TextEdit
```

`buildMinimalEdits` 避免了整文件替换，减少 VS Code UI 的重绘开销。

### 大文件分块格式化

文件行数 > `CHUNK_THRESHOLD`（10000）时，`ChunkedFormatter`（`packages/core/src/formatter/chunked-format.ts`）介入：

```
按 AST 顶层块边界切分文件
  → 每块独立格式化（避免 O(n²) 对齐扫描）
  → 拼接结果
```

---

## 并发控制

### 诊断调度

`DiagnosticsScheduler` 使用防抖 + 节流双重策略：

| 参数 | 值 | 说明 |
|------|----|------|
| `analysisDelayMs` | 300ms | 停止输入后等待 300ms 再触发（防抖） |
| `minAnalysisIntervalMs` | 1000ms | 同一文件两次分析最小间隔（节流） |
| `maxConcurrentAnalyses` | 3 | 同时进行的文件分析上限 |
| `dependentAnalysisDelayFactor` | 2× | include 依赖文件的分析延迟倍数 |

`maxConcurrentAnalyses` 从最初的 1 提升至 3，多文件工作区的吞吐量约提升 3 倍。

### 自适应采样

`PerformanceMonitor` 通过 `sampler`（`packages/vscode/src/utils/sampler.ts`）控制指标采集频率：高频操作（如每次击键触发的 hover）按比例降频采样，避免 metrics 数组以 O(n) 增长。

---

## 依赖注入

```typescript
// packages/vscode/src/utils/dependencies.ts
export interface CoreDependencies {
    cacheManager: CacheManager;
    errorHandler: ErrorHandler;
    fileWatcher: FileWatcher;
    incrementalTracker: IncrementalTracker;
    performanceMonitor: PerformanceMonitor;
    memoryMonitor: MemoryMonitor;
}

export function createCoreDependencies(): CoreDependencies { ... }
```

Provider 构造函数接受 `CoreDependencies` 而非具体实现，便于单元测试时注入 mock。

---

## 性能监控

### 操作计时

```typescript
// 同步操作
const result = performanceMonitor.measure('hover', () => computeHover(...), document);

// 异步操作
const result = await performanceMonitor.measureAsync('diagnostics', () => runDiagnostics(...), document);
```

超过 `slowOperationThresholdMs`（100ms）时，`ErrorHandler` 记录一次警告；超过 500ms 时额外输出文件信息和大小。

### 性能报告

在命令面板执行 `Thrift: Show Performance Report` 可查看 Markdown 报告，包含：

- 操作统计（count / avg / p95 / max / slowCount）
- 增量 vs 全量解析对比
- 慢操作详情
- 错误统计（total / warnings / 高频组件）
- 内存使用快照

### CI 性能断言

`.github/workflows/ci.yml` 中的 `Performance assertions` 步骤运行 `tests/perf/perf-assertions.js`，硬断言三个规模：

| 规模 | 阈值 |
|------|------|
| small (<100 行) | parser <20ms, formatter <20ms |
| medium (~500 行) | parser <100ms, formatter <100ms |
| large (>1000 行) | parser <500ms, formatter <500ms |

超过阈值时 exit 1，阻断 CI。
