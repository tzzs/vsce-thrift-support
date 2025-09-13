# Thrift Support for VSCode

[English](./README.en.md) | [中文](./README.md)

A VSCode extension that provides complete support for Apache Thrift files, including syntax highlighting, code formatting, and navigation.

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/tanzz.thrift-support?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=tanzz.thrift-support)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/tanzz.thrift-support?label=Installs)](https://marketplace.visualstudio.com/items?itemName=tanzz.thrift-support)
[![Open VSX](https://img.shields.io/open-vsx/v/tanzz/thrift-support?label=Open%20VSX)](https://open-vsx.org/extension/tanzz/thrift-support)
[![OVSX Downloads](https://img.shields.io/open-vsx/dt/tanzz/thrift-support?label=OVSX%20Downloads)](https://open-vsx.org/extension/tanzz/thrift-support)
[![CI](https://github.com/tzzs/vsce-thrift-support/actions/workflows/publish.yml/badge.svg?branch=master)](https://github.com/tzzs/vsce-thrift-support/actions/workflows/publish.yml)

> For development details, see [DEVELOPMENT.md](DEVELOPMENT.md).

## 🚀 Features

### Syntax Highlighting
- Full Thrift syntax coverage: keywords, data types, strings, comments, numeric literals
- Supports all primitive and container types
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

## 📦 Installation

1. Open VSCode
2. Open the Extensions view (`Ctrl+Shift+X`)
3. Search for "Thrift Support"
4. Click Install

## 🔧 Usage

### Formatting
- Format Document: `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Shift+I` (macOS)
- Format Selection: select text, then `Ctrl+K Ctrl+F` (Windows/Linux) or `Cmd+K Cmd+F` (macOS)
- Command Palette:
  - `Thrift: Format Document`
  - `Thrift: Format Selection`

### Code Navigation
- Go to Definition: `F12` or `Ctrl+Click` on type names
- Peek Definition: `Alt+F12`

### Configuration

In VSCode settings, you can configure:

```json
{
  "thrift.format.trailingComma": "preserve", // "preserve" | "add" | "remove"
  "thrift.format.alignTypes": true,
  "thrift.format.alignFieldNames": true,
  "thrift.format.alignStructEquals": false,
  "thrift.format.alignComments": true,
  "thrift.format.alignEnumNames": true,
  "thrift.format.alignEnumEquals": true,
  "thrift.format.alignEnumValues": true,
  "thrift.format.indentSize": 4,
  "thrift.format.maxLineLength": 100,
  "thrift.format.collectionStyle": "preserve" // "preserve" | "multiline" | "auto"
}
```

## 📝 Formatting Example

### Before:
```thrift
struct User{
1:required string name
2:optional i32 age,
3: string email // user email
}
```

### After:
```thrift
struct User {
    1:    required string name,
    100:  optional i32    age,
    1000: string          email  // user email
}
```

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
