# Thrift Support for VSCode

[English](./README.en.md) | [中文](./README.md)

A VSCode extension that provides complete support for Apache Thrift files, including syntax highlighting, code
formatting, and navigation.

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/tanzz.thrift-support?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=tanzz.thrift-support)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/tanzz.thrift-support?label=Installs)](https://marketplace.visualstudio.com/items?itemName=tanzz.thrift-support)
[![Open VSX](https://img.shields.io/open-vsx/v/tanzz/thrift-support?label=Open%20VSX)](https://open-vsx.org/extension/tanzz/thrift-support)
[![OVSX Downloads](https://img.shields.io/open-vsx/dt/tanzz/thrift-support?label=OVSX%20Downloads)](https://open-vsx.org/extension/tanzz/thrift-support)
[![CI](https://github.com/tzzs/vsce-thrift-support/actions/workflows/publish.yml/badge.svg?branch=master)](https://github.com/tzzs/vsce-thrift-support/actions/workflows/publish.yml)

> For development details, see [DEVELOPMENT.md](DEVELOPMENT.md).

## 🚀 Features

### Syntax Highlighting

- Full Thrift syntax coverage: keywords, data types, strings, comments, numeric literals
- Supports all primitive and container types (including `uuid`)
- Smart token coloring for better readability

### Code Formatting

- Document formatting: format the entire Thrift file with one command
- Selection formatting: format only the selected text
- Smart alignment: align field types, field names, and comments
- Configurable: indentation, line length, and more formatting rules

> Publisher namespace: tanzz (used for both VS Marketplace and Open VSX)

### Code Navigation

- Go to Definition: jump to type definitions quickly
- Include resolution: follow `include` statements across files
- Workspace search: find definitions across the workspace

### Code Refactoring

- Identifier rename (F2): updates references across files with basic conflict checks
- Extract type (typedef): infer type from selection or current field and generate a `typedef`
- Move type to file: move `struct/enum/service/typedef` into a new `.thrift` file and auto-insert an `include`

## 📦 Installation

1. Open VSCode
2. Open the Extensions view (`Ctrl+Shift+X`)
3. Search for "Thrift Support"
4. Click Install

## 🔧 Usage

## 🧭 Project Structure

- `src/`: extension core (providers, formatter, diagnostics, extension entry)
- `src/formatter/`: formatting engine (pure formatting logic)
- `src/formatting-bridge/`: VS Code formatting bridge (options/context/range helpers)
- `src/references/`: reference helpers (AST cache, traversal, symbol typing)
- `src/utils/`: shared utilities (cache, file IO, error handling)
- `tests/`: unit and scenario tests
- `test-files/` / `tests/src/**/test-files/`: fixtures
- `syntaxes/` / `language-configuration.json`: syntax highlighting + language config

### Formatting

- Format Document: `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Shift+I` (macOS)
- Format Selection: select text, then `Ctrl+K Ctrl+F` (Windows/Linux) or `Cmd+K Cmd+F` (macOS)
- Command Palette:
    - `Thrift: Format Document`
    - `Thrift: Format Selection`

### Code Navigation

- Go to Definition: `F12` or `Ctrl+Click`
- Peek Definition: `Alt+F12`

### Diagnostics

- Syntax pairing and unclosed checks (syntax.unmatchedCloser / syntax.unclosed)
- Type checks: unknown types and typedef base (type.unknown / typedef.unknownBase)
- Container inner type checks: validate inner types of list/map/set
- Enum constraints: values must be non-negative integers (enum.negativeValue / enum.valueNotInteger)
- Default value type checks: including base types and UUID string format (value.typeMismatch)
- Service constraints:
    - oneway must return void and must not declare throws (service.oneway.returnNotVoid / service.oneway.hasThrows)
    - throws must reference known exception types (service.throws.unknown / service.throws.notException)
    - extends must target a service type (service.extends.unknown / service.extends.notService)
- Robust default value extraction improvements:
    - Ignore '=' inside field annotations so it won’t be treated as the start of a default value
    - set<T> default values accept either `[]` or `{}` with bracket-aware element checks

Note: Diagnostics update in real-time during editing and on save. You can review them in VSCode’s “Problems” panel.

### Code Refactoring

- Identifier rename (F2): cross-file reference updates with basic conflict checks
- Extract type (typedef): infer type from selection/current field and generate a `typedef`
- Move type to file: move `struct/enum/service/typedef` into a new `.thrift` file and auto-insert an `include`

## 📐 Language Spec Alignment (IDL 0.23)

- Starting from Apache Thrift IDL 0.23, `uuid` is treated as a built-in base type in this extension.
- Alignment touches the following components:
    - Diagnostics: `uuid` is recognized as a primitive type
    - Definition Provider: `uuid` is excluded from user-defined symbol navigation
    - Syntax Highlighting: `uuid` is included in the primitive type regex
- Reference: Apache Thrift IDL — https://thrift.apache.org/docs/idl

## 🐛 Issues

If you encounter issues or have feature requests:

1. Create an issue in the GitHub repository
2. Include details: VSCode version, extension version, steps to reproduce, expected vs. actual behavior
3. Provide a minimal reproducible example when possible

## 🤝 Contributing

We welcome contributions!

### How to Contribute

1. Report bugs and propose features
2. Open pull requests with clear descriptions
3. Help improve documentation

### Development

Development prerequisites, build/test steps, and CI/CD details have been moved to DEVELOPMENT.md.

### Pull Requests

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Commit changes: `git commit -m "Add your feature"`
3. Push branch: `git push origin feature/your-feature`
4. Open a Pull Request

## 📄 License

MIT License.

## 🔄 Changelog

See [CHANGELOG.md](CHANGELOG.md) locally or the GitHub Releases page for the complete history.

## 🔗 Links

- GitHub Repository: https://github.com/tzzs/vsce-thrift-support
- Issues: https://github.com/tzzs/vsce-thrift-support/issues
- Discussions: https://github.com/tzzs/vsce-thrift-support/discussions
- CI Status: https://github.com/tzzs/vsce-thrift-support/actions/workflows/publish.yml
- Changelog: https://github.com/tzzs/vsce-thrift-support/blob/master/CHANGELOG.md
- Apache Thrift IDL: https://thrift.apache.org/docs/idl
- Thrift Type system: https://thrift.apache.org/docs/types
