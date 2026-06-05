# 测试目录说明

## 规范 Mocha 测试

`tests/src/**/*.js` 是扩展与 core 的规范测试套件，由 `.mocharc.json` 加载。

## CLI 测试

`tests/cli/**/*.js` 覆盖 CLI 包。修改 CLI 行为时，应运行 `npm run coverage:cli`。

## 场景测试

`tests/scenarios/**` 保存跨文件、格式化、导航和回归场景。它们适合承载用户旅程或多文件复现；如果某个场景成为长期发布门禁，应确保它也能通过默认 Mocha 配置或迁移到 `tests/src/**`。

## 性能测试

`tests/perf/**` 保存性能基准和断言脚本。修改 parser、formatter、diagnostics、cache 或 workspace indexing 后，应运行 `npm run perf:benchmark`。

## 夹具与 Golden 文件

- `test-files/`：根目录共享示例和测试输入。
- `tests/test-files/`：测试套件局部 Thrift 输入。
- `tests/fixtures/golden/`：格式化/parser 等 golden 输出。

新增夹具时优先复用已有目录，并在测试名中说明行为目的，避免只按 issue 编号命名。

## 调试与手动复现脚本

`tests/debug/**` 不属于默认 Mocha 契约，除非显式接入 `.mocharc.json`。历史根目录 `tests/test-*.js` 已归档到 `tests/debug/manual/**`。
如果要把手动复现脚本提升为回归测试，请移动到 `tests/src/**`，并保持所有 `require` 位于文件顶层。
