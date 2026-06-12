# Security Model

This document records the current security boundary for the VS Code extension, the companion CLI, and future agent-facing integrations.

## Runtime Shape

Thrift Support runs as a VS Code extension and does not start a language-server subprocess. Parser, formatter, diagnostics, symbol, navigation, hierarchy, rename, and refactor logic run inside the extension host through the VS Code Provider APIs.

The reusable language logic lives in `packages/core`. The VS Code package adapts that logic to editor documents, workspace files, commands, and settings. The CLI package calls the same core logic from terminal commands.

## Workspace File Access

The extension reads `.thrift` files to provide:

- open-file parsing, formatting, diagnostics, symbols, hover, completion, rename, and refactor actions;
- include traversal and include graph features;
- workspace indexing for references, workspace symbols, hierarchy providers, and workspace diagnostics.

Broad workspace reads are bounded by extension settings where available. `thrift.diagnostics.workspaceMode` controls whether diagnostics stay on open files, scan the workspace, or are disabled.

## Workspace Trust

`package.json` declares limited support for untrusted workspaces:

- Syntax highlighting, language configuration, formatting, and open-file analysis remain available in Restricted Mode.
- Workspace-wide indexing, include traversal, generated reports, and diagnostics modes requiring broad workspace reads may be limited until the workspace is trusted.
- `thrift.diagnostics.workspaceMode` is listed as a restricted configuration because `workspace` mode expands the file access scope beyond open documents.

## CLI Write Boundary

The CLI reads files passed on the command line. It writes files only for explicit write operations, such as `thrift-support format --write`.

Read-only commands such as `lint`, `parse`, `symbols`, and `format --check` should not modify project files. Any future CLI command that writes files must make the write behavior explicit in its command name, flags, help output, and tests.

## Shell And Process Boundary

The extension does not execute user workspace shell commands for normal language features. Development and release scripts may invoke build, package, test, and publish tools, but those scripts run only when called by maintainers or CI.

## Package And Supply Chain Gates

CI checks include:

- lint;
- invisible Unicode scanning;
- dependency audit at high severity or above;
- build;
- extension and CLI tests;
- coverage;
- CLI dogfood commands;
- VSIX and CLI tarball package smoke checks;
- performance benchmark assertions.

The npm CLI package is published with trusted publishing and provenance. VS Code Marketplace and Open VSX receive the VSIX built by the release workflow.

## AI And MCP Boundary

The extension does not currently register AI tools or an MCP server.

Future AI/MCP work must start with read-only tools. The first safe boundary is parsing, summarizing symbols, explaining diagnostics, resolving include graph context, finding definitions, running in-memory format checks, and returning suggested CLI commands without writing files. Any tool that can mutate files or execute commands requires a separate trust review.
