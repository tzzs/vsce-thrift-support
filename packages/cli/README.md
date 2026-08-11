# thrift-support

Apache Thrift IDL CLI powered by the same shared core as the Thrift Support VS Code extension. It formats whole files or line ranges, runs diagnostics, outputs AST JSON, and lists symbols.

[![npm](https://img.shields.io/npm/v/thrift-support)](https://www.npmjs.com/package/thrift-support)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Installation

```bash
npm install -g thrift-support
# or as a dev dependency
npm install --save-dev thrift-support
```

## Commands

### `format`

Format one or more Thrift IDL files.

```bash
thrift-support format [options] <files...>

Options:
  --check                 Exit 1 if any file is not formatted (CI mode)
  --write, -w             Write formatted output back to files
  --stdin                 Read from stdin, write to stdout
  --stdin-filepath <p>    Filepath hint used with --stdin for config lookup
  --range <start>:<end>   Format only lines start..end (1-based, inclusive)
  --indent-size <n>       Spaces per indent level (default: 4)
  --max-line-length <n>   Target max line length (default: 100)
  --trailing-comma <m>    preserve | add | remove  (default: preserve)
  --collection-style <m>  preserve | multiline | auto  (default: preserve)
```

Examples:

```bash
# Check formatting in CI
thrift-support format --check src/**/*.thrift

# Format all files in a directory
thrift-support format --write src/

# Pipe through stdin
cat myfile.thrift | thrift-support format --stdin

# Format only lines 12 through 18
thrift-support format --range 12:18 src/*.thrift
```

`--range` formats only the selected lines and leaves the rest of the file
untouched. The indentation context is derived from the lines before the
range, matching the VS Code extension's "Format Selection" behavior.

### `lint`

Run diagnostic rules (syntax checks, semantic checks, include validation).

```bash
thrift-support lint [options] <files...>

Options:
  --severity <level>    error | warning | all  (default: all)
  --json                Output results as JSON
  --include-path <dir>  Directory to search for included files (repeatable)
  --quiet, -q           Suppress output when no issues found
```

Examples:

```bash
# Lint with all severities
thrift-support lint src/**/*.thrift

# CI: fail only on errors, JSON output
thrift-support lint --severity error --json src/**/*.thrift
```

### `parse`

Parse a Thrift file and output the AST as JSON.

```bash
thrift-support parse [options] <file>
thrift-support parse --stdin

Options:
  --stdin   Read source from stdin
```

### `symbols`

List all symbols (structs, enums, services, typedefs, etc.) defined in a file.

```bash
thrift-support symbols [options] <file>

Options:
  --json   Output as JSON array
  --flat   Flat output (no indentation / nesting)
```

## Configuration

The CLI resolves options in this order (highest priority first):

1. CLI flags
2. `--config <path>` flag
3. `.thriftrc.json` found by searching upward from the target file
4. Built-in defaults

`.thriftrc.json` example:

```json
{
    "format": {
        "indentSize": 4,
        "trailingComma": "add",
        "alignTypes": true,
        "alignNames": true,
        "alignAssignments": true,
        "alignComments": true,
        "maxLineLength": 100,
        "collectionStyle": "preserve"
    },
    "lint": {
        "severity": "error"
    }
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Lint errors found, or `--check` detected unformatted files |
| `2` | Usage / argument error |
| `3` | Internal error (parse failure, file I/O error, etc.) |

## Relation to the VS Code Extension

This package and the
[Thrift Support VS Code extension](https://marketplace.visualstudio.com/items?itemName=tanzz.thrift-support)
both use `@tanzz/thrift-core` for parsing and language behavior. CLI
`format --range` and VS Code **Format Selection** therefore derive indentation
context through the same implementation. Formatting options map directly to
the extension's `thrift.format.*` settings.

## License

MIT — see [LICENSE](LICENSE).
