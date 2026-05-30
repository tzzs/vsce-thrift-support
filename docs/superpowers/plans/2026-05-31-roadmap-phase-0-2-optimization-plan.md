# Roadmap Phase 0-2 优化实施计划

> **面向 agentic workers：** 必须使用子技能：推荐使用 `superpowers:subagent-driven-development`，也可以使用 `superpowers:executing-plans`，按任务逐项执行本计划。步骤使用 checkbox（`- [ ]`）语法跟踪进度。

**目标：** 先完成 Roadmap 中风险最低但收益最高的基础优化：文档校准、测试/模块解析稳定化、共享 WorkspaceIndex 设计与最小落地。

**架构：** 第一批不改 Thrift 语言行为，先降低后续重构风险。Phase 0 修正文档和测试分类，Phase 1 稳定测试模块解析，Phase 2 引入 VS Code 层共享 `WorkspaceIndex`，并逐步迁移 provider 的重复工作区扫描逻辑。

**技术栈：** TypeScript、VS Code Extension API、Mocha、pnpm workspaces、esbuild、c8。

---

## 执行边界

本计划建议先实施 Roadmap Phase 0-2，不直接进入 parser 拆分、AST-based refactor、诊断规则注册表等高风险阶段。

原因：
- Phase 0-1 能先消除文档、测试和模块解析的不确定性。
- Phase 2 的 `WorkspaceIndex` 是后续 completion、definition、references、quick fix、CodeLens 的共同基础。
- parser/refactor/diagnostics 配置化应在共享索引稳定后拆独立 PR。

## 预期 PR

建议拆成 3 个 commit 或 3 个 PR：

1. `docs: align monorepo docs and test taxonomy`
2. `test: stabilize compiled module resolution`
3. `refactor: introduce thrift workspace index`

---

## Task 1：校准文档与测试分类

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `DEVELOPMENT.md`
- Create: `tests/README.md`

- [ ] **Step 1：修正文档中的旧结构描述**

将 README/DEVELOPMENT 中旧的 `src/` 单包结构说明替换为当前 monorepo 结构：

```text
packages/core/src/      纯 Thrift 解析、格式化、诊断、缓存与工具
packages/vscode/src/    VS Code extension 入口、provider、command、配置桥接
packages/cli/src/       CLI 参数解析、配置读取、format/lint/symbols 命令
syntaxes/               TextMate grammar
tests/src/              规范 Mocha 测试
tests/cli/              CLI 集成与单元测试
tests/perf/             性能基准测试
tests/debug/            手动复现与调试脚本
```

- [ ] **Step 2：修正不存在的命令引用**

在 `DEVELOPMENT.md` 中删除或替换这些不存在脚本：

```text
npm run test:all
npm run test:const
```

替换为当前可用命令：

```bash
npm test -- --exit
npm run test:single
npm run coverage
npm run coverage:cli
npm run perf:benchmark
```

- [ ] **Step 3：新增测试分类文档**

创建 `tests/README.md`，内容必须覆盖：

```markdown
# Test Layout

## Canonical Mocha Suite

`tests/src/**/*.js` is the canonical extension/core test suite loaded by `.mocharc.json`.

## CLI Tests

`tests/cli/**/*.js` covers the CLI package and should be run through `npm run coverage:cli` when CLI behavior changes.

## Performance Tests

`tests/perf/**` contains benchmark scripts. Run `npm run perf:benchmark` after parser, formatter, diagnostics, cache, or workspace indexing changes.

## Debug And Manual Repro Scripts

`tests/debug/**` and root-level historical `tests/test-*.js` files are not part of the default Mocha contract unless explicitly wired into `.mocharc.json`.
When promoting a manual repro into a regression test, move it under `tests/src/**` and make it use top-level `require` statements.
```

- [ ] **Step 4：验证文档引用**

运行：

```bash
rg -n "npm run test:all|npm run test:const|`src/`|path=\"src/" README.md README.en.md DEVELOPMENT.md tests/README.md
```

预期：

```text
无旧命令引用；README/DEVELOPMENT 不再把 `src/` 描述为当前主项目结构。
```

- [ ] **Step 5：运行格式和基础验证**

运行：

```bash
npm run lint:fix
npm run lint
npm run build
```

预期：

```text
lint 通过，build 通过。
```

- [ ] **Step 6：提交**

```bash
git add README.md README.en.md DEVELOPMENT.md tests/README.md
git commit -m "docs: align monorepo docs and test taxonomy"
```

---

## Task 2：稳定测试模块解析

**Files:**
- Modify: `tests/require-hook.js`
- Create: `tests/src/utils/test-module-resolution.js`

- [ ] **Step 1：写失败测试**

创建 `tests/src/utils/test-module-resolution.js`，验证 core 与 vscode 编译产物能通过当前测试 require 风格稳定加载：

```javascript
const assert = require('assert');

describe('test module resolution', function () {
    it('loads representative core modules through out path remapping', function () {
        const core = require('../../../out/ast/parser');
        const cache = require('../../../out/utils/cache-manager');

        assert.strictEqual(typeof core.ThriftParser, 'function');
        assert.strictEqual(typeof cache.CacheManager, 'function');
    });

    it('loads representative vscode modules through root out path', function () {
        const definition = require('../../../out/definition-provider');
        const workspaceSymbols = require('../../../out/workspace-symbol-provider');

        assert.strictEqual(typeof definition.ThriftDefinitionProvider, 'function');
        assert.strictEqual(typeof workspaceSymbols.ThriftWorkspaceSymbolProvider, 'function');
    });

    it('does not load duplicate cache-manager modules through package and remapped paths', function () {
        const remapped = require('../../../out/utils/cache-manager');
        const fromPackage = require('@tanzz/thrift-core');

        assert.strictEqual(remapped.CacheManager, fromPackage.CacheManager);
    });
});
```

- [ ] **Step 2：运行测试确认当前行为**

运行：

```bash
npm run build
npx mocha --config .mocharc.single.json tests/src/utils/test-module-resolution.js
```

预期：

```text
如果当前 require-hook 仍导致重复模块加载，此测试失败；如果已经等价，则作为回归测试保留。
```

- [ ] **Step 3：重构 require-hook resolver**

在 `tests/require-hook.js` 中保留 `vscode` mock，但将 `CORE_PATH_PREFIXES` 改为基于文件存在性的解析顺序：

```javascript
function resolveCompiledOutPath(relativePath) {
    const coreCandidate = path.join(coreOutRoot, relativePath);
    const vscodeCandidate = path.join(vsceOutRoot, relativePath);

    try {
        return originalResolveFilename.call(module, coreCandidate);
    } catch {
        return originalResolveFilename.call(module, vscodeCandidate);
    }
}
```

实际实现时不要使用 `module` 全局作为 receiver；应在 `Module._resolveFilename` 回调中用当前 `this` 调用 `originalResolveFilename.call(this, candidate, parent, isMain, options)`。同时保持 `.js` 后缀兼容。

- [ ] **Step 4：保留现有 mock 行为**

确认这些行为不变：

```text
require('vscode') 返回 tests/mock_vscode.js
global.vscode 指向同一个 mock
global.Module 和 global.originalRequire 仍提供给旧脚本
./mock-vscode、./mock_vscode 仍映射到 tests/mock_vscode.js
```

- [ ] **Step 5：运行单测与全量测试**

运行：

```bash
npx mocha --config .mocharc.single.json tests/src/utils/test-module-resolution.js
npm test -- --exit
```

预期：

```text
新增测试通过，全量测试通过。
```

- [ ] **Step 6：提交**

```bash
git add tests/require-hook.js tests/src/utils/test-module-resolution.js
git commit -m "test: stabilize compiled module resolution"
```

---

## Task 3：设计并引入最小 WorkspaceIndex

**Files:**
- Create: `packages/vscode/src/indexing/workspace-index.ts`
- Create: `packages/vscode/src/indexing/symbol-index.ts`
- Create: `tests/src/indexing/test-workspace-index.js`
- Modify: `packages/vscode/src/utils/dependencies.ts`

- [ ] **Step 1：写最小行为测试**

创建 `tests/src/indexing/test-workspace-index.js`，覆盖：

```javascript
const assert = require('assert');
const vscode = require('../../mock_vscode');

describe('WorkspaceIndex', function () {
    it('indexes top-level thrift symbols from workspace files', async function () {
        const {WorkspaceIndex} = require('../../../out/indexing/workspace-index');

        const files = new Map([
            ['/workspace/base.thrift', 'namespace js base\nstruct User { 1: string name }\n'],
            ['/workspace/service.thrift', 'include "base.thrift"\nservice UserService { void ping() }\n']
        ]);

        const index = new WorkspaceIndex({
            findFiles: async () => Array.from(files.keys()).map(file => vscode.Uri.file(file)),
            readFile: async uri => files.get(uri.fsPath) || '',
            createWatcher: () => ({dispose() {}})
        });

        await index.refresh();

        const user = index.findSymbolsByName('User');
        const service = index.findSymbolsByName('UserService');

        assert.strictEqual(user.length, 1);
        assert.strictEqual(service.length, 1);
        assert.strictEqual(user[0].name, 'User');
        assert.strictEqual(service[0].name, 'UserService');
    });
});
```

- [ ] **Step 2：定义 symbol 数据结构**

在 `packages/vscode/src/indexing/symbol-index.ts` 中定义：

```typescript
import * as vscode from 'vscode';
import {nodes} from '@tanzz/thrift-core';

export interface IndexedThriftSymbol {
    name: string;
    kind: nodes.ThriftNodeType;
    uri: vscode.Uri;
    range: vscode.Range;
    nameRange: vscode.Range;
    namespace?: string;
}

export class SymbolIndex {
    private readonly byName = new Map<string, IndexedThriftSymbol[]>();

    public clear(): void {
        this.byName.clear();
    }

    public add(symbol: IndexedThriftSymbol): void {
        const symbols = this.byName.get(symbol.name) ?? [];
        symbols.push(symbol);
        this.byName.set(symbol.name, symbols);
    }

    public findByName(name: string): IndexedThriftSymbol[] {
        return [...(this.byName.get(name) ?? [])];
    }
}
```

- [ ] **Step 3：实现 WorkspaceIndex 最小版本**

在 `packages/vscode/src/indexing/workspace-index.ts` 中实现：

```typescript
import * as vscode from 'vscode';
import {ThriftParser, collectTopLevelTypes, nodes} from '@tanzz/thrift-core';
import {createRange} from '../utils/vscode-utils';
import {SymbolIndex, IndexedThriftSymbol} from './symbol-index';

export interface WorkspaceIndexDeps {
    findFiles?: () => Thenable<vscode.Uri[]> | Promise<vscode.Uri[]>;
    readFile?: (uri: vscode.Uri) => Thenable<string> | Promise<string>;
    createWatcher?: () => vscode.Disposable;
}

export class WorkspaceIndex implements vscode.Disposable {
    private readonly symbols = new SymbolIndex();
    private readonly disposables: vscode.Disposable[] = [];

    constructor(private readonly deps: WorkspaceIndexDeps = {}) {
        if (deps.createWatcher) {
            this.disposables.push(deps.createWatcher());
        }
    }

    public async refresh(): Promise<void> {
        this.symbols.clear();
        const files = await this.findFiles();
        for (const uri of files) {
            const text = await this.readFile(uri);
            const ast = ThriftParser.parseContentWithCache(uri.toString(), text);
            for (const node of collectTopLevelTypes(ast)) {
                if (!node.name) {
                    continue;
                }
                this.symbols.add(this.toIndexedSymbol(uri, node));
            }
        }
    }

    public findSymbolsByName(name: string): IndexedThriftSymbol[] {
        return this.symbols.findByName(name);
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
        this.symbols.clear();
    }

    private async findFiles(): Promise<vscode.Uri[]> {
        if (this.deps.findFiles) {
            return this.deps.findFiles();
        }
        return vscode.workspace.findFiles('**/*.thrift', '**/node_modules/**');
    }

    private async readFile(uri: vscode.Uri): Promise<string> {
        if (this.deps.readFile) {
            return this.deps.readFile(uri);
        }
        const content = await vscode.workspace.fs.readFile(uri);
        return new TextDecoder('utf-8').decode(content);
    }

    private toIndexedSymbol(uri: vscode.Uri, node: nodes.ThriftNode): IndexedThriftSymbol {
        return {
            name: node.name ?? '',
            kind: node.type,
            uri,
            range: createRange(node.range),
            nameRange: createRange(node.nameRange ?? node.range)
        };
    }
}
```

如果当前 `createRange` 签名不匹配，应使用项目已有 `createLocation` / `vscode-utils` 中等价 range 转换工具，不新增重复转换逻辑。

- [ ] **Step 4：接入 dependency**

在 `packages/vscode/src/utils/dependencies.ts` 中添加可选依赖：

```typescript
import {WorkspaceIndex} from '../indexing/workspace-index';

export interface CoreDependencies {
    // existing fields remain unchanged
    workspaceIndex?: WorkspaceIndex;
}
```

如果 `CoreDependencies` 当前是 type alias 或字段顺序不同，按现有风格追加字段，不重排无关字段。

- [ ] **Step 5：运行最小索引测试**

运行：

```bash
npm run build
npx mocha --config .mocharc.single.json tests/src/indexing/test-workspace-index.js
```

预期：

```text
WorkspaceIndex 测试通过。
```

- [ ] **Step 6：提交**

```bash
git add packages/vscode/src/indexing tests/src/indexing packages/vscode/src/utils/dependencies.ts
git commit -m "refactor: introduce thrift workspace index"
```

---

## Task 4：迁移第一个 provider 使用 WorkspaceIndex

**Files:**
- Modify: `packages/vscode/src/workspace-symbol-provider.ts`
- Modify: `tests/src/workspace-symbol-provider/**` 或新增 `tests/src/workspace-symbol-provider/test-workspace-index-integration.js`

- [ ] **Step 1：写 provider 集成测试**

新增测试，构造注入的 `WorkspaceIndex`，验证 `ThriftWorkspaceSymbolProvider` 读取 index 中的 symbols，而不是自己扫描文件。

测试断言：

```text
query 为空时返回全部 indexed symbols
query 为 User 时只返回名称或 container 匹配的 symbols
token cancelled 时返回空数组
```

- [ ] **Step 2：修改 provider constructor**

让 `ThriftWorkspaceSymbolProvider` 优先使用 `deps.workspaceIndex`：

```typescript
constructor(deps?: Partial<CoreDependencies>) {
    this.workspaceIndex = deps?.workspaceIndex;
    // 保留旧路径作为 fallback，确保渐进迁移不破坏现有行为。
}
```

- [ ] **Step 3：迁移读取逻辑**

当 `workspaceIndex` 存在时：

```typescript
const symbols = this.workspaceIndex.findSymbolsByName(query);
return symbols.map(symbol => new vscode.SymbolInformation(
    symbol.name,
    nodeTypeToSymbolKind(symbol.kind),
    '',
    createLocation(symbol.uri, symbol.nameRange)
));
```

如果 query 为空，当前最小 `WorkspaceIndex` 还需要增加 `getAllSymbols()` 方法。该方法应在 `SymbolIndex` 中返回所有 symbol 的浅拷贝数组。

- [ ] **Step 4：保留 fallback**

如果未注入 `workspaceIndex`，保留当前 `getThriftFiles()`、`getSymbolsForFile()`、cache 行为，以降低单 PR 风险。

- [ ] **Step 5：运行测试**

```bash
npm run lint:fix
npm test -- --exit
npm run perf:benchmark
```

预期：

```text
全量测试通过；性能基准无明显退化。
```

- [ ] **Step 6：提交**

```bash
git add packages/vscode/src/workspace-symbol-provider.ts tests/src/workspace-symbol-provider
git commit -m "refactor: use workspace index for workspace symbols"
```

---

## 确认点

请确认是否按这个第一批范围执行：

```text
执行范围：Roadmap Phase 0-2
本轮默认落地：Task 1-4
暂不实施：AST-based refactor、parser split、diagnostics registry、editor feature expansion、performance gates
```

确认后再开始修改业务代码。实施时每个 task 完成后都会运行对应验证命令，并按计划拆 commit。
