# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VS Code extension that provides comprehensive language support for Apache Thrift IDL files. The extension
offers syntax highlighting, code formatting, navigation, diagnostics, and refactoring capabilities for `.thrift` files.

## Development Environment

**Critical Requirements:**

- Node.js: 22.18.0 (must match CI version)
- VS Code Engine: ^1.75.0
- TypeScript: ^4.9.4
- @vscode/vsce: ^3.6.0 (note: package name changed from `vsce` to `@vscode/vsce`)

## Essential Commands

### Build and Development

```bash
npm install          # Install dependencies (use Node 22.18.0)
npm run compile      # Compile TypeScript
npm run watch        # Development mode with auto-compilation
npm run build        # Clean and compile
npm run lint         # Run ESLint on src/**/*.ts
```

### Testing

```bash
npm test             # Run main test (include navigation)
npm run test:all     # Run all individual tests
npm run test:all:node # Run all tests via node script
npm run coverage     # Generate coverage report

# Individual test suites
npm run test:complex     # Complex types formatting
npm run test:enum        # Enum formatting
npm run test:indent      # Indent width tests
npm run test:comma       # Trailing comma tests
npm run test:const       # Constant formatting tests
```

### Packaging and Publishing

```bash
npm run package      # Create .vsix extension package
npm run publish      # Publish to VS Code Marketplace (requires VSCE_PAT)
```

## Architecture Overview

### Core Modules Structure

- `src/extension.ts` - Extension entry point, registers all providers and commands
- `src/formatting-provider.ts` - Document and range formatting with alignment strategies
- `src/definition-provider.ts` - Go-to-definition with include resolution
- `src/diagnostics.ts` - Syntax and semantic error detection
- `src/rename-provider.ts` - Cross-file symbol renaming
- `src/code-actions-provider.ts` - Refactoring actions (extract type, move type)
- `src/hover-provider.ts` - Symbol documentation on hover

### Key Design Patterns

1. **Formatting Pipeline**: Parse → Analyze alignment widths → Transform → Output
2. **Include Resolution**: Builds dependency graph for cross-file navigation
3. **Configuration-Driven**: All formatting behavior controlled via VS Code settings
4. **Error Recovery**: Parser is fault-tolerant to preserve existing layout

### Language Server Integration Points

The extension uses VS Code's built-in language provider APIs rather than a separate language server. All providers are
registered through the extension host API.

## Configuration System

Key settings in `package.json` under `contributes.configuration`:

- `thrift.format.*` - Formatting behavior (alignment, indentation, trailing commas)
- `thrift.format.alignAssignments` - Master switch for equals/values alignment
- `thrift.format.alignStructDefaults` - Separate control for struct default values
- `thrift.format.collectionStyle` - Controls const collection formatting

## Testing Strategy

Tests are in `tests/` directory with corresponding test files in `test-files/`:

- Unit tests for individual formatting features
- Integration tests for navigation and refactoring
- Test files use actual `.thrift` syntax for realistic scenarios

## Release Process

Automated via GitHub Actions:

1. `release-please` workflow - Creates release PRs from conventional commits
2. `publish` workflow - Builds and publishes to VS Code Marketplace and Open VSX

Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `perf:`

## Important Implementation Notes

1. **UUID Support**: Apache Thrift IDL 0.23+ treats `uuid` as a built-in primitive type. Ensure it's handled
   consistently across providers.

2. **Alignment Rules**:
    - `alignAssignments` controls both struct field equals and enum equals/values
    - `alignStructDefaults` is independent and only affects struct default values
    - Comment alignment only applies when `alignComments` is explicitly enabled

3. **Trailing Comma Logic**: Respects existing semicolons - won't replace `;` with `,`

4. **Include Path Resolution**: Uses relative paths from current file location

5. **Refactoring Safety**: Built-in conflict detection for rename operations
