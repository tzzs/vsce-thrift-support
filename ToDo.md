已完成（基础能力已在主分支提供）

- 自动补全（基础关键字、常见方法名）
- 文档符号（DocumentSymbolProvider）
- 工作区符号（WorkspaceSymbolProvider）
- 全部引用（ReferencesProvider）
- 折叠与选区扩展（FoldingRange / SelectionRange）
- 诊断改进：注解“语义不透明”策略生效；字符串字面量内不计数括号；仅当栈顶为 `<` 时匹配 `>`；所有诊断与边界测试通过
- 文档：新增 `docs/annotation-policy.md`，明确注解策略与行为

待增强与新增（优先级建议）

- CompletionProvider 强化：类型名/用户类型/枚举值/include 路径/常见注解键
- Signature Help（缺失）：服务方法签名、容器类型参数、注解键提示
- Snippets（缺失）：struct/enum/service/typedef/const/include 常用骨架
- Inlay Hints（缺失）：字段编号、默认值、typedef 还原基类型等
- DocumentHighlight（缺失）：同名标识符文档内高亮
- Document/Workspace Symbol 提升：图标与层级结构、跨文件索引与性能
- References 提升：上下文过滤与预览面板、语义准确性
- Quick Fix（缺失）：创建缺失类型、插入缺失 include、从引用处生成枚举成员
- 格式化增强：Organize Includes（排序/去重/规范化路径）、按字段 ID 排序（可选）、格式预览/差异预览命令
- 重构增强：抽取/内联 typedef、跨文件引用变更的预览与批量安全更新
- 架构与性能：LSP 化与增量索引/缓存；多根工作区与 monorepo 适配
- 与 Thrift 工具链集成：一键调用编译器生成 Stub；Problems 面板收集编译/生成告警
- 测试与 CI：UI 端到端（补全、F12、Outline、Refs）、性能基准、大仓库压力测试、规则库单测

建议的近期路线图（按优先级分组）

- P0：CompletionProvider 强化；Document/Workspace Symbol 提升；References 与 Folding/Selection 完善
- P1：Quick Fix、Snippets、Semantic Tokens（语义高亮）
- P2：LSP 化、Inlay Hints、更多诊断与重构、与编译器的任务/Problems 集成

现状速览（我们已具备）

- 定义跳转与跨文件 include 解析：<mcfile name="definitionProvider.ts" path="src/definitionProvider.ts"></mcfile>
- 重命名（跨文件）：<mcfile name="renameProvider.ts" path="src/renameProvider.ts"></mcfile>
- 重构/Code Actions（基础能力）：<mcfile name="codeActionsProvider.ts" path="src/codeActionsProvider.ts"></mcfile>
- 诊断与规则校验（含 Thrift 语义约束）：<mcfile name="diagnostics.ts" path="src/diagnostics.ts"></mcfile>
- 格式化与对齐策略：<mcfile name="formattingProvider.ts" path="src/formattingProvider.ts"></mcfile>
- Hover 提示（已有基础版）：<mcfile name="hoverProvider.ts" path="src/hoverProvider.ts"></mcfile>
- 语法高亮（TextMate）：<mcfile name="thrift.tmLanguage.json" path="syntaxes/thrift.tmLanguage.json"></mcfile>

与通用语言插件对比的差距与可增强点

1) 智能感知与编辑体验

- 自动补全（CompletionProvider）
    - 关键字、内建/用户类型名、枚举值、服务/方法名、include 路径、常见注解键 候选项
    - 当前状态：缺失（建议优先补齐）
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
    - 当前状态：缺失
- 文档高亮（DocumentHighlight）
    - 光标处标识符的同名引用在文档内高亮
    - 当前状态：缺失

2) 符号与导航生态

- 文档符号与大纲（DocumentSymbol + Outline）
    - 让 Explorer Outline 列出 struct/enum/service/typedef/const 等，并显示图标/层级
    - 当前状态：缺失（建议优先补齐）
- 工作区符号（WorkspaceSymbol）
    - 支持全局快速定位任意类型/符号（Ctrl/Cmd+T）
    - 当前状态：缺失（建议优先补齐）
- 全部引用（ReferencesProvider）
    - “Find All References / Peek References” 查找与预览所有引用点
    - 当前状态：缺失（建议优先补齐）

3) 语义高亮与主题适配

- 语义标记（Semantic Tokens）
    - 区分类型名、字段名、枚举成员、服务名、RPC 等角色，获得更一致的高亮与主题适配
    - 当前状态：缺失（TextMate 已有，但语义 Token 能力更强）

4) 诊断与 Quick Fix（可修复建议）

- 现有诊断已覆盖大量语义校验（oneway、throws、uuid、容器类型等）
    - 可增强：重复字段 ID 检测、重复/越界枚举值、循环 include、未使用 typedef/无用 include、命名规范（如 service/struct/enum
      命名约定）
    - Quick Fix：缺失/可增强（例如“创建缺失类型的空壳定义”“自动插入缺失 include”“从引用处生成枚举成员”）

5) 格式化与“组织导入”

- 已有强力格式化能力
    - 可增强：Organize Includes（统一 include 的排序/去重/规范化路径）、按配置对字段按 ID 排序（可选）、保存时格式化与组织
    - 提供格式预览或格式差异预览命令（可选）

6) 重构增强

- 已有 Rename、以及部分 Code Actions
    - 可增强：从使用处“抽取 typedef/抽取到新文件”的更多场景；“内联 typedef”；命名空间/文件级重构的批量安全更新；跨文件引用变更的预览面板

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
- 规则库单独单测（Quick Fix 行为、复杂诊断）

建议的增量路线图（优先级）

- P0（提升“可用度”的关键）：
    - CompletionProvider（类型/关键字/include 路径/枚举值）
    - DocumentSymbol + WorkspaceSymbol（大纲 + 全局符号跳转）
    - ReferencesProvider（Find All References）
    - FoldingRange/SelectionRange（折叠与选区扩展）
- P1（提升“质量与效率”的关键）：
    - Quick Fix 基础能力（缺失 include、创建空壳类型/枚举成员）
    - Snippets（常用骨架）
    - Semantic Tokens（强化语义高亮）
- P2（中长期）：
    - 迁移到 LSP、引入增量索引与缓存
    - Inlay Hints、更多诊断规则与重构
    - 与 thrift 编译器的 Task/Problems 集成

历史更新记录

- 2025-10-09：诊断策略优化（注解语义不透明、字符串内不计括号、仅栈顶为 `<` 匹配 `>`）；完善并通过全部测试。
        