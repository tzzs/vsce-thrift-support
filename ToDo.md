当前版本：1.0.12（2025-12-29 打包）

已完成（基础能力已在主分支提供）

- 自动补全（基础关键字、常见方法名）
- 文档符号（DocumentSymbolProvider）
- 工作区符号（WorkspaceSymbolProvider）
- 全部引用（ReferencesProvider）
- 折叠与选区扩展（FoldingRange / SelectionRange）
- 诊断改进：注解“语义不透明”策略生效；字符串字面量内不计数括号；仅当栈顶为 `<` 时匹配 `>`；节流改为延时排队不再直接跳过
- 格式化回归修复：单行 struct/enum/service 逗号分隔不会丢字段；多行 const 闭合行携带注释不会吞并后续行
- 缓存与基础设施：新增 `src/utils/fileWatcher.ts` 单例监听器、`src/utils/cacheManager.ts` TTL 缓存、`src/utils/errorHandler.ts` 统一日志/提示；`src/ast/nodes.ts` + `src/ast/parser.ts` 提供缓存化 AST 层（5 分钟 TTL）
- 测试组织：重构为 `tests/src`（与 src 对齐）/`tests/scenarios`/`tests/utils`/`tests/debug`，保留统一执行器 `tests/run-all-unified.js` 与结构文档

新增进展（2025-12-27）

- CompletionProvider 现已使用 AST 语境，提供 include 路径（当前目录）、命名空间语言关键字、容器 snippet、枚举值/用户类型候选；仍为单文件范围、无排序/注解键候选
- Workspace / Document Symbol / References 统一使用 `ThriftFileWatcher` + `CacheManager`，加入文件列表节流（30s）和结果 TTL（10-60s），References 共享 AST 缓存避免重复解析
- 诊断：新增 300ms 延迟 + 1s 最小间隔的队列节流、文件依赖追踪、性能监控包装；错误统一交由 `ErrorHandler`，异常时原子清空诊断
- Code Actions：保留提取/移动类型命令，Quick Fix 已支持自动插入缺失 include（命名空间与未限定两类）并避免覆盖已存在文件
- 测试：补充诊断节流、moveType 安全、rename/navigation/formatter 回归用例并纳入 `run-all-unified`，覆盖基础能力是否可编译的冒烟测试

待增强与新增（优先级建议）

- CompletionProvider 强化：跨文件/已 include 类型与枚举值、注解键候选、排序与上下文感知、include 路径跨目录/别名、去重与缓存
- Signature Help（缺失）：服务方法签名、容器类型参数、注解键提示
- Snippets（缺失）：struct/enum/service/typedef/const/include 常用骨架
- Inlay Hints（缺失）：字段编号、默认值、typedef 还原基类型等
- DocumentHighlight（缺失）：同名标识符文档内高亮
- Document/Workspace Symbol 提升：图标与层级结构、跨文件索引准确度、基于 AST 的精确范围与缓存失效策略
- References 提升：上下文过滤与预览面板、语义准确性/取消响应、与 diagnostics/definition 共享解析结果
- Quick Fix：已支持 include 插入，待补“创建缺失类型/枚举成员”“修复缺失 namespace/typedef”
- 格式化增强：Organize Includes（排序/去重/规范化路径）、按字段 ID 排序（可选）、格式预览/差异预览命令
- 重构增强：抽取/内联 typedef、跨文件引用变更的预览与批量安全更新
- 架构与性能：LSP 化与增量索引/缓存；多根工作区与 monorepo 适配
- 与 Thrift 工具链集成：一键调用编译器生成 Stub；Problems 面板收集编译/生成告警
- 测试与 CI：端到端/UI（补全、F12、Outline、Refs）、性能基准、大仓库压力测试；为 moveType/extract/formatter/diagnostics 新增回归并接入 `run-all-unified`

建议的近期路线图（按优先级分组）

- P0：CompletionProvider 跨文件/注解键/排序；References 精准度与取消/预览（共享 AST）；Document/Workspace Symbols 精确范围与层级展示；持续补齐 formatter/诊断/重构回归并挂入 `run-all-unified.js`
- P1：Quick Fix 扩展（创建缺失类型/枚举成员、namespace/typedef 修复）、Snippets、Signature Help、Semantic Tokens；Organize Includes + 字段排序配置化
- P2：LSP 化与增量索引、Inlay Hints、更多诊断与重构、与 thrift 编译器的 Task/Problems 集成、端到端 UI/性能基准

现状速览（我们已具备）

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

与通用语言插件对比的差距与可增强点

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

建议的增量路线图（优先级）

- P0（可用度）：CompletionProvider（跨文件类型/注解键/排序）、References 预览与上下文过滤、Document/Workspace Symbol 精度/层级、关键回归测试常驻 unified runner
- P1（效率与体验）：Quick Fix 补齐缺失类型/枚举成员、Snippets、Signature Help、Semantic Tokens、Organize Includes/字段排序配置
- P2（中长期）：LSP 与增量索引、Inlay Hints、诊断/重构扩展、与 thrift 编译器 Task/Problems 集成、端到端 UI/性能基准

历史更新记录

- 2025-12-27：补齐 include Quick Fix 与 moveType 覆盖保护；CompletionProvider 引入 AST 语境与 include/枚举/容器 snippet；References/Document/Workspace Symbols 引入缓存与文件列表节流；诊断新增节流+性能监控+依赖追踪；测试补齐诊断/重构回归并挂入 unified runner。
- 2025-12-26：moveType 增加目标存在检测并避免覆盖；typedef 仅截取声明行；格式化支持单行逗号与 const 闭合行注释；诊断节流改为延迟队列；新增 AST 缓存层与 fileWatcher/cacheManager/errorHandler；测试目录重组 + 统一 runner。
- 2025-10-09：诊断策略优化（注解语义不透明、字符串内不计括号、仅栈顶为 `<` 匹配 `>`）；完善并通过全部测试。
