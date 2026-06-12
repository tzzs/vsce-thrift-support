# ADR 0001: Keep The Direct VS Code Provider Architecture

## Status

Accepted

## Context

Thrift Support currently targets VS Code and uses direct VS Code Provider APIs for formatting, diagnostics, navigation, symbols, completion, hover, rename, CodeLens, inlay hints, hierarchy providers, and code actions.

The project also has reusable language logic in `packages/core` and a companion CLI in `packages/cli`. This already separates domain behavior from VS Code integration without adding a language-server process.

Language Server Protocol remains a common architecture for cross-editor language tooling, but it would add process lifecycle, transport, capability negotiation, and deployment complexity that is not currently justified by the product surface.

## Decision

The extension will continue using the direct VS Code Provider architecture.

We will not rewrite the extension to LSP only because LSP is a common trend. Instead, we will keep moving reusable parser, formatter, diagnostics, include graph, symbol, and rename-planning behavior into `packages/core`.

## Consequences

The current architecture remains simpler for a VS Code-first extension:

- no language-server subprocess for extension users;
- no JSON-RPC transport layer to maintain;
- direct access to VS Code document, workspace, cancellation, command, and configuration APIs;
- faster iteration for VS Code-specific UX.

The tradeoff is that non-VS Code editors cannot reuse the VS Code provider layer directly. They can still reuse `packages/core` once the required APIs are stable.

## LSP Readiness Boundary

Re-evaluate LSP when there is a concrete target outside VS Code, such as Zed, Neovim, JetBrains, a remote analysis service, or an editor-independent MCP server that needs protocol-level reuse.

Before an LSP implementation is viable, `packages/core` should expose stable APIs for:

- parsing a document;
- formatting a document and range;
- computing diagnostics;
- resolving an include graph;
- querying symbols;
- finding definitions and references;
- planning rename edits without depending on VS Code types.
