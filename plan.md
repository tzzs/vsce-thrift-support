# Thrift Support Market And Platform Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the 2026-06-11 market and VS Code ecosystem analysis into an actionable roadmap that improves Thrift Support's public trust, language UX, platform reach, security posture, and future agent readiness.

**Architecture:** Keep the current direct VS Code provider architecture and shared `packages/core` domain model. Add user-facing trust/product improvements first, then extend editor capabilities through focused providers, and only introduce Web, MCP, or AI surfaces behind explicit compatibility and security boundaries.

**Tech Stack:** TypeScript, VS Code Extension API, Node 24.x, pnpm 11.5.0, Mocha, GitHub Actions, `@vscode/vsce`, Open VSX, npm CLI package, future-gated VS Code AI/MCP APIs.

---

## Snapshot

- **Snapshot date:** 2026-06-11
- **Local worktree version:** `package.json` currently reports `3.0.0`.
- **Marketplace state observed:** Visual Studio Marketplace search for `thrift` still favors older syntax-only or formatter-only extensions by install count.
- **Open VSX state observed:** Open VSX API returned `tanzz.thrift-support` version `3.1.0`, so implementation branches should first sync or verify the local worktree against current `master`.
- **Current position:** Thrift Support already has parser, formatter, diagnostics, navigation, completion, rename/refactor, semantic tokens, hierarchy providers, CLI, performance gates, and package smoke checks. Remaining work is mostly product trust, discoverability, modern editor affordances, platform compatibility, and agent ecosystem alignment.

## External Signals Used

- Visual Studio Marketplace Gallery API search for `thrift`, observed 2026-06-11:
  - `cduruk.thrift`: about 82k installs, basic syntax coloring, last updated 2016.
  - `mrkou47.thrift-syntax-support`: about 26k installs, syntax/definition/completion/hover, last updated 2023.
  - `alingse.thirft-formatter`: formatter-focused, about 4k installs, last updated 2023.
  - `jiangpengfei.thrift-language-server`: LSP-based, under 1k installs, feature list includes highlight/completion/definition/references/hover/diagnostics/rename/format.
  - `ocfbnj.thrift-ls`: recent language-server entry with low install count.
- VS Code 1.124 release notes, dated 2026-06-10, emphasize Agents, Autopilot, background sessions, and more autonomous agent workflows.
- VS Code official docs confirm current extension focus areas: Programmatic Language Features, Web Extensions, Workspace Trust, Publishing pre-release/platform-specific packages, Language Model API, Chat Participant API, and MCP developer support.
- Apache Thrift IDL docs currently describe Thrift IDL for version `0.24.0`, with `uuid` listed in `BaseType`.
- Recent extension ecosystem security reporting highlights malicious VS Code/Open VSX extensions, invisible Unicode attacks, file exfiltration risks, and the need for explicit security posture.

## Roadmap Summary

| Priority | Area | Outcome |
| --- | --- | --- |
| P0 | Product trust and public docs | Higher Marketplace conversion and clearer enterprise adoption path |
| P0 | Apache Thrift 0.24 alignment | Prevent language drift across parser, diagnostics, grammar, docs, and CLI |
| P1 | Core language UX gaps | Add expected language-extension affordances beyond current providers |
| P1 | Workspace-scale diagnostics parity | Make Problems and CLI behavior easier to trust in large workspaces |
| P1 | Web and remote compatibility | Support a safe subset in `vscode.dev`, `github.dev`, and Codespaces |
| P2 | AI and MCP readiness | Provide read-only, domain-specific context tools for agents |
| P2 | Security and enterprise hardening | Make trust boundaries and supply-chain posture explicit |
| P3 | LSP decision record | Avoid premature rewrite while preserving future reuse options |

---

## Task 1: Product Trust And Marketplace Conversion

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `DEVELOPMENT.md`
- Modify: `PERFORMANCE.md`
- Modify: `TROUBLESHOOTING.md`
- Create: `SECURITY.md`
- Create: `docs/settings-reference.md`
- Create: `docs/release-verification.md`
- Create: `docs/assets/marketplace/format-diagnostics.png`

- [ ] **Step 1: Confirm current package and release metadata**

Run:

```bash
node -e "const p=require('./package.json'); console.log({version:p.version, packageManager:p.packageManager, engines:p.engines, publisher:p.publisher})"
rg -n "Node 22|Node 24|pnpm 10|pnpm 11|2\\.2\\.0|workflow_dispatch|publish.yml|ci.yml|IDL 0\\.23|IDL 0\\.24" README.md README.zh-CN.md DEVELOPMENT.md PERFORMANCE.md TROUBLESHOOTING.md package.json .github
```

Expected:

- Version, package manager, and engine values are visible before editing.
- Drift locations are listed explicitly before edits begin.

- [ ] **Step 2: Add Marketplace trust metadata**

Update `package.json` with explicit metadata:

```json
{
  "license": "MIT",
  "bugs": {
    "url": "https://github.com/tzzs/vsce-thrift-support/issues"
  },
  "homepage": "https://github.com/tzzs/vsce-thrift-support#readme",
  "qna": "https://github.com/tzzs/vsce-thrift-support/discussions",
  "galleryBanner": {
    "color": "#1E1E1E",
    "theme": "dark"
  },
  "pricing": "Free"
}
```

Keep existing publisher, repository, categories, and keywords unless Marketplace search data shows a specific keyword gap.

- [ ] **Step 3: Fix public badges and first-screen README messaging**

Update `README.md` and `README.zh-CN.md` so the first screen separates:

- Marketplace version/install badges.
- Open VSX version/download badges.
- CI quality gate badge pointing to `.github/workflows/ci.yml`.
- Publish/release badge pointing to `.github/workflows/publish.yml`.
- A concise capability statement: language intelligence, formatter, diagnostics, refactor, CLI, performance gates.

Capture one visual proof asset at `docs/assets/marketplace/format-diagnostics.png`. The screenshot should show at least two of these in one editor view: diagnostics squiggles, formatter output, definition/reference navigation, completion, or Quick Fix.

- [ ] **Step 4: Publish a settings reference**

Create `docs/settings-reference.md` from `package.json#contributes.configuration`. Include:

- `thrift.format.*` keys with defaults and examples.
- `thrift.diagnostics.rules` examples for disabling a rule and changing severity.
- Legacy fallback behavior for deprecated settings where still supported.
- A link to `docs/diagnostics-rules.md`.

Verification command:

```bash
node -e "const p=require('./package.json'); const keys=Object.keys(p.contributes.configuration.properties); console.log(keys.join('\n'))"
```

Expected:

- Every emitted key appears in `docs/settings-reference.md`.

- [ ] **Step 5: Add a release and verification document**

Create `docs/release-verification.md` explaining the real release chain:

- release-please creates version changes.
- GitHub Release publication triggers `publish.yml`.
- `publish.yml` packages VSIX and publishes to Visual Studio Marketplace, Open VSX, and npm.
- CI gates include lint, build, tests, coverage, CLI dogfood, package smoke, and performance assertions.

Do not describe `workflow_dispatch` for publish unless the workflow actually supports it.

- [ ] **Step 6: Add security disclosure and support scope**

Create `SECURITY.md` with:

- Supported versions policy.
- Vulnerability reporting path through GitHub Security Advisories or private maintainer contact if configured.
- No telemetry claim only if verified in source.
- Dependency, VSIX, npm, and Open VSX supply-chain posture.
- Workspace Trust and untrusted workspace behavior, even if the first version is only a documented current-state statement.

- [ ] **Step 7: Validate docs-only change**

Run:

```bash
git diff --check
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"
npm run smoke:package
```

Expected:

- No whitespace errors.
- `package.json ok`.
- Package smoke passes.

---

## Task 2: Apache Thrift 0.24 Specification Alignment

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/advanced-features.md`
- Modify: `docs/diagnostics-rules.md`
- Modify: `docs/annotation-policy.md`
- Modify: `syntaxes/thrift.tmLanguage.json`
- Review: `language-configuration.json`
- Modify: `packages/core/src/**`
- Modify: `packages/vscode/src/**`
- Review: `packages/cli/src/**`
- Add tests under: `tests/src/**`

- [ ] **Step 1: Create an IDL 0.24 comparison note**

Create a short section in `docs/advanced-features.md` named `Apache Thrift IDL 0.24 Alignment` with links to:

- `https://thrift.apache.org/docs/idl`
- `https://thrift.apache.org/docs/types`

Record the local support status for:

- `uuid`
- `stream`
- `sink`
- `interaction`
- `performs`
- `reference`
- `cpp_include`
- `cpp_type`
- list separators `,` and `;`
- reserved keywords

- [ ] **Step 2: Replace stale IDL 0.23 wording**

Run:

```bash
rg -n "IDL 0\\.23|Thrift 0\\.23|0\\.23" README.md README.zh-CN.md docs packages syntaxes tests
```

Expected:

- Every stale reference is either updated to `IDL 0.24` or explicitly described as historical context.

- [ ] **Step 3: Add conformance fixtures**

Add or refresh fixtures under `tests/src/parser/test-files/` and related diagnostics/highlighting tests to cover:

```thrift
namespace * example
cpp_include "custom/header.h"

typedef uuid UserId
typedef map<string, list<UserId>> UserMap

struct User {
    1: required UserId id;
    2: optional string name = "anonymous";
}

service UserService {
    User getUser(1: UserId id) throws (1: UserNotFound error);
}

exception UserNotFound {
    1: string message;
}
```

Also include one fixture with intentionally invalid `enum` values and one with both comma and semicolon separators.

- [ ] **Step 4: Fix README and rule catalog drift**

Audit these known drift points:

- README says enum values must be non-negative, but current rule catalog may only expose `enum.valueNotInteger`.
- `docs/advanced-features.md` references `thrift.tmLanguage-enhanced.json`, while `package.json` contributes `syntaxes/thrift.tmLanguage.json`.
- `reference` appears in docs more strongly than completion currently supports.

For each drift point, choose one of two actions in the same PR:

- Implement the claimed behavior and add tests.
- Narrow the documentation to the behavior that exists.

- [ ] **Step 5: Add a spec drift guard**

Add a small test or script that verifies core primitive keywords and grammar primitive scopes stay aligned for at least:

```text
bool byte i8 i16 i32 i64 double string binary uuid void
```

Run:

```bash
npm run lint:fix
npm run build
npm run test:single -- tests/src/test-grammar-tokenization.js
npm test
```

Expected:

- Grammar tokenization and full test suite pass.

---

## Task 3: High-Frequency Language UX Gaps

**Files:**
- Modify: `package.json`
- Modify: `packages/vscode/src/setup.ts`
- Review: `packages/vscode/src/utils/dependencies.ts`
- Create: `packages/vscode/src/signature-help-provider.ts`
- Create: `packages/vscode/src/inlay-hints-provider.ts`
- Create: `packages/vscode/src/code-lens-provider.ts`
- Create: `packages/vscode/src/include-organizer.ts`
- Modify: `packages/vscode/src/code-actions-provider.ts`
- Modify: `packages/vscode/src/rename-provider.ts`
- Add tests under: `tests/src/signature-help-provider/`, `tests/src/inlay-hints-provider/`, `tests/src/code-lens-provider/`, `tests/src/code-actions-provider/`, `tests/src/rename-provider/`

- [ ] **Step 1: Implement service method signature help**

Register `vscode.languages.registerSignatureHelpProvider('thrift', provider, '(', ',')`.

Expected behavior:

- Inside service and interaction methods, show parameter field IDs, requiredness, type, name, and throws signature.
- Use AST from `packages/core` and `WorkspaceIndex` when available.
- Return no result outside service or interaction method argument lists.

Minimum tests:

- Signature help after `getUser(`.
- Active parameter changes after comma.
- Throws list does not confuse parameter index.
- Cancellation returns no stale result.

- [ ] **Step 2: Add focused inlay hints**

Register an inlay hints provider with low-noise defaults.

Recommended first hints:

- Field requiredness where omitted: `default`.
- Resolved include alias for cross-file type references.
- Service override source for methods inherited through `extends`.

Configuration keys:

```json
{
  "thrift.inlayHints.requiredness": false,
  "thrift.inlayHints.includeAliases": false,
  "thrift.inlayHints.serviceOverrides": true
}
```

Expected behavior:

- Hints never change document text.
- Hints are not shown in comments or string literals.
- Large files respect cancellation.

- [ ] **Step 3: Add high-signal CodeLens**

Register CodeLens only for signals that help navigation:

- Type reference count above top-level `struct`, `union`, `exception`, `enum`, `typedef`, `service`, and `interaction`.
- Service method override count for `extends` chains.

Avoid always-on low-value CodeLens for every field.

Expected behavior:

- Lens commands open existing VS Code reference or hierarchy views.
- Counts reuse `WorkspaceIndex`.
- CodeLens is configurable:

```json
{
  "thrift.codeLens.references": true,
  "thrift.codeLens.serviceOverrides": true
}
```

- [ ] **Step 4: Add include organization actions**

Add Quick Fix or Source Action support for:

- Insert missing include for unknown type when a unique workspace definition exists.
- Remove unused include.
- Sort include blocks while preserving comments and header grouping.

Expected command names:

```text
Thrift: Organize Includes
Thrift: Remove Unused Includes
```

Expected tests:

- Included alias used only in comments is considered unused.
- Included alias used in a qualified type is considered used.
- Sorting keeps `namespace` declarations after includes unless current file order requires preserving a leading comment block.

- [ ] **Step 5: Harden rename validation**

Extend `ThriftRenameProvider` so `prepareRename` rejects:

- Primitive types.
- Reserved keywords.
- Invalid identifiers.
- New names that collide with same-scope top-level symbols.
- New names that collide with fields in the same struct/union/exception or enum members in the same enum.

Expected tests:

- Rename `uuid` is rejected.
- Rename to `service` is rejected.
- Rename top-level type to an existing top-level type is rejected.
- Valid cross-file rename still updates references.

- [ ] **Step 6: Expand Quick Fix coverage**

Add Quick Fixes for rules that can be repaired deterministically:

- `service.oneway.hasThrows`: remove throws clause.
- `service.throws.notException`: offer conversion only if the target type is a local struct with safe range, otherwise no fix.
- `syntax.unclosed`: insert missing closer only when the opener and insertion point are unambiguous.
- `enum.negativeValue`: change to the next non-negative value after Task 2 creates or confirms this rule.

Run:

```bash
npm run lint:fix
npm run build
npm test
```

Expected:

- Full suite passes.
- New provider tests run through the shared VS Code mock hook.

---

## Task 4: Workspace Diagnostics And CLI Parity

**Files:**
- Modify: `packages/vscode/src/diagnostics/**`
- Modify: `packages/vscode/src/indexing/workspace-index.ts`
- Modify: `packages/cli/src/**`
- Modify: `packages/core/src/diagnostics/**`
- Add tests under: `tests/src/diagnostics/`
- Add CLI tests under: `tests/cli/`

- [ ] **Step 1: Define workspace diagnostics behavior**

Document and implement one clear mode:

```json
{
  "thrift.diagnostics.workspaceMode": "openFiles"
}
```

Supported values:

- `openFiles`: current behavior, fast and conservative.
- `workspace`: scan workspace `.thrift` files within the existing workspace file limit.
- `off`: disable diagnostics from the extension while leaving CLI available.

- [ ] **Step 2: Reuse CLI diagnostics engine**

Ensure VS Code workspace diagnostics and `thrift-support lint` share:

- Rule IDs.
- Severity mapping.
- Include resolution.
- Config normalization.
- Default value checking.

Add a parity fixture where VS Code diagnostics and CLI JSON output produce the same rule IDs for the same files.

- [ ] **Step 3: Make workspace scans cancellable and bounded**

Requirements:

- Respect existing workspace file limit.
- Respect cancellation token on edits and workspace close.
- Avoid duplicate diagnostics for open documents already analyzed with unsaved content.
- Debounce broad scans after include graph changes.

- [ ] **Step 4: Add user-facing diagnostics status**

Add a status report command:

```text
Thrift: Show Diagnostics Status
```

Report:

- Workspace mode.
- Number of indexed `.thrift` files.
- Number of files with diagnostics.
- Last scan duration.
- Top rule IDs by count.

Run:

```bash
npm run lint:fix
npm run build
npm run coverage:cli
npm test
```

Expected:

- CLI coverage remains healthy.
- VS Code diagnostics tests cover open-file and workspace modes.

---

## Task 5: Web, Remote, And Codespaces Compatibility

**Files:**
- Modify: `package.json`
- Modify: `build.js`
- Modify: `packages/vscode/src/extension.ts`
- Create: `packages/vscode/src/web/extension.ts`
- Create: `packages/vscode/src/platform/fs.ts`
- Create: `packages/vscode/src/platform/node-fs.ts`
- Create: `packages/vscode/src/platform/web-fs.ts`
- Create: `tests/package-web-smoke.js`

- [ ] **Step 1: Define web-supported feature subset**

Web mode should initially support:

- Syntax grammar and language configuration.
- Formatter using bundled core code.
- Parser-backed diagnostics for open files.
- Document symbols.
- Hover and completion for local document symbols.

Web mode should not initially claim:

- Node filesystem scanning.
- Full workspace include graph across unavailable file systems.
- CLI execution.
- Garbage collection command.
- Any shell-dependent behavior.

- [ ] **Step 2: Add platform abstraction**

Create a thin file-system abstraction that wraps:

- `vscode.workspace.fs` for web and remote-safe reads.
- Node filesystem APIs only in the desktop Node extension host.

Provider code should not import Node `fs` directly after the abstraction is introduced, except in the Node platform adapter.

- [ ] **Step 3: Add browser entry point**

Add `browser` to `package.json`:

```json
{
  "browser": "./dist/web/extension.js"
}
```

Update build scripts so desktop and web bundles are separate outputs.

- [ ] **Step 4: Gate unsupported commands**

Use `when` clauses and runtime checks so web mode hides or disables:

- `thrift.showMemoryReport`
- `thrift.forceGarbageCollection`
- full workspace scans if unsupported by the active workspace file system

- [ ] **Step 5: Validate web packaging**

Add a script:

```json
{
  "scripts": {
    "build:web": "node build.js --web",
    "smoke:package:web": "pnpm run build:web && pnpm exec vsce package --target web"
  }
}
```

Run:

```bash
npm run build
npm run build:web
npm run smoke:package
npm run smoke:package:web
```

Expected:

- Desktop package still includes `dist/extension.js`.
- Web package includes `dist/web/extension.js`.
- Unsupported Node-only commands are not advertised as web-ready.

---

## Task 6: AI And MCP Readiness

**Files:**
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `packages/core/src/**`
- Create: `packages/vscode/src/ai/chat-participant.ts`
- Create: `packages/vscode/src/ai/language-model-tools.ts`
- Create: `packages/mcp/package.json`
- Create: `packages/mcp/src/server.ts`
- Create: `docs/ai-and-agent-integration.md`
- Add tests under: `tests/src/ai/`
- Add tests under: `packages/mcp/test/`

- [ ] **Step 1: Start with read-only domain tools**

Expose only read-only capabilities in the first AI/MCP release:

- Parse current document and summarize top-level symbols.
- Explain a diagnostic rule by ID.
- Return include graph for a file.
- Find symbol definitions by name.
- Run format check in memory without writing files.
- Return CLI command suggestions for CI integration.

Do not expose write tools in the first release.

- [ ] **Step 2: Choose VS Code AI API path deliberately**

If using VS Code Chat Participant or Language Model APIs:

- Verify the minimum stable VS Code API version.
- Update `engines.vscode` only in the PR that actually requires the newer API.
- Keep all AI activation user-initiated.
- Handle missing model access and user consent errors.

Use the separate `packages/mcp` server as the first deliverable so the main extension engine can stay stable while AI APIs are evaluated.

- [ ] **Step 3: Add MCP server definition only after trust review**

If registering an MCP server from the extension, use:

- `contributes.mcpServerDefinitionProviders`
- `vscode.lm.registerMcpServerDefinitionProvider`

Tool annotations:

```json
{
  "readOnlyHint": true
}
```

Expected behavior:

- Read-only tools do not request confirmation when VS Code accepts the annotation.
- Tools never read outside workspace roots.
- No tool writes files or runs shell commands in the first version.

- [ ] **Step 4: Document agent workflows**

Create `docs/ai-and-agent-integration.md` with:

- What context the extension can provide to agents.
- What the extension does not send to a model automatically.
- How user consent works.
- How to disable AI/MCP features.
- Security boundaries for workspace roots and untrusted workspaces.

- [ ] **Step 5: Add deterministic tests**

Mock the model and MCP layers. Do not call real language models in tests.

Run:

```bash
npm run lint:fix
npm run build
npm test
```

Expected:

- Tests are deterministic.
- No test depends on network, Copilot access, or model quota.

---

## Task 7: Security, Workspace Trust, And Supply Chain

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/publish.yml`
- Create: `SECURITY.md` if Task 1 has not created it
- Create: `docs/security-model.md`
- Create: `scripts/check-invisible-unicode.js`
- Add tests under: `tests/src/security/` if script behavior is testable with fixtures

- [ ] **Step 1: Add Workspace Trust capabilities**

Add `capabilities.untrustedWorkspaces` to `package.json`.

Recommended initial state:

```json
{
  "capabilities": {
    "untrustedWorkspaces": {
      "supported": "limited",
      "description": "Thrift syntax, formatting, and open-file analysis are available in Restricted Mode. Workspace-wide indexing, include traversal, and generated reports may be limited until the workspace is trusted.",
      "restrictedConfigurations": [
        "thrift.diagnostics.workspaceMode"
      ]
    }
  }
}
```

Update provider activation so trust-sensitive workspace scans are disabled or downgraded in Restricted Mode.

- [ ] **Step 2: Add invisible Unicode scan**

Create `scripts/check-invisible-unicode.js` that fails on invisible Unicode ranges used in recent supply-chain attacks unless the file is an explicit fixture.

Scan:

- `packages/**`
- `syntaxes/**`
- `language-configuration.json`
- `package.json`
- `.github/**`
- `scripts/**`

Allowed fixture path:

- `tests/fixtures/security/invisible-unicode/**`

- [ ] **Step 3: Add CI security checks**

Add CI steps:

```bash
node scripts/check-invisible-unicode.js
pnpm audit --audit-level high
```

If `pnpm audit` has known transient false positives, document each exception in `pnpm-workspace.yaml` with a link to the issue or CVE note.

- [ ] **Step 4: Document extension security model**

Create `docs/security-model.md` covering:

- No language server subprocess in current architecture.
- Workspace file reads and include traversal.
- CLI behavior and write operations.
- Workspace Trust behavior.
- MCP/AI behavior if Task 6 is implemented.
- Release provenance and package smoke gates.

- [ ] **Step 5: Validate package contents**

Extend `tests/package-smoke.js` to assert that packaged VSIX includes only intended runtime files and excludes:

- source TypeScript files not needed at runtime
- test fixtures
- debug scripts
- local temp directories

Run:

```bash
npm run lint:fix
npm run build
npm run smoke:package
npm test
```

Expected:

- Package smoke verifies security-relevant package boundaries.

---

## Task 8: Release Channels And Adoption Feedback

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/publish.yml`
- Create: `.github/workflows/pre-release.yml`
- Create: `docs/release-channels.md`
- Create: `scripts/marketplace-metrics.js`

- [ ] **Step 1: Add a pre-release channel decision**

Document release versioning:

- Stable releases use even minor versions when possible.
- Pre-release builds use odd minor versions when possible.
- Pre-release publishing uses `vsce publish --pre-release`.
- Open VSX and npm behavior must be explicitly described before enabling automated pre-release publishing.

- [ ] **Step 2: Add adoption metric script**

Create `scripts/marketplace-metrics.js` that queries:

- Visual Studio Marketplace Gallery API for `tanzz.thrift-support`.
- Open VSX API for `tanzz/thrift-support`.

Output:

```json
{
  "visualStudioMarketplace": {
    "version": "x.y.z",
    "installs": 0,
    "ratingCount": 0
  },
  "openVsx": {
    "version": "x.y.z",
    "downloads": 0
  }
}
```

The script must tolerate network failure with a non-zero exit code and a clear error message.

- [ ] **Step 3: Add release notes quality checklist**

Create `docs/release-channels.md` with a release checklist:

- User-facing feature summary.
- Migration notes.
- Screenshots or GIFs for visible features.
- CLI compatibility notes.
- Security notes.
- Verification commands.

- [ ] **Step 4: Validate release metadata**

Run:

```bash
node scripts/marketplace-metrics.js
npm run smoke:package
```

Expected:

- Metrics script prints current Marketplace/Open VSX data.
- Package smoke passes.

---

## Task 9: LSP Strategy Decision Record

**Files:**
- Create: `docs/adr/0001-lsp-strategy.md`
- Modify: `ARCHITECTURE.md`
- Modify: `docs/PROJECT_MAP.md`

- [ ] **Step 1: Document the current decision**

Create `docs/adr/0001-lsp-strategy.md` with this decision:

- Keep the direct VS Code provider architecture for the main extension.
- Do not rewrite to LSP solely for trend alignment.
- Continue extracting reusable language logic into `packages/core`.
- Revisit LSP only if there is a clear target outside VS Code, such as Zed, Neovim, JetBrains, a remote analysis service, or a shared MCP server requiring editor-independent protocol support.

- [ ] **Step 2: Define LSP readiness boundaries**

Document which core APIs need to be stable before LSP is practical:

- Parse document.
- Format document and range.
- Compute diagnostics.
- Resolve include graph.
- Query symbols.
- Find definition and references.
- Rename planning without VS Code-specific types.

- [ ] **Step 3: Add architecture link**

Update `ARCHITECTURE.md` and `docs/PROJECT_MAP.md` to link the ADR.

Run:

```bash
git diff --check
npm run build
```

Expected:

- Docs link cleanly.
- Build still passes after any exported core API adjustments.

---

## Suggested PR Boundaries

1. **PR A: Product trust and docs sync**
   - Task 1 only.
   - Lowest risk, highest Marketplace impact.

2. **PR B: IDL 0.24 alignment**
   - Task 2 only.
   - Requires parser/diagnostics/grammar tests.

3. **PR C: Language UX provider pack**
   - Task 3 split into smaller PRs if review size grows:
     - Signature help.
     - Inlay hints and CodeLens.
     - Include organization and rename validation.

4. **PR D: Workspace diagnostics parity**
   - Task 4 only.
   - Requires CLI and VS Code diagnostics parity fixtures.

5. **PR E: Web extension subset**
   - Task 5 only.
   - Should not include AI/MCP work.

6. **PR F: Security and Workspace Trust**
   - Task 7 only, or Task 7 plus Task 1 `SECURITY.md` if not already done.

7. **PR G: AI/MCP read-only context**
   - Task 6 only after Workspace Trust and security docs are merged.

8. **PR H: Release channels and metrics**
   - Task 8 only.

9. **PR I: LSP strategy ADR**
   - Task 9 only.

## Validation Policy

For documentation-only PRs:

```bash
git diff --check
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"
```

For package metadata or Marketplace changes:

```bash
npm run smoke:package
```

For provider, parser, diagnostics, formatter, CLI, or security-script changes:

```bash
npm run lint:fix
npm run lint
npm run build
npm test
```

For CLI-visible changes:

```bash
npm run coverage:cli
```

For parser, formatter, diagnostics, cache, indexing, semantic tokens, hierarchy, or workspace scan changes:

```bash
npm run perf:benchmark
```

For web extension work:

```bash
npm run build:web
npm run smoke:package:web
```

## First Recommended Implementation Order

1. Task 1: product trust and documentation sync.
2. Task 2: IDL 0.24 alignment.
3. Task 7: Workspace Trust and security model.
4. Task 3 Step 1: signature help.
5. Task 3 Step 4 and Step 5: include organization and rename validation.
6. Task 4: workspace diagnostics parity.
7. Task 5: web extension subset.
8. Task 6: read-only AI/MCP context.
9. Task 8: release channels and metrics.
10. Task 9: LSP strategy ADR.
