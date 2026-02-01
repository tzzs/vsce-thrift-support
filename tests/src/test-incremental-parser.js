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
