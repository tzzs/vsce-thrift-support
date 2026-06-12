# Project Map

This map describes directory ownership and validation signals for agents and contributors. Keep it short enough to scan before changing code.

## Top-Level Directories

| Path | Role | Edit when |
| --- | --- | --- |
| `packages/core/src/` | Pure Thrift domain logic: AST parser/tokenizer, formatter, diagnostics rules, refactor primitives, shared config, cache/memory/error utilities | Changing language semantics, formatting, diagnostics, config normalization, or reusable utilities |
| `packages/vscode/src/` | VS Code integration: extension activation, providers, commands, indexing, formatting bridge, diagnostics scheduling, dependency injection | Changing editor behavior, command registration, provider wiring, workspace scans, or VS Code configuration bridge |
| `packages/cli/src/` | Standalone `thrift-support` CLI: args, config, format/lint/parse/symbols commands, output helpers | Changing CLI flags, command behavior, config loading, or terminal output |
| `syntaxes/` | TextMate grammar for syntax highlighting | Changing token scopes or grammar patterns |
| `language-configuration.json` | VS Code brackets, comments, auto-closing pairs | Changing language-level editor metadata |
| `docs/` | Repository-local decisions and maps | Making architecture, diagnostics, formatter policy, performance, or harness knowledge durable |
| `docs/adr/` | Architecture decision records | Recording durable architecture choices such as LSP strategy |
| `tests/src/` | Canonical Mocha regression tests for core and VS Code extension behavior | Adding long-lived behavior coverage |
| `tests/cli/` | CLI integration and unit tests | Changing CLI behavior |
| `tests/perf/` | Performance benchmark and threshold scripts | Changing parser, formatter, diagnostics, cache, or indexing performance characteristics |
| `tests/scenarios/` | Scenario-oriented integration checks and reproductions | Capturing multi-file or user-journey style validation before or alongside canonical tests |
| `tests/debug/` | Manual reproduction, analysis, migration, and helper scripts | Keeping non-gated local investigation tooling |
| `test-files/`, `tests/test-files/`, `tests/fixtures/` | Shared thrift fixtures and golden outputs | Adding reusable examples or expected formatter/parser outputs |
| `.github/workflows/` | CI, release, publish, stale, and label automation | Changing delivery gates or GitHub automation |
| `scripts/` | Repository maintenance scripts | Updating cross-package version, security scanning, release metrics, or release maintenance logic |
| `openspec/` | OpenSpec change artifacts | Proposing or tracking spec-driven changes |

## Generated Outputs

Do not treat these as source-of-truth inputs:

- `out/`: compiled VS Code package output used by tests
- `dist/`: bundled extension entrypoint
- `packages/core/out/`
- `packages/cli/out/`, `packages/cli/dist/`
- `coverage/`
- `tmp/`
- package-local `node_modules/`

If generated output changes unexpectedly, verify the source package and build command before editing generated files directly.

## Dependency Direction

```text
packages/core  -> no VS Code dependency
packages/cli   -> packages/core
packages/vscode -> packages/core + VS Code API
tests          -> compiled root out/ and package outputs through tests/require-hook.js
```

Rules:

- Keep parser, formatter, diagnostics rule semantics, config normalization, and reusable utilities in `packages/core`.
- Keep VS Code API calls, provider lifecycle, workspace indexing, command registration, and editor-specific range handling in `packages/vscode`.
- Keep CLI argument parsing and terminal output in `packages/cli`; call core for language behavior.
- Add new shared behavior tests near the source domain under `tests/src/<module>/`; add CLI tests under `tests/cli/`.

## Validation Matrix

| Change area | Minimum validation |
| --- | --- |
| Core parser/formatter/diagnostics/config/cache | `npm run lint:fix`, `npm run build`, relevant `npm run test:single -- <file>`, usually `npm test` |
| VS Code provider/command/formatting bridge | `npm run lint:fix`, `npm run build`, relevant `tests/src/<provider-or-bridge>`, usually `npm test` |
| CLI behavior | `npm run build:cli`, relevant `tests/cli/**`, `npm run coverage:cli` for user-visible CLI changes |
| TextMate grammar | grammar tokenization tests in `tests/src/test-grammar-tokenization.js` |
| Performance-sensitive paths | `npm run perf:benchmark` |
| Packaging/release files | `npm run smoke:package` or the narrower smoke command |
| Docs-only maps and README links | JSON/link/name scans plus relevant package smoke configuration test when package files change |

## Harness Maintenance

- Keep `AGENTS.md` as a short map, not an encyclopedia.
- Link durable knowledge from [docs/README.md](README.md).
- Move repeated review comments into docs, tests, lints, or scripts.
- Promote stable manual reproductions from `tests/debug/**` into canonical Mocha tests under `tests/src/**`.
- Re-check this map when adding a new top-level directory, package, test class, generated output, or delivery gate.
