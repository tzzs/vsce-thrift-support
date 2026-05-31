# Performance Guide

本文档介绍 Thrift Support 的性能特性、调优建议与最佳实践。

---

## 目录

- [性能指标](#性能指标)
- [配置调优](#配置调优)
- [大型工作区建议](#大型工作区建议)
- [CI/CD 集成](#cicd-集成)
- [性能报告](#性能报告)
- [内存管理](#内存管理)
- [常见性能问题](#常见性能问题)

---

## 性能指标

当前版本（2.2.0）的基准指标（在 MacBook Pro M2 上测量）：

| 操作 | 文件规模 | 典型耗时 |
|------|---------|---------|
| 全量解析 | <100 行 | <5ms |
| 全量解析 | ~500 行 | <30ms |
| 全量解析 | >1000 行 | <100ms |
| 格式化 | <100 行 | <10ms |
| 格式化 | ~500 行 | <50ms |
| 格式化 | >1000 行 | <200ms |
| 跳转到定义 | 任意 | <50ms |
| 诊断全量分析 | 单文件 | <200ms |
| 增量解析（缓存命中） | 任意 | <5ms |

CI 性能断言阈值（超过则 CI 失败）：

- small: parser <20ms, formatter <20ms
- medium: parser <100ms, formatter <100ms
- large: parser <500ms, formatter <500ms

---

## 配置调优

### 格式化性能

以下配置会影响格式化耗时：

```json
{
  "thrift.format.alignTypes": true,
  "thrift.format.alignNames": true,
  "thrift.format.alignAssignments": true,
  "thrift.format.alignAnnotations": true,
  "thrift.format.alignComments": true
}
```

对于超大文件（>5000 行）或对延迟敏感的场景，可关闭部分对齐选项以减少对齐扫描开销：

```json
{
  "thrift.format.alignAnnotations": false,
  "thrift.format.alignComments": false
}
```

### 诊断调度

诊断默认采用 300ms 防抖 + 1s 最小间隔，通常不需要手动调整。若工作区包含大量相互 `include` 的文件，依赖文件的分析会额外延迟（默认 2× 基础延迟），以避免级联触发。

### 增量模式

增量解析和格式化默认开启，无需配置。当单次编辑影响的行数超过 200 行时，扩展自动退回全量处理。

---

## 大型工作区建议

### 文件数量

工作区文件搜索上限为 1000 个 `.thrift` 文件（`workspaceFileLimit`）。超过此上限时，引用查找和工作区符号可能不完整。可通过排除非必要路径缓解：

```jsonc
// .vscode/settings.json
{
  "files.exclude": {
    "**/vendor/**": true,
    "**/generated/**": true
  }
}
```

### include 依赖深度

深层 include 依赖会增加诊断分析的文件遍历量。建议将公共类型集中到少量基础文件，避免"菊花链"式 include（A → B → C → D → ...）。

### 缓存预热

扩展在首次分析时会建立缓存。若希望打开工作区后立即获得完整的诊断和定义跳转，可在打开扩展后短暂浏览主要 Thrift 文件以触发预热。

---

## CI/CD 集成

### 格式化检查

在 CI 中使用 `thrift-support` CLI 检查格式一致性：

```yaml
- name: Check Thrift formatting
  run: npx thrift-support format --check src/**/*.thrift
```

返回码 1 表示发现未格式化的文件，CI 将自动失败。

### 代码质量门禁

```yaml
- name: Lint Thrift files
  run: npx thrift-support lint --severity error --json src/**/*.thrift
```

`--severity error` 只报告 Error 级别问题；输出 JSON 可与其他工具对接。

### 性能回归检测

若有性能敏感的大文件，可在 CI 中集成性能基准：

```bash
npm run perf:benchmark
```

默认阈值保存在 `tests/perf/benchmark-thresholds.json`，超过阈值时 exit 1。需要机器可读结果时使用：

```bash
npm run perf:benchmark:json
```

也可以临时覆盖阈值：

```bash
node tests/perf/run-performance-benchmark.js \
  --threshold-full-ms 500 \
  --threshold-incremental-ms 50 \
  --json
```

---

## 性能报告

在 VS Code 命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）执行：

```
Thrift: Show Performance Report
```

报告包含：

- **操作统计**：每类操作的 count / avg / p95 / max / slowCount
- **增量 vs 全量对比**：增量解析相对全量的性能提升百分比
- **慢操作详情**：超过 100ms 的操作列表（含文件路径和大小）
- **错误统计**：错误与警告总数，以及产生错误最多的组件
- **内存使用**：当前堆使用量及历史峰值

如果报告显示某类操作的 `slowCount` 持续增加，通常意味着相关文件过大或配置的对齐计算开销较高。

---

## 内存管理

扩展的内存占用主要来自 AST 缓存和各类 provider 缓存。内存监控器（`MemoryMonitor`）每 120 秒检查一次堆使用率：

- **正常**（<80%）：无操作
- **压力**（80–90%）：触发各缓存的主动驱逐（按 evictionThreshold 比例）
- **严重**（>90%）：进一步压缩缓存容量

若遇到内存占用持续增长：

1. 检查工作区是否包含超大的自动生成 Thrift 文件
2. 考虑将生成文件排除在 VS Code 工作区之外（`files.exclude`）
3. 执行 `Thrift: Show Memory Report` 查看各缓存的使用情况

---

## 常见性能问题

### 格式化响应慢

**现象**：格式化超过 500ms，编辑器短暂卡顿。

**排查**：
1. 执行 `Thrift: Show Performance Report`，查看 `full-parse` 和 formatter 操作的 avg/p95
2. 若文件 >10000 行，检查分块格式化是否生效（日志中应有 `chunked-format` 操作记录）
3. 关闭 `alignAnnotations` 和 `alignComments` 测试是否改善

### 定义跳转无响应

**现象**：`F12` 无反应或延迟 >1s。

**排查**：
1. 确认目标类型有明确定义（不是内建类型如 `i32`/`string`/`uuid`）
2. 若目标定义在另一个文件，检查 `include` 路径是否相对路径正确
3. 工作区 Thrift 文件数量是否超过 1000（见 `workspaceFileLimit`）

### 诊断频繁重复触发

**现象**：快速输入时 Problems 面板频繁刷新。

**原因**：属于正常行为（300ms 防抖）。若感觉过于频繁，通常是因为 include 依赖文件的级联分析。

### 内存持续增长

**现象**：长时间使用后内存占用超过 500MB。

**排查**：
1. 确认工作区没有意外包含大量自动生成文件
2. 执行 `Thrift: Show Memory Report` 查看哪个缓存区占用最多
3. 重新加载窗口（`Ctrl+Shift+P` → `Developer: Reload Window`）可清空所有缓存
