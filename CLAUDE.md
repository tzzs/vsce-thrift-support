# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在本仓库工作时提供指导。

## 项目概览

这是一个 VS Code 扩展，为 Apache Thrift IDL 文件提供完整的语言支持。扩展包含语法高亮、代码格式化、导航、诊断与重构能力，面向 `.thrift` 文件。

## 开发环境

**关键要求：**

- Node.js：22.18.0（必须与 CI 版本一致）
- VS Code Engine：^1.75.0
- TypeScript：^4.9.4
- @vscode/vsce：^3.6.0（注意：包名从 `vsce` 变更为 `@vscode/vsce`）

## 常用命令

### 构建与开发

```bash
npm install          # 安装依赖（使用 Node 22.18.0）
npm run compile      # 编译 TypeScript
npm run watch        # 开发模式，自动编译
npm run build        # 清理并编译
npm run lint         # 对 src/**/*.ts 运行 ESLint
```

### 测试

```bash
npm test             # 运行主测试（含导航）
npm run test:all     # 运行所有独立测试
npm run test:all:node # 通过 node 脚本运行全部测试
npm run coverage     # 生成覆盖率报告

# 单独测试套件
npm run test:complex     # 复杂类型格式化
npm run test:enum        # 枚举格式化
npm run test:indent      # 缩进宽度测试
npm run test:comma       # 尾随逗号测试
npm run test:const       # 常量格式化测试
```

### 打包与发布

```bash
npm run package      # 生成 .vsix 扩展包
npm run publish      # 发布到 VS Code Marketplace（需要 VSCE_PAT）
```

### 性能测试

```bash
npm run perf:benchmark    # 运行性能基准测试
```

## Claude Code 自动化配置

项目已配置 Claude Code hooks，在编写文件前后自动执行构建和测试：

- **PreToolUse**: 在写入文件前运行 `npm run build` 进行预构建验证
- **PostToolUse**: 在写入文件后运行 `npm run test:single` 进行测试验证

权限配置包括对常用开发工具的访问权限：
- `Bash(npm *)`, `Bash(npx *)`: 包管理与执行
- `Bash(tsc *)`, `Bash(ts-node *)`: TypeScript 编译与执行
- `Bash(mocha *)`: 测试运行
- `Bash(vsce *)`: VS Code 扩展打包工具
- `Bash(eslint *)`: 代码质量检查

## 架构概览

### 核心模块结构

- `src/extension.ts` - 扩展入口，注册所有 provider 与命令
- `src/formatting-bridge/index.ts` - 文档与范围格式化（含对齐策略）
- `src/definition-provider.ts` - 跳转定义与 include 解析
- `src/diagnostics/index.ts` - 语法与语义诊断
- `src/rename-provider.ts` - 跨文件符号重命名
- `src/code-actions-provider.ts` - 重构动作（提取类型、移动类型）
- `src/hover-provider.ts` - 悬停文档

### 关键设计模式

1. **Formatting Pipeline**：Parse → Analyze alignment widths → Transform → Output
2. **Include Resolution**：构建依赖图以支持跨文件导航
3. **Configuration-Driven**：格式化行为由 VS Code 配置驱动
4. **Error Recovery**：解析器容错以保持原有布局

### Language Server 集成点

扩展使用 VS Code 内置语言特性 API，不使用独立的 Language Server。所有 provider 通过扩展宿主 API 注册。

## 配置系统

`package.json` 中 `contributes.configuration` 的关键设置：

- `thrift.format.*` - 格式化行为（对齐、缩进、尾随逗号）
- `thrift.format.alignAssignments` - 等号/值对齐总开关
- `thrift.format.alignStructDefaults` - 仅影响结构体默认值对齐
- `thrift.format.collectionStyle` - 常量集合格式化风格

## 测试策略

测试位于 `tests/`，对应样例文件在 `test-files/`：

- 单元测试覆盖各格式化功能
- 集成测试覆盖导航与重构
- 测试样例使用真实 `.thrift` 语法

## 发布流程

通过 GitHub Actions 自动化：

1. `release-please` 工作流 - 基于 Conventional Commits 生成 release PR
2. `publish` 工作流 - 构建并发布到 VS Code Marketplace 与 Open VSX

使用 Conventional Commits：`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `perf:`

## 重要实现说明

1. **UUID Support**：Apache Thrift IDL 0.23+ 将 `uuid` 视为内置原始类型，需在各 provider 中一致处理。

2. **Alignment Rules**：
    - `alignAssignments` 同时控制 struct 字段与 enum 的等号/值对齐
    - `alignStructDefaults` 独立控制 struct 默认值对齐
    - Comment 对齐仅在 `alignComments` 显式启用时生效

3. **Trailing Comma Logic**：尊重现有分号，不会用 `,` 替换 `;`

4. **Include Path Resolution**：使用当前文件位置的相对路径

5. **Refactoring Safety**：重命名操作内置冲突检测

## 语言要求

重要说明：当与 Claude Code 交互时，请遵守以下语言规则：
- **思考过程**：始终使用英语进行思考和分析
- **回复内容**：所有对外回复必须使用中文
- **代码注释**：保持现有代码的英文注释不变
- **技术术语**：保留专业术语的英文表达

This ensures clear communication while maintaining the project's international development standards.
