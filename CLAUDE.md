# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VS Code extension providing comprehensive language support for Apache Thrift IDL files — syntax highlighting, formatting, diagnostics, navigation, completion, rename, and refactoring. Uses VS Code's built-in language provider APIs (no separate language server).

## Development Environment

- Node.js: 22.18.0 (must match CI)
- VS Code Engine: ^1.75.0
- TypeScript: ^4.9.5
- ESLint: ^9.15.0 (flat config, `eslint.config.mjs`)
- Test framework: Mocha ^11.7.5
- Package: `@vscode/vsce` ^3.6.2 (note: was renamed from `vsce`)

## Essential Commands

```bash
npm install            # Install dependencies
npm run compile        # Compile TypeScript (tsc -p ./)
npm run watch          # Dev mode with auto-compilation
npm run build          # Clean + compile
npm run lint           # ESLint (flat config, no --ext flag)
npm run lint:fix       # Auto-fix lint issues
```

### Testing

```bash
npm test               # Build + run full Mocha suite (tests/src/**/*.js)
npm run test:single    # Build + run single test via .mocharc.single.json
npm run coverage       # Coverage report via nyc + mocha

# Run a single test file
npx mocha --config .mocharc.single.json tests/src/formatter/test-struct-formatting.js

# Run a scenario test
npx mocha tests/scenarios/formatting/test-full-file-format.js
```

Tests use a require hook (`tests/require-hook.js`) that mocks the `vscode` module via `tests/mock_vscode.js`. All tests import from `../out/src/...` (compiled output). Mocha config: timeout 30s, `.mocharc.json` for full suite, `.mocharc.single.json` for single files.

### Pre-push Checklist (matches CI)

```bash
npm run lint && npm run build && npm test
```

### Packaging

```bash
npm run package        # Create .vsix
npm run publish        # Publish to Marketplace (requires VSCE_PAT)
```

## Architecture

### Dependency Injection Pattern

The extension uses a central `createCoreDependencies()` factory (`src/utils/dependencies.ts`) producing a `CoreDependencies` object (cacheManager, errorHandler, fileWatcher, incrementalTracker, performanceMonitor, memoryMonitor) injected into all providers and commands.

```
extension.ts
  createCoreDependencies()     → utils/dependencies.ts
  registerProviders(deps)      → setup.ts
  registerCommands(deps)       → commands/
```

### Module Map

| Module | Path | Role |
|--------|------|------|
| **AST** | `src/ast/` | Tokenizer + parser with full/incremental modes and content-hash-based caching. `nodes.types.ts` defines all AST node interfaces. `parser.ts` is the main `ThriftParser` class. |
| **Formatter** | `src/formatter/` | Core formatting engine: field parsing/alignment, struct/enum/service/const formatting, comment alignment, generics normalization, collection expansion. Entry: `formatter-core.ts`. |
| **Formatting Bridge** | `src/formatting-bridge/` | Adapter between VS Code API and core formatter. Handles range expansion, incremental formatting (minimal edits), and config resolution. Entry: `index.ts` (`ThriftFormattingProvider`). |
| **Diagnostics** | `src/diagnostics/` | Full diagnostic system with scheduling, throttling, per-document state, dependency tracking, incremental analysis, and LRU caching. Rule implementations in `rules/`. |
| **Definition** | `src/definition/` + `src/definition-provider.ts` | Go-to-definition with include resolution, namespace-aware lookup, workspace-wide fallback. |
| **References** | `src/references/` + `src/references-provider.ts` | Find All References with AST traversal, file list caching, rate limiting. |
| **Completion** | `src/completion/` + `src/completion-provider.ts` | IntelliSense: keywords, types, include paths, namespace languages, enum values. |
| **Config** | `src/config/` | Centralized defaults, VS Code settings integration, cache config management. |
| **Utils** | `src/utils/` | Shared infrastructure: `cache-manager.ts` (LRU-K with memory pressure eviction), `error-handler.ts`, `file-watcher.ts`, `incremental-tracker.ts`, `memory-monitor.ts`, `line-range.ts`. |
| **Commands** | `src/commands/` | VS Code commands: format, refactor (extract type, move type), performance/memory reports. |
| **Interfaces** | `src/interfaces.types.ts` | Shared types: `ThriftFormattingOptions`, `StructField`, `EnumField`, `ConstField`. |

Other single-file providers: `hover-provider.ts`, `document-symbol-provider.ts`, `workspace-symbol-provider.ts`, `folding-range-provider.ts`, `selection-range-provider.ts`, `rename-provider.ts`, `code-actions-provider.ts`. All registered in `setup.ts`.

### Performance & Memory

`PerformanceMonitor` (`src/performance-monitor.ts`) instruments operations with adaptive sampling, tracks avg/min/max/p95 durations, generates Markdown reports. `MemoryMonitor` (`src/utils/memory-monitor.ts`) records heap usage, detects memory pressure, dynamically adjusts cache sizes. `MemoryAwareCacheManager` (`src/utils/cache-manager.ts`) provides LRU-K caching with TTL and memory-pressure-based eviction across all feature areas.

### Test Structure

- `tests/src/` — Unit tests mirroring `src/` structure (organized by module)
- `tests/scenarios/` — Integration tests: `cross-file/`, `formatting/`, `navigation/`, `regressions/`
- `tests/require-hook.js` — Module resolution + vscode mock injection
- `tests/mock_vscode.js` — VSCode API mock (used by all tests)
- `test-files/` — Thrift fixtures for tests

## Configuration System

Key settings under `thrift.format.*`:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `trailingComma` | string | "preserve" | `"add"` / `"remove"` / `"preserve"` |
| `alignTypes` | boolean | true | Align field types in structs/unions/exceptions |
| `alignNames` | boolean | true | Unified control for field names and enum member names |
| `alignAssignments` | boolean | true | Master switch for `=` and value alignment |
| `alignStructDefaults` | boolean | false | Align `=` for struct default values; independent from `alignAssignments` |
| `alignAnnotations` | boolean | true | Align inline annotations |
| `alignComments` | boolean | true | Align inline comments |
| `indentSize` | number | 4 | Spaces per indent level |
| `maxLineLength` | number | 100 | Target max line length |
| `collectionStyle` | string | "preserve" | `"preserve"` / `"multiline"` / `"auto"` |

Config resolution: `thrift.format.*` first, then legacy `thrift-support.formatting.*` as fallback. See `src/formatting-bridge/options.ts`.

## CI/CD

| Workflow | Trigger | Action |
|----------|---------|--------|
| `ci.yml` | Every push + PR | `npm ci` → `lint` → `build` → `test` (Node 22.18.0) |
| `release-please.yml` | Push to master | Creates release PRs from conventional commits |
| `publish.yml` | GitHub Release published | Build + publish to VS Marketplace + Open VSX |

Default branch: `master`. Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `perf:`.

## Important Implementation Notes

1. **UUID Support**: Thrift IDL 0.23+ treats `uuid` as a built-in primitive. All providers must include `uuid` in their primitive type sets.

2. **Alignment Rules**:
   - `alignAssignments` controls both struct field equals and enum equals/values
   - `alignStructDefaults` is independent (does not follow `alignAssignments`)
   - `alignAnnotations` falls back to deprecated `alignStructAnnotations` if not explicitly set
   - When `alignComments` is disabled, comments may coincidentally appear aligned if other columns match widths — this is not forced alignment

3. **Trailing Comma**: Semicolons are always respected (never replaced with commas). `preserve` mode uses suffix-string inspection to detect original comma presence; `remove` strips commas; `add` appends them.

4. **Incremental Formatting**: `formatting-bridge/range-utils.ts` uses `expandRangeToStructuralBlocks()` and `buildMinimalEdits()` for minimal-patch editing when formatting a range. The `IncrementalTracker` (`src/utils/incremental-tracker.ts`) tracks dirty ranges per document.

5. **AST Caching**: The parser supports full and incremental parsing with content-hash-based cache validation. `src/ast/cache.ts` provides per-document and per-region caches that return stale results gracefully.

6. **Include Resolution**: Relative paths from current file. The definition provider builds a dependency graph and caches include-to-type mappings. Diagnostics tracks cross-file dependencies for invalidation.

7. **Test Mocks**: The `vscode` mock (`tests/mock_vscode.js`) must be kept in sync with any new VS Code API usage. Module paths in tests use `../out/src/...` (compiled output). The require hook resolves these to the actual compiled files.
