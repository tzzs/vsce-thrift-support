# Thrift Support for VSCode

A comprehensive VSCode extension that provides full support for Apache Thrift files with syntax highlighting, formatting, and navigation features.

## Features

### 🎨 Syntax Highlighting
- **Keywords**: `struct`, `service`, `enum`, `union`, `exception`, `namespace`, `include`, etc.
- **Data Types**: Primitive types (`string`, `i32`, `bool`, etc.) and container types (`list`, `map`, `set`)
- **Strings**: Double and single quoted strings with escape sequence support
- **Comments**: Line comments (`//`, `#`) and block comments (`/* */`)
- **Numbers**: Integer, floating-point, hexadecimal, and octal literals

### 🔧 Code Formatting
- **Document Formatting**: Format entire Thrift files
- **Selection Formatting**: Format selected code blocks
- **Configurable Options**:
  - Trailing commas after struct fields
  - Type alignment in struct definitions
  - Field name alignment
  - Comment alignment
  - Customizable indentation size
  - Maximum line length

### 🔍 Navigation Support
- **Go to Definition**: Navigate to type definitions across files
- **Include File Resolution**: Follow `include` statements to referenced files
- **Workspace-wide Search**: Find definitions across all Thrift files in workspace

### ⚙️ Configuration

The extension provides several configuration options under `thrift.format`:

```json
{
  "thrift.format.trailingComma": true,
  "thrift.format.alignTypes": true,
  "thrift.format.alignFieldNames": true,
  "thrift.format.alignComments": true,
  "thrift.format.indentSize": 2,
  "thrift.format.maxLineLength": 100
}
```

## Usage

### Formatting
1. **Format Document**: `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Shift+I` (Mac)
2. **Format Selection**: Select code and use `Ctrl+K Ctrl+F` (Windows/Linux) or `Cmd+K Cmd+F` (Mac)
3. **Command Palette**: 
   - `Thrift: Format Document`
   - `Thrift: Format Selection`

### Navigation
1. **Go to Definition**: `F12` or `Ctrl+Click` on type names
2. **Peek Definition**: `Alt+F12`

## Code Standards

This extension follows the [Apache Thrift Coding Standards](https://thrift.apache.org/docs/coding_standards.html):

- Uses spaces instead of tabs (configurable)
- Maximum line width of 100 characters (configurable)
- 2-space indentation (configurable)
- Proper alignment of struct fields
- Consistent formatting across files

## Example

### Before Formatting:
```thrift
struct User{
1:required string name
2:optional i32 age,
3: string email // user email
}
```

### After Formatting:
```thrift
struct User {
  1: required string name,                    // 
  2: optional i32    age,                     // 
  3:          string email,                   // user email
}
```

## Installation

1. Open VSCode
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "Thrift Support"
4. Click Install

## Development

### Prerequisites
- Node.js 16+
- VSCode 1.74+

### Setup
```bash
npm install
npm run compile
```

### Testing
```bash
npm run test
```

### Building
```bash
npm run vscode:prepublish
```

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

This extension is licensed under the MIT License.

## Changelog

### 0.1.0
- Initial release
- Syntax highlighting for Thrift files
- Document and selection formatting
- Go-to-definition support
- Configurable formatting options