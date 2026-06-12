# Documentation Index

Use this page as the repository-local map for agent and contributor documentation.

| Document | Purpose | Freshness signal |
| --- | --- | --- |
| [PROJECT_MAP.md](PROJECT_MAP.md) | Directory ownership, generated outputs, validation matrix | Update when top-level directories, package layout, or test taxonomy changes |
| [../ARCHITECTURE.md](../ARCHITECTURE.md) | Runtime architecture, caches, indexing, providers, dependency injection | Update when provider/data-flow boundaries change |
| [../DEVELOPMENT.md](../DEVELOPMENT.md) | Local setup, build, test, release workflow | Update when scripts, Node/pnpm versions, or CI gates change |
| [diagnostics-rules.md](diagnostics-rules.md) | Diagnostics rule names and behavior | Update when diagnostic codes or semantics change |
| [annotation-policy.md](annotation-policy.md) | Formatter annotation and alignment policy | Update when formatter alignment semantics change |
| [advanced-features.md](advanced-features.md) | Stream, sink, interaction, and experimental syntax examples | Update when grammar/parser support changes |
| [settings-reference.md](settings-reference.md) | VS Code settings keys, defaults, examples, and legacy fallback notes | Update when `package.json#contributes.configuration` changes |
| [release-verification.md](release-verification.md) | Release automation chain and local/package verification commands | Update when GitHub Actions release gates change |
| [release-channels.md](release-channels.md) | Stable/pre-release channel policy and adoption metrics workflow | Update when Marketplace, Open VSX, or npm release strategy changes |
| [security-model.md](security-model.md) | Workspace Trust, file access, CLI write, package, and future AI/MCP security boundaries | Update when security posture or workspace access changes |
| [performance-benchmark.md](performance-benchmark.md) | Performance benchmark usage | Update when benchmark thresholds or scripts change |
| [../SECURITY.md](../SECURITY.md) | Supported versions, vulnerability reporting, telemetry statement, and trust boundaries | Update when security posture or Workspace Trust behavior changes |
| [../tests/README.md](../tests/README.md) | Test directory taxonomy | Update when test directories or default test contracts change |
| [../tests/TESTING.md](../tests/TESTING.md) | Mocha and VS Code mock rules | Update when test harness behavior changes |
| [../tests/debug/README.md](../tests/debug/README.md) | Manual/debug script taxonomy | Update when debug scripts move or become canonical tests |

## Feedback Loop

When a review comment, incident, or repeated bug reveals hidden project knowledge, promote it into one of these docs, a test, a lint, or a script. Prefer executable checks for invariants that must not drift.

Run `npm run harness:check` after changing agent entry docs, local Markdown links, Node/pnpm version anchors, or workflow Node setup.
