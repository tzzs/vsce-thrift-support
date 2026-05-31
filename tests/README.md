# 测试目录说明

## 规范 Mocha 测试

`tests/src/**/*.js` 是扩展与 core 的规范测试套件，由 `.mocharc.json` 加载。

## CLI 测试

`tests/cli/**/*.js` 覆盖 CLI 包。修改 CLI 行为时，应运行 `npm run coverage:cli`。

## 性能测试

`tests/perf/**` 保存性能基准和断言脚本。修改 parser、formatter、diagnostics、cache 或 workspace indexing 后，应运行 `npm run perf:benchmark`。

## 调试与手动复现脚本

`tests/debug/**` 不属于默认 Mocha 契约，除非显式接入 `.mocharc.json`。历史根目录 `tests/test-*.js` 已归档到 `tests/debug/manual/**`。
如果要把手动复现脚本提升为回归测试，请移动到 `tests/src/**`，并保持所有 `require` 位于文件顶层。
