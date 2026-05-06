# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VS Code extension that provides comprehensive language support for Apache Thrift IDL files. The extension offers syntax highlighting, code formatting, navigation, diagnostics, and refactoring capabilities for `.thrift` files.

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
npm test             # Run main include-navigation test
npm run test:all     # Run all individual tests (note: chained via &&, stops on first failure)
npm run test:all:node # Run all tests via node script (runs all regardless of failures)
npm run coverage     # Generate coverage report

# Individual test suites
npm run test:complex     # Complex types formatting
npm run test:enum        # Enum formatting
npm run test:indent      # Indent width tests
npm run test:comma       # Trailing comma tests
npm run test:const       # Constant formatting tests

# Run a single test file directly
node tests/test-struct-annotations-combinations.js
```

### Pre-push checklist (matches CI)
```bash
npm run lint && npm run build && npm run test:all
```

### Packaging and Publishing
```bash
npm run package      # Create .vsix extension package
npm run publish      # Publish to VS Code Marketplace (requires VSCE_PAT)
```

## Architecture Overview

### Core Modules
- `src/extension.ts` - Extension entry point, registers all providers and commands (activated `onLanguage:thrift`)
- `src/formattingProvider.ts` - Document and range formatting with alignment strategies; implements `DocumentFormattingEditProvider` and `DocumentRangeFormattingEditProvider`
- `src/definitionProvider.ts` - Go-to-definition with include resolution and workspace-wide symbol search
- `src/diagnostics.ts` - Syntax and semantic error detection (type checks, enum values, service constraints, etc.)
- `src/renameProvider.ts` - Cross-file symbol renaming (F2) with conflict detection
- `src/codeActionsProvider.ts` - Refactoring actions (extract typedef, move type to file) as Code Actions + Quick Fix

### AST & Annotation System
- `src/astTypes.ts` - TypeScript interfaces for Thrift AST nodes (AnnotationNode, AnnotationPair, FieldNode, etc.)
- `src/annotationParser.ts` - Parses Thrift annotations into AST nodes, handling nested parentheses, quoted strings, and escape sequences. Imported by `formattingProvider` to preserve annotation information during formatting.

### Additional Language Providers
- `src/completionProvider.ts` - Auto-completion for Thrift keywords and symbols
- `src/hoverProvider.ts` - Symbol documentation on hover
- `src/signatureHelpProvider.ts` - Function parameter hints (triggered on `(` and `,`)
- `src/documentSymbolProvider.ts` - Outline / breadcrumb view
- `src/workspaceSymbolProvider.ts` - Global workspace symbol search (Ctrl+T)
- `src/referencesProvider.ts` - Find All References
- `src/foldingRangeProvider.ts` - Code folding regions
- `src/selectionRangeProvider.ts` - Smart selection expansion

### Key Design Patterns
1. **Formatting Pipeline**: Parse → Analyze alignment widths → Transform → Output
2. **Include Resolution**: Builds dependency graph for cross-file navigation
3. **Configuration-Driven**: All formatting behavior controlled via VS Code settings
4. **Error Recovery**: Parser is fault-tolerant to preserve existing layout
5. **Providers registered via extension host API**: No separate language server — all VS Code built-in language provider APIs

### Syntax Highlighting
- `syntaxes/thrift.tmLanguage.json` - TextMate grammar for syntax highlighting
- `language-configuration.json` - Bracket matching, comments, indentation rules

## Configuration System

All settings under `thrift.format.*` in `package.json`:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `alignTypes` | boolean | true | Align field types in structs/unions/exceptions |
| `alignNames` | boolean | true | Align field names and enum member names (unified) |
| `alignAssignments` | boolean | true | Master switch for `=` and value alignment (struct fields + enum members) |
| `alignStructDefaults` | boolean | false | Align `=` for struct field default values; independent from `alignAssignments` |
| `alignAnnotations` | boolean | true | Align inline annotations e.g. `(go.tag='json:...')` |
| `alignComments` | boolean | true | Align inline comments |
| `trailingComma` | string | "preserve" | `"add"` / `"remove"` / `"preserve"` |
| `indentSize` | number | 4 | Spaces per indent level |
| `maxLineLength` | number | 100 | Target max line length |
| `collectionStyle` | string | "preserve" | `"preserve"` / `"multiline"` / `"auto"` |

## CI/CD

- **ci.yml**: Runs on every push and PR — `lint → build → test:all` with Node 22.18.0
- **release-please.yml**: Triggered on push to master; creates release PRs from conventional commits
- **publish.yml**: Triggered on GitHub Release published; builds and publishes to VS Code Marketplace + Open VSX

Default branch: `master`. Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `perf:`.

## Important Implementation Notes

1. **UUID Support**: Apache Thrift IDL 0.23+ treats `uuid` as a built-in primitive type. `diagnostics.ts`, `definitionProvider.ts`, and `thrift.tmLanguage.json` all include `uuid` in their primitive type sets — ensure consistency when adding new type handling.

2. **Alignment Rules & Priorities**:
   - `alignAssignments` controls both struct field equals and enum equals/values
   - `alignStructDefaults` is independent and only affects struct default values (does not follow `alignAssignments`)
   - `alignAnnotations` takes precedence over the deprecated `alignStructAnnotations` alias; if `alignAnnotations` is not explicitly set, falls back to `alignStructAnnotations` (default true)
   - Comment alignment only applies when `alignComments` is explicitly enabled; when disabled comments may still "appear aligned" if other columns happen to match widths — this is coincidental, not forced by the formatter

3. **Trailing Comma Logic**: Respects existing semicolons — won't replace `;` with `,`. In `remove` mode, commas are stripped but semicolons are preserved.

4. **Annotation Parsing**: The `annotationParser` module strips `=` from annotations in field parsing to avoid misidentifying annotation content as default value start positions. This is critical for correct field parsing in `diagnostics.ts`.

5. **Include Path Resolution**: Uses relative paths from current file location.

6. **Refactoring Safety**: Built-in conflict detection for rename operations. The `moveType` command automatically inserts `include` lines in the source file.
