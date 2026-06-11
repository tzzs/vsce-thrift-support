# Troubleshooting

本文档列举常见问题及其解决方法。如果未找到答案，请在 [GitHub Issues](https://github.com/tzzs/vsce-thrift-support/issues) 提交问题。

---

## 目录

- [扩展未生效](#扩展未生效)
- [格式化问题](#格式化问题)
- [诊断与错误提示](#诊断与错误提示)
- [定义跳转与引用查找](#定义跳转与引用查找)
- [CLI 工具问题](#cli-工具问题)
- [开发环境问题](#开发环境问题)
- [报告问题](#报告问题)

---

## 扩展未生效

### 语法高亮不显示

**原因**：文件未关联到 `thrift` 语言模式。

**解决**：
1. 点击 VS Code 右下角的语言标识符
2. 选择 "Configure File Association for '.thrift'"
3. 搜索并选择 "Thrift"

或者在 `.vscode/settings.json` 中添加：
```json
{
  "files.associations": {
    "*.thrift": "thrift"
  }
}
```

### 格式化/诊断/跳转功能不可用

**检查步骤**：
1. 打开命令面板（`Ctrl+Shift+P`），输入 `Extensions: Show Installed Extensions`，确认 "Thrift Support" 已启用
2. 打开 VS Code 输出面板（`View → Output`），在下拉菜单中选择 "Thrift Support"，查看是否有报错
3. 重新加载窗口：`Ctrl+Shift+P` → `Developer: Reload Window`

---

## 格式化问题

### 格式化后结果不符合预期

**可能原因及解决**：

1. **缩进被更改**：检查 `thrift.format.indentSize`（默认 4）是否与预期一致。VS Code 全局的 `editor.tabSize` 不影响 Thrift 格式化。

2. **尾随逗号被添加/删除**：`thrift.format.trailingComma` 默认为 `"preserve"`（保持原样）。若要强制添加或移除，分别设为 `"add"` 或 `"remove"`。

3. **注释位置改变**：行尾注释默认会对齐（`alignComments: true`）。若不希望对齐，设置 `"thrift.format.alignComments": false`。

4. **集合值展开为多行**：`collectionStyle` 默认 `"preserve"`，设为 `"multiline"` 时会强制展开。改回 `"preserve"` 或 `"auto"` 即可。

### 格式化后分号被替换为逗号

扩展不会将分号替换为逗号。若发现此现象，请检查是否有其他格式化插件介入。可在 `.vscode/settings.json` 中指定 Thrift 文件的默认格式化程序：

```json
{
  "[thrift]": {
    "editor.defaultFormatter": "tanzz.thrift-support"
  }
}
```

### 选区格式化范围不对

选区格式化会自动扩展到最近的完整结构块（struct/enum/service）边界，这是设计行为。若需要精确控制，请格式化整个文件。

---

## 诊断与错误提示

### 报告了不存在的错误

**场景 1：`type.unknown` 误报已定义的类型**

检查该类型是否在另一个 `include` 文件中定义。若 `include` 路径不正确，扩展无法解析跨文件类型。

**场景 2：include 路径报错**

Thrift 的 `include` 路径是相对于当前文件的路径。例如：

```thrift
// 当前文件：src/api/user.thrift
include "common/base.thrift"   // ✅ 相对路径：src/api/common/base.thrift
include "../common/base.thrift" // ✅ 上级目录：src/common/base.thrift
include "base.thrift"           // ✅ 同目录：src/api/base.thrift
```

**场景 3：`enum.negativeValue` 误报**

部分 Thrift 实现允许负枚举值，但标准规范不支持。若需要负值，可忽略此诊断；后续版本将考虑提供忽略配置。

### 诊断不更新

1. 确认文件已保存（诊断在编辑和保存时均会触发）
2. 若问题持续，重新加载窗口清空诊断状态
3. 检查输出面板是否有 `DiagnosticsManager` 的报错

### 诊断过多导致界面卡顿

大型工作区中若有数百个 Thrift 文件同时需要诊断，可能出现短暂延迟。扩展内置了防抖（300ms）和并发限制（同时 ≤3 个文件），通常会在几秒内完成。如果卡顿持续，请参考 [PERFORMANCE.md](PERFORMANCE.md) 中的建议。

---

## 定义跳转与引用查找

### `F12` 无法跳转到定义

**检查清单**：

1. 目标类型是否为内建类型（`bool`/`byte`/`i8`/`i16`/`i32`/`i64`/`double`/`string`/`binary`/`uuid`）？内建类型不支持跳转。

2. 定义是否在 `include` 文件中？确认 include 路径正确，且目标文件存在。

3. 工作区是否超过 1000 个 Thrift 文件？超过后工作区搜索可能不完整。

4. 尝试 `Go to References`（`Shift+F12`）——若引用可以找到，说明定义解析有问题，请提交 issue。

### 引用查找结果不完整

引用查找依赖文件列表缓存（每 30 秒刷新一次）。若刚添加了新文件：

1. 等待约 30 秒让缓存自动刷新
2. 或重新加载窗口立即刷新

---

## CLI 工具问题

### `thrift-support: command not found`

```bash
# 确认全局安装
npm list -g thrift-support

# 若未安装
npm install -g thrift-support

# 或使用 npx 临时运行
npx thrift-support format --check src/**/*.thrift
```

### `format --check` 在 CI 中对未修改文件报错

`--check` 比对格式化结果与原文件，若有任何差异都会返回 exit code 1。确保提交前在本地执行 `thrift-support format --write` 并提交格式化后的文件。

### glob 模式不匹配文件

CLI 使用 Node.js 内置的 glob 实现，不依赖 shell 展开。确保模式正确：

```bash
# 递归匹配所有 .thrift 文件
thrift-support lint "src/**/*.thrift"

# 匹配特定目录下的文件
thrift-support lint "src/api/*.thrift" "src/common/*.thrift"
```

注意：在 shell 中使用时需用引号包裹 glob 模式，防止 shell 提前展开。

### `.thriftrc.json` 配置未生效

CLI 从运行目录（或 `--stdin-filepath` 指向的目录）向上查找 `.thriftrc.json`。确认配置文件在正确的目录，且 JSON 格式有效：

```bash
# 验证配置文件 JSON 格式
cat .thriftrc.json | node -e "process.stdin.resume(); let d=''; process.stdin.on('data', c => d+=c); process.stdin.on('end', () => { JSON.parse(d); console.log('valid'); })"
```

---

## 开发环境问题

### `pnpm install` 失败

确认 Node.js 版本与 CI 一致（Node 24.x，仓库推荐 24.16.0）：

```bash
node --version   # 应为 v24.16.0 或兼容的 24.x
pnpm --version   # 应为 11.5.0
```

使用 `nvm` 切换版本：

```bash
nvm install 24.16.0
nvm use 24.16.0
corepack enable
```

### `pnpm test` 在干净 checkout 失败

需要先编译 core 包：

```bash
pnpm run build:core  # 编译 packages/core
pnpm test            # 再运行测试
```

或直接使用 `pnpm run build` 完整构建后再测试。

### TypeScript 编译报 `Cannot find module '@tanzz/thrift-core'`

```bash
# 确认 core 包已编译
ls packages/core/out/index.js

# 若不存在，手动编译
cd packages/core && npx tsc -p .
```

### ESLint 报 `You have used a rule which requires type information`

ESLint 的 type-aware 规则需要先有编译输出。确保在 lint 前已编译 core：

```bash
pnpm run build:core && pnpm run lint
```

CI 中 `ci.yml` 已保证步骤顺序（Build core → Lint → Build → Test）。

### 测试失败：`Cannot read properties of undefined`

通常是 vscode mock 缺少某个 API。检查 `tests/mock_vscode.js` 是否包含测试用到的 VS Code API，必要时按照 `DEVELOPMENT.md` 中的说明扩展 mock。

---

## 报告问题

提交 issue 时请提供：

1. **扩展版本**：帮助菜单 → 关于 → 已安装扩展
2. **VS Code 版本**：`code --version`
3. **操作系统**：macOS/Windows/Linux 及版本
4. **重现步骤**：最小化的可重现步骤
5. **最小 Thrift 示例**：能触发问题的最小 `.thrift` 文件内容
6. **期望行为 vs 实际行为**
7. **输出面板日志**：`View → Output → Thrift Support`

提交地址：[https://github.com/tzzs/vsce-thrift-support/issues](https://github.com/tzzs/vsce-thrift-support/issues)
