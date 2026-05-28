const assert = require('assert');
const vscode = require('vscode');
const {ThriftParser} = require('../../out/ast/parser.js');
const nodes = require('../../out/ast/nodes.types.js');
const {getCachedAstRange, setCachedAstRange, clearAstRegionCacheForDocument} = require('../../out/ast/cache.js');
const {IncrementalTracker, ChangeType} = require('../../out/utils/incremental-tracker.js');

describe('Incremental Thrift Parser', () => {
    it('parses a specific range', () => {
        const thriftContent = `namespace cpp test

struct TestStruct {
  1: string name,
  2: i32 id
}

service TestService {
  TestStruct getTest(1: i32 id),
}`;

        const parser = new ThriftParser(thriftContent);
        const parsedNodes = parser.parseRange(2, 5);

        assert.ok(parsedNodes.length > 0);
        assert.ok(parsedNodes.some(node => node.type && String(node.type).toLowerCase().includes('struct')));
    });

    it('analyzes affected region for struct edits', () => {
        const thriftContent = `namespace cpp test

struct TestStruct {
  1: string name,
  2: i32 id
}

service TestService {
  TestStruct getTest(1: i32 id),
}`;

        const parser = new ThriftParser(thriftContent);
        const affectedRange = parser.analyzeAffectedRegion(4, 4);

        assert.ok(affectedRange.start <= 2);
        assert.ok(affectedRange.end >= 5);
    });

    it('analyzeAffectedRegion ignores braces inside string literals during upward scan', () => {
        // 关键场景：字符串字面量内的 `{` 不应被识别为结构性花括号。
        // 旧实现用 `text.trim().includes('{')` 检测，会把字符串内的 `{` 也算上，
        // 导致上行扫描在 line 1/2 提前停下，affectedStart 被错误设置到中间行。
        // Token-based 实现只在真正的 `{` symbol 处停下，正确扫描到 struct 开头 (line 0)。
        const thriftContent = [
            'struct Outer {',                                            // line 0
            '  1: string template = "prefix {literal} suffix",',         // line 1
            '  2: string config = "{ contains brace }",',                // line 2
            '  3: i32 id',                                               // line 3
            '}'                                                          // line 4
        ].join('\n');

        const parser = new ThriftParser(thriftContent);
        // 编辑在 line 2（含字面量花括号的字段）
        const affected = parser.analyzeAffectedRegion(2, 2);
        // 上行扫描应找到 struct Outer 的真实开头 (line 0)，而不是被字符串里的 `{` 误判。
        assert.strictEqual(affected.start, 0,
            `affectedStart should be the real 'struct {' line, got ${affected.start}`);
    });

    it('analyzeAffectedRegion brace depth tracking skips string-literal braces', () => {
        // 关键差异点：旧 `match(/}/g)` 把字符串内的 `}` 当作结构性闭合，
        // 让 braceDepth 提前归零，affectedEnd 在 line 2 就被锁定。
        // Token-based 实现忽略字符串内的 `}`，正确扫描到 line 4 真正的 struct 闭合。
        //
        // 注意：所有非闭合行的最后一个 meaningful token 都不是 `;` 或 `,`，
        // 避免被第二个 for 循环（终止符扫描）提前重置。
        const thriftContent = [
            'struct Box {',                                              // line 0
            '  1: string a',                                             // line 1 — 最后 token 是 'a'
            '  2: string b = "} close-in-literal"',                      // line 2 — 最后 token 是 string
            '  3: string c',                                             // line 3 — 最后 token 是 'c'
            '}'                                                          // line 4 — 真正的闭合
        ].join('\n');

        const parser = new ThriftParser(thriftContent);
        // 编辑在 line 0（struct 开头）
        const affected = parser.analyzeAffectedRegion(0, 0);
        // 旧实现会在 line 2 字符串内的 `}` 处误判 depth=0，end 锁在 2。
        // Token-based 实现应识别到 line 4 的真实闭合。
        assert.strictEqual(affected.start, 0);
        assert.strictEqual(affected.end, 4,
            `brace-depth scan should reach the real '}' at line 4 (string literal '}' must be ignored), got affectedEnd=${affected.end}`);
    });

    it('uses region-based cache', () => {
        const uri = 'test.thrift';
        const range = {startLine: 0, endLine: 5};
        const content = 'test content for range';

        clearAstRegionCacheForDocument(uri);

        const mockNodes = [
            {
                type: 'MockType',
                range: new vscode.Range(0, 0, 0, 10),
                body: [],
                parent: undefined
            }
        ];

        assert.strictEqual(getCachedAstRange(uri, range, content), null);
        setCachedAstRange(uri, range, content, mockNodes);

        const cachedAfter = getCachedAstRange(uri, range, content);
        assert.ok(cachedAfter !== null);
        assert.strictEqual(cachedAfter.length, 1);
    });

    it('tracks parsing changes with IncrementalTracker', () => {
        const document = {
            uri: {toString: () => 'test.thrift'},
            languageId: 'thrift'
        };

        const mockEvent = {
            document,
            contentChanges: [{
                range: new vscode.Range(3, 0, 3, 10),
                text: 'modified line'
            }]
        };

        const tracker = IncrementalTracker.getInstance();
        tracker.markChanges(mockEvent, ChangeType.PARSING);

        const parsingChanges = tracker.getRecentParsingChanges(document);
        assert.ok(Array.isArray(parsingChanges));

        tracker.clearChangeRecords(document);
    });

    it('runs incremental parsing workflow', () => {
        const thriftContent = `namespace cpp test

struct TestStruct {
  1: string name,
  2: i32 id
}

service TestService {
  TestStruct getTest(1: i32 id),
}`;

        const document = {
            getText: () => thriftContent,
            uri: {toString: () => 'test.thrift'},
            languageId: 'thrift',
            lineCount: thriftContent.split(/\r?\n/).length
        };

        const dirtyRange = {startLine: 2, endLine: 5};
        const result = ThriftParser.incrementalParseWithCache(document, dirtyRange);

        assert.ok(result !== null);
        assert.ok(Array.isArray(result.newNodes));
    });

    it('merges incremental results by overlap', () => {
        const parser = new ThriftParser('struct A {}\nstruct B {}');
        const fullAst = {
            type: nodes.ThriftNodeType.Document,
            range: new vscode.Range(0, 0, 1, 10),
            body: [
                {type: nodes.ThriftNodeType.Struct, name: 'OldA', range: new vscode.Range(0, 0, 0, 10)},
                {type: nodes.ThriftNodeType.Struct, name: 'B', range: new vscode.Range(1, 0, 1, 10)}
            ]
        };

        const incrementalResult = {
            ast: fullAst,
            affectedNodes: [fullAst.body[0]],
            newNodes: [{type: nodes.ThriftNodeType.Struct, name: 'NewA', range: new vscode.Range(0, 0, 0, 12)}]
        };

        const merged = parser.mergeIncrementalResults(fullAst, incrementalResult);
        const names = merged.body.map(node => node.name);

        assert.deepStrictEqual(names, ['NewA', 'B']);
    });

    it('reparents merged nodes to the updated AST', () => {
        const parser = new ThriftParser('struct A {}');
        const tempParent = {
            type: nodes.ThriftNodeType.Document,
            range: new vscode.Range(0, 0, 0, 0),
            body: []
        };
        const childNode = {
            type: nodes.ThriftNodeType.Struct,
            name: 'Child',
            range: new vscode.Range(0, 0, 0, 5),
            parent: tempParent
        };
        const newNode = {
            type: nodes.ThriftNodeType.Struct,
            name: 'NewA',
            range: new vscode.Range(0, 0, 0, 10),
            parent: tempParent,
            children: [childNode]
        };
        const fullAst = {
            type: nodes.ThriftNodeType.Document,
            range: new vscode.Range(0, 0, 0, 10),
            body: []
        };
        const incrementalResult = {
            ast: fullAst,
            affectedNodes: [],
            newNodes: [newNode]
        };

        const merged = parser.mergeIncrementalResults(fullAst, incrementalResult);

        assert.strictEqual(newNode.parent, merged);
        assert.strictEqual(childNode.parent, newNode);
    });

    it('reparents structural children even without children array', () => {
        const parser = new ThriftParser('struct A {}');
        const fieldNode = {
            type: nodes.ThriftNodeType.Field,
            name: 'field',
            range: new vscode.Range(0, 0, 0, 5),
            id: 1,
            fieldType: 'i32'
        };
        const newNode = {
            type: nodes.ThriftNodeType.Struct,
            name: 'NewA',
            range: new vscode.Range(0, 0, 0, 10),
            fields: [fieldNode]
        };
        const fullAst = {
            type: nodes.ThriftNodeType.Document,
            range: new vscode.Range(0, 0, 0, 10),
            body: []
        };
        const incrementalResult = {
            ast: fullAst,
            affectedNodes: [],
            newNodes: [newNode]
        };

        const merged = parser.mergeIncrementalResults(fullAst, incrementalResult);

        assert.strictEqual(newNode.parent, merged);
        assert.strictEqual(fieldNode.parent, newNode);
    });

    it('removes affected nodes by overlap instead of exact match', () => {
        const parser = new ThriftParser('struct A {}\nstruct B {}');
        const fullAst = {
            type: nodes.ThriftNodeType.Document,
            range: new vscode.Range(0, 0, 1, 10),
            body: [
                {type: nodes.ThriftNodeType.Struct, name: 'OldA', range: new vscode.Range(0, 0, 1, 5)},
                {type: nodes.ThriftNodeType.Struct, name: 'B', range: new vscode.Range(2, 0, 2, 10)}
            ]
        };
        const incrementalResult = {
            ast: fullAst,
            affectedNodes: [fullAst.body[0]],
            newNodes: [{type: nodes.ThriftNodeType.Struct, name: 'NewA', range: new vscode.Range(0, 0, 0, 10)}]
        };

        const merged = parser.mergeIncrementalResults(fullAst, incrementalResult);
        const names = merged.body.map(node => node.name);

        assert.deepStrictEqual(names, ['NewA', 'B']);
    });

    it('removes deleted node when newNodes is empty', () => {
        // P0-1 regression: mergeIncrementalResults used to return the original AST unchanged
        // when newNodes was empty, silently keeping the deleted node in the tree.
        // Now it must always apply the diff — even pure deletions (affectedNodes non-empty,
        // newNodes empty) must remove the affected node.
        const parser = new ThriftParser('struct A {}');
        const nodeA = {type: nodes.ThriftNodeType.Struct, name: 'A', range: new vscode.Range(0, 0, 0, 10)};
        const nodeB = {type: nodes.ThriftNodeType.Struct, name: 'B', range: new vscode.Range(1, 0, 1, 10)};
        const fullAst = {
            type: nodes.ThriftNodeType.Document,
            range: new vscode.Range(0, 0, 1, 10),
            body: [nodeA, nodeB]
        };
        // Simulates the case where struct A was deleted: parseRange returns [] for the affected range,
        // and affectedNodes contains the old nodeA.
        const incrementalResult = {
            ast: fullAst,
            affectedNodes: [nodeA],
            newNodes: []          // ← deletion produces an empty newNodes
        };

        const merged = parser.mergeIncrementalResults(fullAst, incrementalResult);
        const names = merged.body.map(node => node.name);

        assert.deepStrictEqual(names, ['B'],
            `deleted node 'A' must be removed from body; got ${JSON.stringify(names)}`);
    });

    it('saves and restores parse context', () => {
        const thriftContent = `namespace cpp test

struct TestStruct {
  1: string name,
  2: i32 id
}`;

        const parser = new ThriftParser(thriftContent);
        const savedContext = parser.saveParseContext();

        parser.currentLine = 5;
        parser.restoreParseContext(savedContext);

        assert.strictEqual(parser.currentLine, 0);
    });

    it('parses empty range gracefully', () => {
        const thriftContent = `namespace cpp test
// This is a comment`;

        const parser = new ThriftParser(thriftContent);
        const parsedNodes = parser.parseRange(1, 1);

        assert.ok(Array.isArray(parsedNodes));
    });

    it('parses range with invalid content', () => {
        const thriftContent = `namespace cpp test

invalid thrift content here
another invalid line`;

        const parser = new ThriftParser(thriftContent);
        const parsedNodes = parser.parseRange(2, 3);

        assert.ok(Array.isArray(parsedNodes));
    });

    it('clears internal AST cache on document clear', () => {
        const thriftContent = 'struct A {}';
        const document = {
            getText: () => thriftContent,
            uri: {toString: () => 'cache-clear.thrift'},
            languageId: 'thrift'
        };

        const ast = ThriftParser.parseWithCache(document);
        const marker = Symbol('stale');
        const markerMap = new WeakMap();
        markerMap.set(ast, marker);
        ThriftParser.clearDocumentCache('cache-clear.thrift');

        const result = ThriftParser.incrementalParseWithCache(document, {startLine: 0, endLine: 0});
        assert.ok(result !== null);
        assert.ok(!markerMap.has(result.ast));
    });
});
