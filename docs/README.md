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
| [performance-benchmark.md](performance-benchmark.md) | Performance benchmark usage | Update when benchmark thresholds or scripts change |
| [../tests/README.md](../tests/README.md) | Test directory taxonomy | Update when test directories or default test contracts change |
| [../tests/TESTING.md](../tests/TESTING.md) | Mocha and VS Code mock rules | Update when test harness behavior changes |
| [../tests/debug/README.md](../tests/debug/README.md) | Manual/debug script taxonomy | Update when debug scripts move or become canonical tests |

## Feedback Loop

When a review comment, incident, or repeated bug reveals hidden project knowledge, promote it into one of these docs, a test, a lint, or a script. Prefer executable checks for invariants that must not drift.

Run `npm run harness:check` after changing agent entry docs, local Markdown links, Node/pnpm version anchors, or workflow Node setup.
