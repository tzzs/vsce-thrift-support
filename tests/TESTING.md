# 测试规范与最佳实践

本文档描述 Thrift VS Code Extension 项目的测试规范、Mock 机制和最佳实践。

## 目录

- [测试框架](#测试框架)
- [统一 Mock 机制](#统一-mock-机制)
- [Mocha 测试结构](#mocha-测试结构)
- [常见问题与解决方案](#常见问题与解决方案)
- [示例](#示例)

---

## 测试框架

项目使用 **Mocha** 作为测试框架（v1.0.13+）：

- **配置文件**: `.mocharc.json`
- **测试目录**: `tests/src/**/*.js`
- **运行命令**: `npm test`
- **覆盖率**: `npm run coverage`

---

## 统一 Mock 机制

### 核心原则

✅ **使用 require-hook 自动注入（默认方式）**

- 项目使用 `require-hook.js` 自动拦截所有 `require('vscode')` 调用
- 无需手动导入或设置 mock 对象
- 只需正常 require 被测试模块即可
- 通过 `.mocharc.json` 自动加载 `require-hook.js`

❌ **禁止的做法**

- 创建本地 `const mockVscode = {}` 对象
- 手动使用 `Module.prototype.require` 拦截
- 在每个测试文件中重复定义 VSCode API 结构
- 在不需要时手动调用 `createVscodeMock()` 和 `installVscodeMock()`

### 基本用法

**默认方式（适用于 99% 的测试）**

```javascript
// ✅ 直接 require 被测试模块，mock 自动生效
const {ThriftParser} = require('../../../out/ast/parser.js');

// 编写测试
describe('parser', () => {
    it('should parse thrift code', () => {
        const parser = new ThriftParser('struct User {}');
        const ast = parser.parse();
        assert.ok(ast);
    });
});
```

**工作原理**：

1. Mocha 启动时加载 `.mocharc.json` 配置
2. `.mocharc.json` 中指定了 `--require tests/require-hook.js`
3. `require-hook.js` 拦截所有 `require('vscode')` 调用
4. 返回 `tests/mock_vscode.js` 中定义的 mock 对象
5. 被测试模块自动获得 mock化的 vscode API

### 自定义 Mock 扩展

**❗重要：大多数测试不需要自定义 mock**

require-hook 提供的默认 mock 已经包含所有常用 VSCode API。只有在需要**特定自定义行为**时才使用自定义 mock。

当测试需要自定义 VSCode API 行为时：

```javascript
// ❗仅在需要特定自定义行为时使用
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');

const vscode = createVscodeMock({
    workspace: {
        // 自定义实现
        findFiles: async (pattern) => {
            return [
                {fsPath: '/path/to/file1.thrift'},
                {fsPath: '/path/to/file2.thrift'}
            ];
        },
        
        openTextDocument: async (uri) => {
            return {
                getText: () => 'struct Test {}',
                uri: uri,
                languageId: 'thrift'
            };
        },
        
        // ⚠️ 必须包含所有默认方法！
        fs: {
            readFile: async () => Buffer.from(''),
            writeFile: async () => {},
            delete: async () => {},
            stat: async () => ({size: 0, mtime: 0, type: 1})
        },
        textDocuments: [],
        onDidOpenTextDocument: () => ({dispose: () => {}}),
        onDidChangeTextDocument: () => ({dispose: () => {}}),
        onDidSaveTextDocument: () => ({dispose: () => {}}),
        onDidCloseTextDocument: () => ({dispose: () => {}}),
        getConfiguration: () => ({
            get: (key, defaultValue) => defaultValue
        }),
        createFileSystemWatcher: (pattern) => ({
            onDidCreate: (callback) => ({dispose: () => {}}),
            onDidChange: (callback) => ({dispose: () => {}}),
            onDidDelete: (callback) => ({dispose: () => {}}),
            dispose: () => {}
        })
    }
});

installVscodeMock(vscode);

// 然后导入被测试模块
const {CustomProvider} = require('../../../out/custom-provider.js');
```

### ⚠️ 关键警告

**自定义 workspace 对象时必须包含所有默认方法！**

如果只提供部分方法，会导致：

```
TypeError: Cannot read properties of undefined (reading 'createFileSystemWatcher')
```

**必需的 workspace 方法列表**：

- `findFiles()`
- `openTextDocument()`
- `fs.readFile()`, `fs.writeFile()`, `fs.delete()`, `fs.stat()`
- `textDocuments` (数组)
- `onDidOpenTextDocument()`, `onDidChangeTextDocument()`, `onDidSaveTextDocument()`, `onDidCloseTextDocument()`
- `getConfiguration()`
- `createFileSystemWatcher()`

---

## Mocha 测试结构

### 基本结构

所有测试必须包装在 `describe/it` 块中：

```javascript
// ✅ 正确：包装在 Mocha 结构中
describe('feature-name', () => {
    it('should test specific behavior', async () => {
        await testFunction();
    });
    
    it('should handle edge case', () => {
        const result = syncFunction();
        assert.strictEqual(result, expected);
    });
});
```

### ❌ 禁止的模式

```javascript
// ❌ 错误：顶层调用（不在 Mocha 控制之下）
run().catch(err => {
    console.error(err);
    process.exit(1);
});

// ❌ 错误：直接执行
testFunction();

// ❌ 错误：try-catch 模式
try {
    run();
} catch (err) {
    console.error(err);
    process.exit(1);
}
```

### 异步测试

```javascript
// ✅ 正确：async/await 模式
describe('async-tests', () => {
    it('should handle async operation', async () => {
        const result = await asyncFunction();
        assert.ok(result);
    });
});

// ❌ 错误：忘记 async 关键字
describe('async-tests', () => {
    it('should handle async operation', () => {
        await asyncFunction(); // SyntaxError!
    });
});

// ❌ 错误：使用 done 回调（旧风格）
describe('async-tests', () => {
    it('should handle async operation', (done) => {
        asyncFunction().then(() => done()).catch(done);
    });
});
```

### Require 语句位置

```javascript
// ✅ 正确：require 在文件顶层
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
const vscode = createVscodeMock();
installVscodeMock(vscode);

const {ThriftParser} = require('../../../out/ast/parser.js');

describe('parser', () => {
    it('should parse', () => {
        const parser = new ThriftParser('...');
        // ...
    });
});

// ❌ 错误：在测试函数内 require
describe('parser', () => {
    it('should parse', () => {
        const {ThriftParser} = require('../../../out/ast/parser.js');
        // ...
    });
});
```

**原因**：require 语句应该在模块加载时执行，而不是在测试运行时。这样可以确保 mock 正确安装。

---

## 常见问题与解决方案

### 1. "Cannot read properties of undefined"

**错误示例**：

```
Cannot read properties of undefined (reading 'createFileSystemWatcher')
```

**原因**：自定义 workspace mock 缺少必需的方法

**解决方案**：确保自定义 workspace 包含所有默认方法（见上文）

### 2. "await is only valid in async functions"

**错误示例**：

```javascript
it('should test async', () => {
    await someAsyncFunction(); // SyntaxError!
});
```

**解决方案**：在 `it()` 前加 `async` 关键字

```javascript
it('should test async', async () => {
    await someAsyncFunction();
});
```

### 3. 测试未被 Mocha 执行

**症状**：测试直接执行并退出，不显示 Mocha 输出

**原因**：测试代码在文件顶层直接执行，而不是在 `describe/it` 中

**解决方案**：将所有测试逻辑包装在 `describe/it` 块中

### 4. Mock 未生效

**症状**：被测试模块抛出 "vscode is not defined" 或类似错误

**原因**：`installVscodeMock()` 在 `require()` 被测试模块之后调用

**解决方案**：确保 mock 安装顺序正确

```javascript
// 正确顺序
const vscode = createVscodeMock();
installVscodeMock(vscode);  // 先安装
const module = require('...');  // 后导入
```

### 5. 路径分隔符问题

**症状**：在 Windows 上路径比较失败

**解决方案**：使用 `path.normalize()` 或统一转换为正斜杠

```javascript
const normalizedPath = filePath.replace(/\\/g, '/');
```

### 6. TextDocument mock 缺少 uri

**错误示例**：

```
Cannot read properties of undefined (reading 'fsPath')
```

**解决方案**：确保 TextDocument mock 包含 `uri` 属性

```javascript
const mockDocument = {
    uri: vscode.Uri.file('/path/to/file.thrift'),
    getText: () => content,
    lineAt: (line) => ({text: lines[line]}),
    languageId: 'thrift'
};
```

---

## 示例

### 完整测试文件示例

**默认方式（推荐）**

```javascript
// tests/src/example/test-example.js

// 1. 导入被测试模块（mock 自动生效）
const {ExampleProvider} = require('../../../out/example-provider.js');

// 2. 导入断言库
const assert = require('assert');

// 3. 编写测试
describe('example-provider', () => {
    it('should provide basic functionality', () => {
        const provider = new ExampleProvider();
        const result = provider.doSomething();
        assert.strictEqual(result, 'expected');
    });
    
    it('should handle async operations', async () => {
        const provider = new ExampleProvider();
        const result = await provider.doAsyncThing();
        assert.ok(result);
    });
    
    it('should handle errors', () => {
        const provider = new ExampleProvider();
        assert.throws(() => {
            provider.throwError();
        }, /Expected error message/);
    });
});
```

### 自定义 Mock 示例

```javascript
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');

// 自定义 mock 以模拟特定的工作区行为
const vscode = createVscodeMock({
    workspace: {
        // 模拟特定文件列表
        findFiles: async (pattern) => {
            if (pattern === '**/*.thrift') {
                return [
                    {fsPath: '/project/user.thrift'},
                    {fsPath: '/project/order.thrift'}
                ];
            }
            return [];
        },

        // 模拟文档内容
        openTextDocument: async (uri) => {
            const fileName = uri.fsPath.split('/').pop();
            const content = mockFileContents[fileName] || '';
            return {
                getText: () => content,
                uri: uri,
                languageId: 'thrift'
            };
        },

        // 必须包含所有其他默认方法
        fs: {
            readFile: async () => Buffer.from(''),
            writeFile: async () => {
            },
            delete: async () => {
            },
            stat: async () => ({size: 0, mtime: 0, type: 1})
        },
        textDocuments: [],
        onDidOpenTextDocument: () => ({
            dispose: () => {
            }
        }),
        onDidChangeTextDocument: () => ({
            dispose: () => {
            }
        }),
        onDidSaveTextDocument: () => ({
            dispose: () => {
            }
        }),
        onDidCloseTextDocument: () => ({
            dispose: () => {
            }
        }),
        getConfiguration: () => ({
            get: (key, defaultValue) => defaultValue
        }),
        createFileSystemWatcher: () => ({
            onDidCreate: () => ({
                dispose: () => {
                }
            }),
            onDidChange: () => ({
                dispose: () => {
                }
            }),
            onDidDelete: () => ({
                dispose: () => {
                }
            }),
            dispose: () => {
            }
        })
    }
});

installVscodeMock(vscode);

const {WorkspaceSymbolProvider} = require('../../../out/workspace-symbol-provider.js');

describe('workspace-symbol-provider', () => {
    it('should find symbols in workspace', async () => {
        const provider = new WorkspaceSymbolProvider();
        const symbols = await provider.provideWorkspaceSymbols('User');
        assert.ok(symbols.length > 0);
    });
});
```

---

## 调试技巧

### 运行单个测试文件

```bash
# 直接运行
node tests/src/formatter/test-text-utils.js

# 或使用 Mocha
npx mocha tests/src/formatter/test-text-utils.js
```

### 使用调试器

在 VS Code 中创建 `.vscode/launch.json`：

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "node",
            "request": "launch",
            "name": "Mocha Test",
            "program": "${workspaceFolder}/node_modules/mocha/bin/_mocha",
            "args": [
                "${file}",
                "--timeout",
                "10000"
            ],
            "console": "integratedTerminal",
            "internalConsoleOptions": "neverOpen"
        }
    ]
}
```

### 查看覆盖率详情

```bash
npm run coverage

# 查看 HTML 报告
open coverage/index.html  # macOS
xdg-open coverage/index.html  # Linux
start coverage/index.html  # Windows
```

---

## 参考资料

- [Mocha 官方文档](https://mochajs.org/)
- [Node.js Assert 文档](https://nodejs.org/api/assert.html)
- [VS Code Extension Testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- 项目主文档: [DEVELOPMENT.md](../DEVELOPMENT.md)
- 项目规范: [AGENTS.md](../AGENTS.md)

---

## 更新日志

- **2026-01-10**: 创建测试规范文档，定义统一 mock 机制和 Mocha 测试结构要求
- **v1.0.13+**: 全面迁移至 Mocha 测试框架
