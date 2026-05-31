# Repository Guidelines

## Project Overview

VS Code extension for Apache Thrift IDL: syntax highlighting, formatting, diagnostics, navigation, completion, rename, and refactoring. Uses VS Code's built-in language provider APIs (no language server).

## Build Pipeline (Two-Stage)

1. `tsc -p ./` compiles `src/**/*.ts` → `out/src/` (via tsconfig.json)
2. `esbuild` (via `build.js`) bundles `src/extension.ts` → `dist/extension.js`
3. The extension entrypoint is `dist/extension.js` (`package.json` `main`)
4. Tests import from `out/src/...` (compiled, not bundled); the require-hook remaps these paths

| Command | What it does |
|---------|-------------|
| `npm run compile` | TypeScript → `out/` |
| `npm run build` | `clean` → `compile` → `bundle` |
| `npm test` | `build` → `mocha` (spec: `tests/src/**/*.js`) |
| `npm run test:single` | `build` → single test file (via `.mocharc.single.json`) |
| `npm run lint` | ESLint flat config (`eslint.config.mjs`), `src/` only |
| `npm run lint:fix` | ESLint with `--fix` |
| `npm run coverage` | `build` → `nyc` + `mocha` |
| `npm run package` | Create `.vsix` |

## Key Conventions & Gotchas

- **Node 24.x required** (recommended 24.16.0, matching `.nvmrc`, `.node-version`, package `engines.node`, and CI). Mismatched versions can break dependency installs or builds, including `undici`-related failures.
- **ESLint flat config**: `eslint.config.mjs`. The `--ext ts` flag in `lint:fix` is needed despite flat config (works with the typescript-eslint parser setup).
- **`no-console` is `error`** — agents must not use `console.log` in `src/`. Use the `ErrorHandler` service instead.
- **Diagnostics entrypoint**: `src/diagnostics/index.ts` (NOT `src/diagnostics.ts`).
- **Dependency injection**: `createCoreDependencies()` in `src/utils/dependencies.ts` creates a `CoreDependencies` object injected into all providers and commands. `extension.ts` → `createCoreDependencies()` → `registerProviders(deps)` + `registerCommands(deps)`.
- **UUID is a built-in primitive** (Thrift IDL 0.23+). All providers must include `uuid` in primitive type sets.
- **Semicolons are never replaced with commas**. `trailingComma: "preserve"` uses suffix-string inspection; `"remove"` strips commas; `"add"` appends them.
- **Alignment config quirks**:
  - `alignAssignments` is a master switch for struct field `=` and enum `=`/values
  - `alignStructDefaults` is **independent** from `alignAssignments`
  - `alignAnnotations` falls back to deprecated `alignStructAnnotations` if not explicitly set
  - When `alignComments` is off, comments may coincidentally align — this is NOT forced
- **Config key namespace**: `thrift.format.*` (primary), legacy `thrift-support.formatting.*` as fallback (see `src/formatting-bridge/options.ts`).

## Testing

- **Framework**: Mocha with `describe`/`it` blocks, timeout 30s
- **Test files**: `tests/src/**/*.js`, organized by module mirroring `src/`
- **Fixture files**: `test-files/` and `tests/test-files/`
- **VSCode mock is automatic**: `.mocharc.json` loads `tests/require-hook.js` which intercepts all `require('vscode')` calls and returns `tests/mock_vscode.js`. Never manually mock `vscode` or override `Module.prototype.require`.
- **Test requires**: Import from `../../../out/...` (compiled output). The require-hook remaps `../out/src/` → actual compiled files.
- **Run a single test file**: `npx mocha --config .mocharc.single.json tests/src/formatter/test-struct-formatting.js`
- **CI pipeline**: `npm ci` → `lint` → `build` → `test`
- **All requires at file top-level** — never inside `describe`/`it` blocks.

## Performance & Memory

- `PerformanceMonitor` (`src/performance-monitor.ts`): instruments operations, generates Markdown reports
- `MemoryMonitor` (`src/utils/memory-monitor.ts`): heap tracking, memory pressure detection, adjusts cache sizes
- `MemoryAwareCacheManager` (`src/utils/cache-manager.ts`): LRU-K with TTL and memory-pressure-based eviction

## Commits & CI

- **Conventional Commits**: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `perf:`
- **Default branch**: `master`
- **release-please** generates release PRs from conventional commits; `publish.yml` publishes to VS Marketplace + Open VSX on GitHub Release
- **Before PR**: `npm run lint && npm run build && npm test`
- **代码修改后必须执行 `npm run lint:fix` 并解决所有代码规范问题。**
