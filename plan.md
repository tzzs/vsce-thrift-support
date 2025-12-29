# 未来的优化与维护计划

当前版本：1.0.12（2025-12-29 打包）

本文档汇总近期代码审查与演进计划，按“现状 -> 风险 -> 计划 -> 长期方向”分块组织，便于追踪与执行。

## 1. 概览（当前进度）

**已完成**

- `ThriftFileWatcher` / `CacheManager` / `fileReader.ts` 基础设施落地
- AST 缓存（5 分钟 TTL）与 Provider 统一使用 AST
- AST `nameRange` + 类型范围（fieldType/returnType/aliasType/valueType）补齐，Rename/References 使用精确范围
- AST 默认值/初始化范围：字段默认值、const 值体、enum initializer 精确 range
- 诊断节流（300ms 延迟 + 1s 最小间隔）与性能监控
- References/符号共享缓存与文件列表节流
- 配置集中化（`src/config/index.ts`）消除魔法字符串/数字
- Rename 误删定义回归修复 + 回归测试覆盖
- AST 类型范围回归测试新增（tests/src/ast/parser/test-type-ranges.js）

**进行中**

- 统一错误处理与日志风格（`ErrorHandler` 已引入，待覆盖剩余分支）
- 增量分析/增量格式化

**待规划**

- LSP 化与增量索引

## 2. 代码质量评估（问题清单）

### 2.1 高优先级

#### 0. Rename 误删定义回归（✅ 已完成）

**发现:** 使用 Rename 功能后会导致对应的定义被异常删除，不符合预期。
**影响:** 直接破坏源码结构，存在数据丢失风险。
**建议:** 先复现并定位触发路径（尤其是跨文件 rename 与批量 edit 合并处），补充回归测试（已完成）。

#### 1. 重复代码问题（✅ 已完成）

**发现:** 6处 `createFileSystemWatcher('**/*.thrift')` 重复，12处 `clearCache()` 重复调用
**影响:** 维护困难，修改需要在多个地方同步
**文件位置:**

- `extension.ts:35,54` - 定义提供器和悬停提供器
- `referencesProvider.ts:248` - 引用提供器
- `workspaceSymbolProvider.ts:17` - 工作区符号提供器
- `documentSymbolProvider.ts:175` - 文档符号提供器
- `diagnostics.ts:1151` - 诊断提供器

**解决方案:**

- ✅ 已创建 `ThriftFileWatcher` 统一管理文件监听
- ✅ 已实现 `CacheManager` 统一缓存管理
- 已减少重复代码并集中维护点

#### 2. 文件读取逻辑重复（✅ 已完成）

**发现:** 多个 provider 重复实现相同的文件读取逻辑
**代码模式:**

```typescript
const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === file.toString());
let text = '';
if (openDoc) {
    text = openDoc.getText();
} else {
    const content = await vscode.workspace.fs.readFile(file);
    text = new TextDecoder('utf-8').decode(content);
}
```

**影响:** 代码冗余，性能开销
**解决方案:** 提取 `fileReader.ts` 工具类（已落地）

### 2.2 中优先级

#### 3. 错误处理不一致（🟡 部分完成）

**发现:** 异常处理模式不统一

- 有些地方使用 `try-catch` 包裹文件操作
- 有些地方直接忽略错误（`continue`）
- 缺少统一的错误日志记录标准

**建议:** 建立标准异常处理流程，统一错误日志格式（已引入 `ErrorHandler`，仍需覆盖剩余分支）

#### 4. 架构设计问题

**发现:**

- 单例模式滥用（静态方法和属性）
- 配置管理分散
- 魔法字符串和魔法数字硬编码

**具体案例:**

```typescript
// 硬编码的文件匹配模式
'**/*.thrift'

// 分散的缓存时间配置
private readonly CACHE_DURATION = 10000; // 10秒
```

## 3. 性能优化计划（高优先级）

**当前状态:** 用户反馈在编辑大文件时 CPU 占用很高，插件响应卡顿。

**问题分析:**

- 诊断功能每次文档修改都立即触发完整分析（已节流）
- AST 解析缺乏缓存（已补 AST 缓存，仍需增量解析）
- 格式化时需要重新计算复杂上下文
- 包含文件分析存在重复文件系统操作（已通过共享缓存与节流缓解）

**性能瓶颈定位:**

1. `src/diagnostics.ts:847-853` - 诊断系统过度频繁触发
2. `src/ast/parser.ts` - AST 解析器缺乏缓存
3. `src/formattingProvider.ts:100-150` - 格式化上下文计算复杂

**优化建议（进度更新）:**

- ✅ 诊断节流机制：已添加 300ms 延迟 + 1s 最小间隔的队列节流
- ✅ AST 缓存机制：已引入缓存化 AST（5 分钟 TTL）
- ✅ 包含文件缓存：References/符号使用共享缓存与文件列表节流
- ✅ 性能监控：已加入慢操作包装与指标
- ⏳ 增量分析：仍待实现（仅分析变更部分）

**实施优先级:**

1. 已完成（高优先级）：诊断节流 + AST 缓存
2. 中期改进（中优先级）：增量格式化 + 并发控制
3. 长期优化（低优先级）：Web Worker 支持 + 智能增量分析

**预期效果:**

- CPU 占用降低 60-80%
- 大文件编辑响应时间从秒级降至毫秒级
- 内存使用优化，避免重复计算

## 4. 近期任务清单

### 4.1 立即实施（本周）

- [x] 创建 `src/utils/fileWatcher.ts` - 统一文件监听器管理
- [x] 创建 `src/utils/cacheManager.ts` - 统一缓存管理
- [x] 创建 `src/utils/fileReader.ts` - 统一文件读取逻辑
- [x] 重构 `extension.ts` 使用新的工具类

### 4.2 近期实施（本月）

- [ ] 统一错误处理机制 - 建立标准异常处理流程（已引入 `ErrorHandler`，仍需覆盖剩余分支）
- [ ] 优化文件扫描性能 - 实现增量更新
- [ ] 完善性能监控 - 添加更多性能指标

### 4.3 长期规划（下月）

- [ ] 架构重构 - 考虑依赖注入
- [ ] 注释标准化 - 统一中英文注释
- [ ] 代码分割 - 将大文件拆分为小模块
- [ ] 单元测试覆盖 - 为核心功能添加测试

## 5. 架构与工具类建议

### 5.1 FileWatcher 工具类

```typescript
// src/utils/fileWatcher.ts
export class ThriftFileWatcher {
    private static instance: ThriftFileWatcher;
    private watchers: Map<string, vscode.FileSystemWatcher> = new Map();

    static getInstance(): ThriftFileWatcher {
        if (!this.instance) {
            this.instance = new ThriftFileWatcher();
        }
        return this.instance;
    }

    createWatcher(pattern: string, onChange: () => void): vscode.FileSystemWatcher {
        const key = `thrift-${pattern}`;
        if (this.watchers.has(key)) {
            return this.watchers.get(key)!;
        }

        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        watcher.onDidCreate(onChange);
        watcher.onDidChange(onChange);
        watcher.onDidDelete(onChange);

        this.watchers.set(key, watcher);
        return watcher;
    }

    dispose(): void {
        this.watchers.forEach(watcher => watcher.dispose());
        this.watchers.clear();
    }
}
```

### 5.2 CacheManager 缓存管理器

```typescript
// src/utils/cacheManager.ts
export interface CacheConfig {
    maxSize: number;
    ttl: number; // Time to live in milliseconds
}

export class CacheManager {
    private static instance: CacheManager;
    private caches: Map<string, { data: any, timestamp: number }> = new Map();
    private configs: Map<string, CacheConfig> = new Map();

    static getInstance(): CacheManager {
        if (!this.instance) {
            this.instance = new CacheManager();
        }
        return this.instance;
    }

    registerCache(name: string, config: CacheConfig): void {
        this.configs.set(name, config);
    }

    set<T>(cacheName: string, key: string, value: T): void {
        const config = this.configs.get(cacheName);
        if (!config) {
            throw new Error(`Cache ${cacheName} not registered`);
        }

        const cacheKey = `${cacheName}:${key}`;
        this.caches.set(cacheKey, { data: value, timestamp: Date.now() });

        // Clean up old entries
        this.cleanup(cacheName, config);
    }

    get<T>(cacheName: string, key: string): T | undefined {
        const cacheKey = `${cacheName}:${key}`;
        const entry = this.caches.get(cacheKey);

        if (!entry) {
            return undefined;
        }

        const config = this.configs.get(cacheName);
        if (!config) {
            return undefined;
        }

        // Check if expired
        if (Date.now() - entry.timestamp > config.ttl) {
            this.caches.delete(cacheKey);
            return undefined;
        }

        return entry.data as T;
    }

    clear(cacheName: string): void {
        const prefix = `${cacheName}:`;
        for (const [key] of this.caches) {
            if (key.startsWith(prefix)) {
                this.caches.delete(key);
            }
        }
    }

    clearAll(): void {
        this.caches.clear();
    }

    private cleanup(cacheName: string, config: CacheConfig): void {
        const prefix = `${cacheName}:`;
        const entries: Array<[string, { data: any, timestamp: number }]> = [];

        // Collect all entries for this cache
        for (const [key, value] of this.caches) {
            if (key.startsWith(prefix)) {
                entries.push([key, value]);
            }
        }

        // Sort by timestamp (oldest first)
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

        // Remove oldest entries if over max size
        while (entries.length > config.maxSize) {
            const [key] = entries.shift()!;
            this.caches.delete(key);
        }

        // Remove expired entries
        const now = Date.now();
        for (const [key, value] of entries) {
            if (now - value.timestamp > config.ttl) {
                this.caches.delete(key);
            }
        }
    }
}
```

### 5.3 配置管理器

```typescript
// utils/configManager.ts
export interface ThriftConfig {
    fileWatcher: {
        pattern: string;
        ignorePattern?: string[];
    };
    cache: {
        definition: { maxSize: number; ttl: number };
        hover: { maxSize: number; ttl: number };
        diagnostics: { maxSize: number; ttl: number };
    };
    performance: {
        slowOperationThreshold: number;
        maxMetrics: number;
    };
}

export class ConfigManager {
    private static instance: ConfigManager;
    private config: ThriftConfig;

    private constructor() {
        this.config = this.loadDefaultConfig();
    }

    static getInstance(): ConfigManager {
        if (!this.instance) {
            this.instance = new ConfigManager();
        }
        return this.instance;
    }

    private loadDefaultConfig(): ThriftConfig {
        return {
            fileWatcher: {
                pattern: '**/*.thrift',
                ignorePattern: ['**/node_modules/**', '**/.git/**']
            },
            cache: {
                definition: { maxSize: 100, ttl: 10 * 60 * 1000 }, // 10 minutes
                hover: { maxSize: 50, ttl: 5 * 60 * 1000 }, // 5 minutes
                diagnostics: { maxSize: 200, ttl: 30 * 1000 } // 30 seconds
            },
            performance: {
                slowOperationThreshold: 100, // 100ms
                maxMetrics: 100
            }
        };
    }

    getConfig(): ThriftConfig {
        return this.config;
    }

    updateConfig(newConfig: Partial<ThriftConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }
}
```

## 6. 深度技术债与长期改进

### 6.1 解析器健壮性（`src/ast/parser.ts`）

**当前状态:** 严重依赖正则表达式来提取字段。
**问题:** 复杂的嵌套类型或边缘情况的语法（例如：泛型参数中的注释）可能会破坏正则匹配或产生错误结果。
**改进建议:**

- 从纯正则匹配过渡到基于状态的解析器或字符流解析器。
- 如果语法要求变得更复杂，实现一个合适的 Tokenizer/Lexer。
- **优先级:** 中（关注 bug 报告）。

### 6.2 格式化器代码复杂性（`thriftFormatter.ts`）

**当前状态:** `formatConstFields` 约有 200 行；`formatStructFields` 也相当复杂。
**问题:** 巨大的方法使得代码难以阅读、测试和维护。
**改进建议:**

- 重构 `formatConstFields`：将"内联集合展开"逻辑提取到单独的辅助类或方法中。
- 重构 `formatStructFields`：将对齐计算逻辑与实际的字符串重组分离开来。
- **优先级:** 低（下次修改这些方法时进行重构）。

### 6.3 泛型类型解析（`thriftFormatter.ts`）

**当前状态:** `normalizeGenericsInSignature` 使用计数器手动解析 `<` 和 `>` 的嵌套。
**问题:** 难以维护且容易出错。
**改进建议:**

- 对类型签名采用标准化的递归下降解析。
- 在 Parser 和 Formatter 之间复用此逻辑。
- **优先级:** 中。

### 6.4 AST 与类型安全

**当前状态:** 插件操作的是"行"和"正则匹配"，而不是真正的抽象语法树 (AST)。
**问题:** 如果没有真正的 AST，无法准确支持"查找引用"或"重命名符号"等高级功能。
**改进建议:**

- 引入轻量级的 AST 模型（`ThriftDocument`, `ThriftNode`）。
- 在格式化之前将整个文档解析为这种树结构。
- **优先级:** 高（如果需要改进重命名/跳转定义等功能）。
- ✅ 已实现：已创建 AST 模型并应用于多个组件，带缓存清理 API。
- ✅ 已补齐：AST `nameRange`，用于精确引用与重命名范围。

**后续优化方向（建议补齐）:**

- ✅ 类型引用的精确 range（`fieldType`/`returnType`/`aliasType`/`valueType`，含 `ns.Type` 分段）
- ✅ 默认值/枚举 initializer 的 token 级 range；注解键/注解值范围仍待覆盖
- 函数参数/throws 的 name/type 精确范围
- 多行声明的稳定 range（避免 line-based 偏移）
- 解析容错与错误恢复（保留部分 AST，标记无效节点）
- AST 增量解析与子树缓存
- 轻量 tokenizer/lexer 替代正则，提升复杂泛型/注解鲁棒性
- children/parent 结构一致化，便于通用遍历与索引

### 6.5 Provider 代码重构与逻辑统一

**当前状态:** `CompletionProvider`, `DocumentSymbolProvider`, 和格式化器的解析逻辑各自实现了独立的、基于正则的解析逻辑。
**问题:** 逻辑重复导致维护困难，修复一个 bug 可能需要在三个地方修改；且不一致的解析行为会导致不同功能表现不一致。
**改进建议:**

- 在实现 "6.4 AST 与类型安全" 后，重构所有 Provider 以依赖统一的 `ThriftDocument` / AST。
- 移除各 Provider 中临时的正则解析代码。
- **优先级:** 高（应与 AST 工作同步进行）。
- ✅ 已实现：已重构 Provider 使用统一的 AST 解析器，并共享缓存与文件节流策略。

### 6.6 LSP (Language Server Protocol) 迁移

**当前状态:** 所有功能均作为 VS Code 扩展直接实现（`src/*.ts`）。
**问题:** 扩展主进程负载较重；逻辑无法复用到其他编辑器；难以实现增量编译和高效的跨文件索引。
**改进建议:**

- 将核心解析、诊断、格式化逻辑迁移到独立的 LSP Server。
- 客户端仅负责与 VS Code API 对接。
- **优先级:** 中/低（长期架构目标）。

## 7. 现状能力与路线图

### 7.1 已完成（基础能力已在主分支提供）

- 自动补全（基础关键字、常见方法名）
- 文档符号（DocumentSymbolProvider）
- 工作区符号（WorkspaceSymbolProvider）
- 全部引用（ReferencesProvider）
- 折叠与选区扩展（FoldingRange / SelectionRange）
- 诊断改进：注解“语义不透明”策略生效；字符串字面量内不计数括号；仅当栈顶为 `<` 时匹配 `>`；节流改为延时排队不再直接跳过
- 格式化回归修复：单行 struct/enum/service 逗号分隔不会丢字段；多行 const 闭合行携带注释不会吞并后续行
- 缓存与基础设施：新增 `src/utils/fileWatcher.ts` 单例监听器、`src/utils/cacheManager.ts` TTL 缓存、`src/utils/errorHandler.ts` 统一日志/提示、`src/utils/fileReader.ts` 文件读取；`src/ast/nodes.ts` + `src/ast/parser.ts` 提供缓存化 AST 层（5 分钟 TTL）
- 测试组织：重构为 `tests/src`（与 src 对齐）/`tests/scenarios`/`tests/utils`/`tests/debug`，保留统一执行器 `tests/run-all-unified.js` 与结构文档

### 7.2 新增进展（2025-12-27）

- CompletionProvider 现已使用 AST 语境，提供 include 路径（当前目录）、命名空间语言关键字、容器 snippet、枚举值/用户类型候选；仍为单文件范围、无排序/注解键候选
- Workspace / Document Symbol / References 统一使用 `ThriftFileWatcher` + `CacheManager`，加入文件列表节流（30s）和结果 TTL（10-60s），References 共享 AST 缓存避免重复解析
- 诊断：新增 300ms 延迟 + 1s 最小间隔的队列节流、文件依赖追踪、性能监控包装；错误统一交由 `ErrorHandler`，异常时原子清空诊断
- Code Actions：保留提取/移动类型命令，Quick Fix 已支持自动插入缺失 include（命名空间与未限定两类）并避免覆盖已存在文件
- 测试：补充诊断节流、moveType 安全、rename/navigation/formatter 回归用例并纳入 `run-all-unified`，覆盖基础能力是否可编译的冒烟测试

### 7.3 待增强与新增（优先级建议）

- Rename 回归：重命名后会导致对应定义被异常删除，需定位原因并修复（仍待处理）
- CompletionProvider 强化：跨文件/已 include 类型与枚举值、注解键候选、排序与上下文感知、include 路径跨目录/别名、去重与缓存
- Signature Help（缺失）：服务方法签名、容器类型参数、注解键提示
- Snippets（缺失）：struct/enum/service/typedef/const/include 常用骨架
- Inlay Hints（缺失）：字段编号、默认值、typedef 还原基类型等
- DocumentHighlight（缺失）：同名标识符文档内高亮
- Document/Workspace Symbol 提升：图标与层级结构、跨文件索引准确度、基于 AST 的精确范围与缓存失效策略
- References 提升：上下文过滤与预览面板、语义准确性/取消响应、与 diagnostics/definition 共享解析结果（已共享 AST 缓存，仍需精准度/预览/取消）
- Quick Fix：已支持 include 插入，待补“创建缺失类型/枚举成员”“修复缺失 namespace/typedef”
- 格式化增强：Organize Includes（排序/去重/规范化路径）、按字段 ID 排序（可选）、格式预览/差异预览命令（增量格式化仍待）
- 重构增强：抽取/内联 typedef、跨文件引用变更的预览与批量安全更新
- 架构与性能：LSP 化与增量索引/缓存；多根工作区与 monorepo 适配
- 与 Thrift 工具链集成：一键调用编译器生成 Stub；Problems 面板收集编译/生成告警
- 测试与 CI：端到端/UI（补全、F12、Outline、Refs）、性能基准、大仓库压力测试；为 moveType/extract/formatter/diagnostics 新增回归并接入 `run-all-unified`

### 7.4 现状速览（我们已具备）

- 定义跳转与跨文件 include 解析：`src/definitionProvider.ts`
- 重命名（跨文件）：`src/renameProvider.ts`
- 重构/Code Actions（基础能力）：`src/codeActionsProvider.ts`
- 诊断与规则校验（含 Thrift 语义约束）：`src/diagnostics.ts`
- 格式化与对齐策略：`src/formattingProvider.ts`、`src/thriftFormatter.ts`
- Hover 提示：`src/hoverProvider.ts`
- References：`src/referencesProvider.ts`
- 折叠/选区：`src/foldingRangeProvider.ts`、`src/selectionRangeProvider.ts`
- 符号：`src/documentSymbolProvider.ts`、`src/workspaceSymbolProvider.ts`
- AST 层：`src/ast/nodes.ts`、`src/ast/parser.ts`（带缓存清理 API）
- 基础设施：`src/utils/fileWatcher.ts`、`src/utils/cacheManager.ts`、`src/utils/errorHandler.ts`
- 语法高亮（TextMate）：`syntaxes/thrift.tmLanguage.json`

### 7.5 与通用语言插件对比的差距与可增强点

1) 智能感知与编辑体验

- 自动补全（CompletionProvider）
    - 关键字、内建/用户类型名、枚举值、服务/方法名、include 路径、常见注解键 候选项
    - 当前状态：基础版已上线；需补齐 include/注解/枚举值、排序和上下文感知
- 签名帮助（Signature Help）
    - 在服务方法、注解、容器类型等位置显示参数提示
    - 当前状态：缺失
- 代码片段（Snippets）
    - struct/enum/service/typedef/const/include 等常用骨架
    - 当前状态：缺失
- Inlay Hints（内联提示）
    - 如字段编号、默认值、typedef 还原后的基类型提示
    - 当前状态：缺失
- 折叠与选区扩展（FoldingRange/SelectionRange）
    - struct/enum/service/多行注释等可折叠；语法级选区渐进扩展
    - 当前状态：基础版已上线；需增加端到端验证与性能基准
- 文档高亮（DocumentHighlight）
    - 光标处标识符的同名引用在文档内高亮
    - 当前状态：缺失

2) 符号与导航生态

- 文档符号与大纲（DocumentSymbol + Outline）
    - struct/enum/service/typedef/const 列表、图标/层级
    - 当前状态：基础版已上线；需图标/层级优化和跨文件索引/性能提升
- 工作区符号（WorkspaceSymbol）
    - 支持全局快速定位任意类型/符号（Ctrl/Cmd+T）
    - 当前状态：基础版已上线；需索引缓存与大仓性能优化
- 全部引用（ReferencesProvider）
    - “Find All References / Peek References” 查找与预览所有引用点
    - 当前状态：基础版已上线；需上下文过滤、预览面板与 AST 统一/缓存共享

3) 语义高亮与主题适配

- 语义标记（Semantic Tokens）
    - 区分类型名、字段名、枚举成员、服务名、RPC 等角色
    - 当前状态：缺失（TextMate 已有但语义 Token 未实现）

4) 诊断与 Quick Fix（可修复建议）

- 现有诊断已覆盖大量语义校验（oneway、throws、uuid、容器类型等）
    - 可增强：重复字段 ID 检测、重复/越界枚举值、循环 include、未使用 typedef/无用 include、命名规范；节流与缓存策略的端到端验证
    - Quick Fix：缺失/可增强（例如“创建缺失类型的空壳定义”“自动插入缺失 include”“从引用处生成枚举成员”）

5) 格式化与“组织导入”

- 已有格式化能力并修复单行逗号/const 注释回归
    - 可增强：Organize Includes（统一 include 的排序/去重/规范化路径）、按配置对字段按 ID 排序（可选）、保存时格式化与组织；格式差异预览命令

6) 重构增强

- 已有 Rename、Code Actions（基础抽取/移动）
    - 可增强：从使用处“抽取 typedef/抽取到新文件”的更多场景；“内联 typedef”；命名空间/文件级重构的批量安全更新；跨文件引用变更的预览面板；为 moveType/extract 添加安全回归测试

7) 架构与性能

- LSP 化（Language Server Protocol）
    - 将解析/索引/诊断迁移到语言服务器，获得更好的性能、并发与可复用性（多编辑器/多 IDE 支持）
    - 增量索引与缓存、文件监听、取消与超时控制
    - 当前状态：可提升方向（目前为 VSCode 扩展内实现）
- 多根工作区与 monorepo 适配
    - include 搜索目录、别名/映射配置、软链接/生成目录支持等

8) 与 Thrift 工具链集成

- 任务与命令：一键调用 thrift 编译器生成各语言 Stub、在 Problems 面板收集编译/生成错误
- 诊断与生成器联动：将编译器/生成器的告警转化为编辑器内的诊断

9) 测试与 CI 生态

- 端到端 UI 测试（vscode-test / @vscode/test-electron）
    - 验证补全、F12、Outline、Refs 等交互
- 性能基准与大仓库压力测试
- 回归补齐：moveType/extract、格式化（逗号/注释）、诊断节流、AST 缓存清理

### 7.6 建议的增量路线图（优先级）

- P0（可用度）：CompletionProvider（跨文件类型/注解键/排序）、References 预览与上下文过滤、Document/Workspace Symbol 精度/层级、关键回归测试常驻 unified runner
- P1（效率与体验）：Quick Fix 补齐缺失类型/枚举成员、Snippets、Signature Help、Semantic Tokens、Organize Includes/字段排序配置
- P2（中长期）：LSP 与增量索引、Inlay Hints、诊断/重构扩展、与 thrift 编译器 Task/Problems 集成、端到端 UI/性能基准

## 8. 历史更新记录

- 2025-12-27：补齐 include Quick Fix 与 moveType 覆盖保护；CompletionProvider 引入 AST 语境与 include/枚举/容器 snippet；References/Document/Workspace Symbols 引入缓存与文件列表节流；诊断新增节流+性能监控+依赖追踪；测试补齐诊断/重构回归并挂入 unified runner。
- 2025-12-26：moveType 增加目标存在检测并避免覆盖；typedef 仅截取声明行；格式化支持单行逗号与 const 闭合行注释；诊断节流改为延迟队列；新增 AST 缓存层与 fileWatcher/cacheManager/errorHandler；测试目录重组 + 统一 runner。
- 2025-10-09：诊断策略优化（注解语义不透明、字符串内不计括号、仅栈顶为 `<` 匹配 `>`）；完善并通过全部测试。
