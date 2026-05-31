# 调试脚本目录

本目录保存开发和排障期间使用的调试、分析与工具脚本。它们不属于默认发布门禁；默认测试契约仍是 `tests/src/**/*.js`、`tests/cli/**/*.js` 与 `tests/perf/**/*.js` 中接入 npm/CI 的脚本。

## 目录结构

```
- debug/    # 复现和调试脚本（包含必要 mock）
- analysis/ # 测试结果或行为分析脚本
- manual/   # 从 tests/ 根目录归档的历史手动脚本
- tools/    # 修复、生成、辅助工具脚本
```

## debug/
常见内容：
- `debug-*.js`（formatter/parser/service 调试）
- `repro_*.js`, `reproduce_issue.*`
- `simple-test.js`, `test_debug.js`
- `mock-vscode.js`, `mock_vscode.js`

## analysis/
常见内容：
- `analyze-*.js`
- `standalone-analyzer.js`

## tools/
常见内容：
- `fix-*.js`
- `generate-test-files.js`
- `format-example.js`
- `find-failure.js`, `show-failure.js`
- `final-blank-line-verification.js`
- `simple-test-framework.js`

## manual/
常见内容：
- 旧版 `tests/test-*.js` 脚本
- 旧版 `tests/run-*.js`、`tests/verify-*.js` 和 `tests/reproduce_*.js` 脚本
- 语法高亮、格式化、stream/sink 语义等历史手动验证脚本
- 已有规范 Mocha 测试覆盖但仍可能用于本地复现的样例脚本

## 使用约定

这些脚本只用于本地开发和问题复现。若某个脚本验证的是长期有效的行为，应将它提升为 `tests/src/**` 下的 Mocha 测试，再纳入 CI；否则应保留在 `tests/debug/**` 或 `tools/debug/**`，避免被误认为发布门禁。`manual/` 中的脚本已从根目录归档，不会被默认 Mocha glob 或 CI 直接执行。
