# Repository Guidelines

## Agent Entry Map

This repository is a pnpm monorepo for a VS Code extension and companion CLI for Apache Thrift IDL. Start with the short maps below, then follow the linked source of truth instead of guessing from old paths.

| Need | Read / run |
| --- | --- |
| Directory ownership and generated outputs | [docs/PROJECT_MAP.md](docs/PROJECT_MAP.md) |
| Architecture and provider/data-flow boundaries | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Local setup, build, test, release details | [DEVELOPMENT.md](DEVELOPMENT.md) |
| Test taxonomy and mock rules | [tests/README.md](tests/README.md), [tests/TESTING.md](tests/TESTING.md) |
| Manual/debug scripts | [tests/debug/README.md](tests/debug/README.md) |
| Diagnostics rule behavior | [docs/diagnostics-rules.md](docs/diagnostics-rules.md) |
| Formatter/annotation policy | [docs/annotation-policy.md](docs/annotation-policy.md) |

When possible, use subagents for independent scans or validation so the main thread can keep implementation moving.

## Project Shape

- `packages/core/src/`: parser, formatter, diagnostics rules, refactor primitives, cache/memory/error utilities. This package must not depend on VS Code APIs.
- `packages/vscode/src/`: VS Code extension entrypoint, providers, commands, indexing, formatting bridge, and dependency injection.
- `packages/cli/src/`: standalone `thrift-support` CLI commands and config loading.
- `syntaxes/` and `language-configuration.json`: TextMate grammar and VS Code language metadata.
- `tests/src/`: canonical Mocha tests for core and extension behavior.
- `tests/cli/`: CLI tests.
- `tests/perf/`: performance benchmark and threshold scripts.
- `tests/debug/`: manual reproduction, analysis, and migration helper scripts. These are not default release gates.
- `out/`, `dist/`, package-local `out/` / `dist/`, `coverage/`, and `tmp/` are generated outputs.

## Commands

| Command | What it does |
| --- | --- |
| `npm run lint:fix` | ESLint autofix for `packages/*/src/**/*.ts`; required after code changes |
| `npm run lint` | ESLint flat config over package source |
| `npm run build` | clean, build core, compile VS Code package, bundle extension |
| `npm run build:cli` | bundle and compile CLI package |
| `npm test` | build extension + CLI, then run Mocha |
| `npm run test:single -- <file>` | build extension + CLI, then run one Mocha file |
| `npm run coverage:cli` | CLI-focused coverage |
| `npm run perf:benchmark` | parser/formatter/diagnostics/cache/indexing performance benchmark |
| `npm run smoke:package` | VSIX and CLI tarball smoke checks |

## Conventions And Gotchas

- Node 24.x is required. Keep `.nvmrc`, `.node-version`, `package.json` engines, and CI aligned.
- Use VS Code provider APIs directly; this project has no language server.
- Use `createCoreDependencies()` in `packages/vscode/src/utils/dependencies.ts` for provider/command infrastructure injection.
- Do not use `console.log` in package source. Use the `ErrorHandler` service.
- Diagnostics entrypoint is `packages/vscode/src/diagnostics/index.ts`.
- `uuid` is a built-in primitive for Thrift IDL 0.23+ and must stay recognized across parser, diagnostics, navigation, highlighting, and completion.
- Formatting must never replace semicolons with commas. `trailingComma: "preserve"` preserves suffixes, `"remove"` strips commas, and `"add"` appends commas where appropriate.
- Config namespace is `thrift.format.*`; legacy `thrift-support.formatting.*` is fallback only.
- `alignAssignments` controls struct field `=` and enum `=` / values; `alignStructDefaults` is independent.
- `alignAnnotations` falls back to deprecated `alignStructAnnotations` only when unset.

## Testing Rules

- Tests use Mocha `describe` / `it`, timeout 30s.
- Import compiled output from `../../../out/...`; `tests/require-hook.js` remaps package paths.
- Do not manually mock `vscode` or override `Module.prototype.require`; `.mocharc.json` loads the shared require hook.
- Keep all `require` calls at file top level.
- Promote long-lived manual reproductions from `tests/debug/**` or `tests/scenarios/**` into `tests/src/**` before treating them as CI guarantees.

## Commits And PRs

- Default branch: `master`.
- Conventional commits are required, for example `fix(formatter): prevent enum indent drift` or `docs(harness): add project map`.
- Before PRs that change code, run `npm run lint:fix`, `npm run build`, and `npm test`.
- For docs-only harness changes, run the smallest relevant validation and report exactly what was run.
