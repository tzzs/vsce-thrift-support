# Debug Files Directory

This directory contains debug, analysis, and utility scripts used during development and troubleshooting. Files are grouped into three subdirectories for clarity.

## Structure

```
- debug/   # Repro and debugging scripts (includes mocks)
- analysis/ # Analysis scripts for tests/results
- tools/   # Fix/utility/generation scripts
```

## debug/
Typical contents:
- `debug-*.js` (formatter/parser/service debugging)
- `repro_*.js`, `reproduce_issue.*`
- `simple-test.js`, `test_debug.js`
- `mock-vscode.js`, `mock_vscode.js`

## analysis/
Typical contents:
- `analyze-*.js`
- `standalone-analyzer.js`

## tools/
Typical contents:
- `fix-*.js`
- `generate-test-files.js`
- `format-example.js`
- `find-failure.js`, `show-failure.js`
- `final-blank-line-verification.js`
- `simple-test-framework.js`

## Usage Guidelines

These files are for development/debugging only and are not part of the main test suite.
