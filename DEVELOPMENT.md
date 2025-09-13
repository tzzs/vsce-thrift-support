# Thrift Support for VSCode - Development Guide

A comprehensive VSCode extension that provides full support for Apache Thrift files with syntax highlighting, formatting, and navigation features.

## Project Overview

**Name**: thrift-support  
**Version**: 0.1.0  
**Publisher**: tzzs  
**Repository**: https://github.com/tzzs/thrift-support.git  
**VSCode Engine**: ^1.74.0  

## Project Architecture

### Directory Structure
```
thrift-support/
├── src/                          # TypeScript source code
│   ├── extension.ts             # Main extension entry point
│   ├── formatter.ts             # Thrift code formatter implementation
│   └── definitionProvider.ts   # Go-to-definition provider
├── syntaxes/                    # Language grammar definitions
│   └── thrift.tmLanguage.json  # TextMate grammar for syntax highlighting
├── test-files/                  # Thrift test and example files
│   ├── apache-thrift-test.thrift
│   ├── example-enum.thrift
│   ├── example.thrift
│   ├── main.thrift
│   ├── shared-common.thrift
│   ├── shared.thrift
│   └── test-user-issue.thrift
├── tests/                       # Test scripts and utilities
│   ├── debug-*.js              # Debug and diagnostic scripts
│   ├── test-*.js               # Feature-specific test scripts
│   ├── simple-test.js           # Basic functionality tests
│   └── verify-installation.js  # Installation verification
├── .vscode/                     # VSCode workspace configuration
├── package.json                 # Extension manifest and dependencies
├── tsconfig.json               # TypeScript configuration
├── language-configuration.json # Language-specific settings
└── README.md                   # User documentation
```

### Core Components

#### 1. Extension Entry Point (`src/extension.ts`)
- Registers language providers and commands
- Manages extension lifecycle
- Handles configuration changes

#### 2. Formatter (`src/formatter.ts`)
- Implements comprehensive Thrift code formatting
- Supports configurable alignment and styling options
- Handles complex indentation scenarios

#### 3. Definition Provider (`src/definitionProvider.ts`)
- Provides go-to-definition functionality
- Resolves include statements and cross-file references
- Supports workspace-wide navigation

#### 4. Syntax Grammar (`syntaxes/thrift.tmLanguage.json`)
- TextMate grammar for syntax highlighting
- Comprehensive token recognition
- Support for all Thrift language constructs

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
- **Advanced Alignment Options**:
  - Field types alignment in structs/unions/exceptions
  - Field names alignment
  - Inline comments alignment
  - Enum names, equals signs, and values alignment
- **Configurable Settings**:
  - Trailing comma behavior (preserve/add/remove)
  - Customizable indentation size (default: 4 spaces)
  - Maximum line length (default: 100 characters)

### 🔍 Navigation Support
- **Go to Definition**: Navigate to type definitions across files
- **Include File Resolution**: Follow `include` statements to referenced files
- **Workspace-wide Search**: Find definitions across all Thrift files in workspace

### ⚙️ Configuration

The extension provides comprehensive configuration options under `thrift.format`:

```json
{
  "thrift.format.trailingComma": "preserve",        // "preserve" | "add" | "remove"
  "thrift.format.alignTypes": true,                 // Align field types
  "thrift.format.alignFieldNames": true,            // Align field names
  "thrift.format.alignComments": true,              // Align inline comments
  "thrift.format.alignEnumNames": true,             // Align enum names
  "thrift.format.alignEnumEquals": true,            // Align enum equals signs
  "thrift.format.alignEnumValues": true,            // Align enum values
  "thrift.format.indentSize": 4,                    // Indentation spaces
  "thrift.format.maxLineLength": 100                // Maximum line length
}
```

#### Configuration Details
- **trailingComma**: Controls trailing comma behavior with three options:
  - `preserve`: Keep existing trailing commas as-is
  - `add`: Always add trailing commas
  - `remove`: Always remove trailing commas
- **Alignment Options**: Fine-grained control over different alignment aspects
- **indentSize**: Configurable indentation (default: 4 spaces)
- **maxLineLength**: Line length limit for formatting decisions

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

## Development

### Prerequisites
- Node.js 16+
- VSCode 1.74+
- TypeScript 4.9+

### Setup
```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch
```

### Testing

The project includes comprehensive test suites organized in the `tests/` directory:

```bash
# Run primary test suite
npm run test

# Run specific test categories
npm run test:complex     # Complex type formatting tests
npm run test:enum        # Enum formatting tests
npm run test:indent      # Indentation tests
npm run test:comma       # Trailing comma tests

# Run all tests
npm run test:all
```

#### Test Categories
- **Core Functionality**: `test-formatter.js`, `simple-test.js`
- **Feature-Specific**: `test-enum-formatting.js`, `test-complex-types.js`
- **Edge Cases**: `test-edge-cases.js`, `test-user-scenario.js`
- **Integration**: `test-vscode-format.js`, `test-include-navigation.js`
- **Debug Tools**: `debug-*.js` scripts for troubleshooting

### Building and Packaging

```bash
# Clean build artifacts
npm run clean

# Full build
npm run build

# Prepare for publishing
npm run vscode:prepublish

# Create VSIX package
npm run package

# Publish to marketplace
npm run publish
```

### Development Workflow

1. **Code Changes**: Edit TypeScript files in `src/`
2. **Compile**: Run `npm run compile` or use watch mode
3. **Test**: Run relevant test suites
4. **Debug**: Use VSCode's built-in debugging with `.vscode/launch.json`
5. **Package**: Create VSIX for testing in clean environment

### File Organization

- **Source Code**: All TypeScript source in `src/`
- **Test Files**: Thrift examples and test cases in `test-files/`
- **Test Scripts**: JavaScript test runners in `tests/`
- **Build Output**: Compiled JavaScript in `out/` (git-ignored)

### Dependencies

#### Runtime Dependencies
- None (extension runs in VSCode's Node.js environment)

#### Development Dependencies
- **TypeScript**: Language and compiler
- **ESLint**: Code linting and style enforcement
- **VSCE**: VSCode extension packaging tool
- **Rimraf**: Cross-platform file cleanup

## Architecture Notes

### Formatter Design
The formatter (`src/formatter.ts`) uses a multi-pass approach:
1. **Parsing**: Tokenize and understand Thrift structure
2. **Analysis**: Determine alignment requirements and formatting needs
3. **Transformation**: Apply formatting rules while preserving semantics
4. **Output**: Generate formatted code with proper indentation and alignment

### Extension Activation
The extension activates on `onLanguage:thrift` events and registers:
- Document and selection formatting providers
- Definition providers for navigation
- Commands for manual formatting operations

### Configuration Management
Configuration changes are monitored and applied dynamically without requiring extension restart.

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Code Style**: Follow existing TypeScript and formatting conventions
2. **Testing**: Add tests for new features in the `tests/` directory
3. **Documentation**: Update relevant documentation for changes
4. **Test Files**: Add example Thrift files to `test-files/` if needed

### Development Setup for Contributors
1. Fork the repository
2. Clone your fork locally
3. Run `npm install` to install dependencies
4. Make changes and test thoroughly
5. Submit a pull request with clear description

## License

This extension is licensed under the MIT License.

## Testing Strategy

### Test File Organization
The `test-files/` directory contains various Thrift files for testing different scenarios:
- **apache-thrift-test.thrift**: Comprehensive Apache Thrift test cases
- **example-*.thrift**: Basic examples and common patterns
- **shared-*.thrift**: Shared type definitions and includes
- **test-user-issue.thrift**: User-reported issue reproductions

### Test Script Categories
1. **Formatter Tests**: Validate code formatting behavior
2. **Navigation Tests**: Test go-to-definition and include resolution
3. **Edge Case Tests**: Handle unusual or complex scenarios
4. **Integration Tests**: End-to-end functionality validation
5. **Debug Scripts**: Diagnostic and troubleshooting tools

## Changelog

### 0.1.0
- Initial release
- Comprehensive syntax highlighting for Thrift files
- Advanced document and selection formatting with alignment options
- Go-to-definition support with cross-file navigation
- Extensive configuration options for formatting behavior
- Support for trailing comma control (preserve/add/remove)
- Enum formatting with multiple alignment options
- Robust include file resolution
- Comprehensive test suite with multiple test categories