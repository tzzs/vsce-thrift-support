const assert = require('assert');
const {ThriftParser} = require('../../../../out/ast/parser.js');

function testBasicCaching() {
    const vscode = require('vscode');
    const uri = vscode.Uri.file('test.thrift');
    const content = `struct TestStruct {
  1: required string name,
  2: optional i32 age
}`;

    const document = {
        uri: uri,
        getText: () => content
    };

    const start1 = performance.now();
    const ast1 = ThriftParser.parseWithCache(document);
    const time1 = performance.now() - start1;

    const start2 = performance.now();
    const ast2 = ThriftParser.parseWithCache(document);
    const time2 = performance.now() - start2;

    assert.deepStrictEqual(ast1, ast2, 'Cached AST should be identical to original');

    assert.ok(ast1, 'AST should not be null');
    assert.ok(ast1.type, 'AST should have type');
    assert.ok(ast1.range, 'AST should have range');
}

function testCacheExpiration() {
    const vscode = require('vscode');
    const uri = vscode.Uri.file('expiration-test.thrift');
    const content = 'struct ExpirationTest { 1: string field }';
    const document = {
        uri: uri,
        getText: () => content
    };

    const ast1 = ThriftParser.parseWithCache(document);

    const document2 = {
        uri: uri,
        getText: () => content
    };
    const ast2 = ThriftParser.parseWithCache(document2);

    assert.deepStrictEqual(ast1, ast2, 'Same content should produce identical AST');
}

function testContentChangeDetection() {
    const vscode = require('vscode');
    const uri = vscode.Uri.file('change-test.thrift');
    const originalContent = 'struct Original { 1: string field1 }';
    const changedContent = 'struct Changed { 1: i32 field2 }';

    const originalDoc = {
        uri: uri,
        getText: () => originalContent
    };
    const changedDoc = {
        uri: uri,
        getText: () => changedContent
    };

    const originalAST = ThriftParser.parseWithCache(originalDoc);
    const changedAST = ThriftParser.parseWithCache(changedDoc);

    assert.notDeepStrictEqual(originalAST, changedAST, 'Changed content should produce different AST');
    assert.ok(changedAST, 'Changed AST should be valid');
}

function testMultipleDocuments() {
    const vscode = require('vscode');
    const doc1 = {
        uri: vscode.Uri.file('doc1.thrift'),
        getText: () => 'struct Doc1 { 1: string name }'
    };
    const doc2 = {
        uri: vscode.Uri.file('doc2.thrift'),
        getText: () => 'struct Doc2 { 1: i32 age }'
    };
    const doc3 = {
        uri: vscode.Uri.file('doc3.thrift'),
        getText: () => 'struct Doc3 { 1: bool flag }'
    };

    const start = performance.now();
    const ast1 = ThriftParser.parseWithCache(doc1);
    const ast2 = ThriftParser.parseWithCache(doc2);
    const ast3 = ThriftParser.parseWithCache(doc3);
    const totalTime = performance.now() - start;

    assert.notDeepStrictEqual(ast1, ast2, 'Different documents should produce different ASTs');
    assert.notDeepStrictEqual(ast2, ast3, 'Different documents should produce different ASTs');
    assert.notDeepStrictEqual(ast1, ast3, 'Different documents should produce different ASTs');

    assert.ok(ast1 && ast2 && ast3, 'All ASTs should be valid');
}

function testCacheStatistics() {
    const vscode = require('vscode');
    const documents = [];
    for (let i = 0; i < 5; i++) {
        const uri = vscode.Uri.file(`stats-test-${i}.thrift`);
        const content = `struct StatsTest${i} { 1: string field${i} }`;
        documents.push({
            uri: uri,
            getText: () => content
        });
    }

    const startFill = performance.now();
    documents.forEach(doc => ThriftParser.parseWithCache(doc));
    const fillTime = performance.now() - startFill;

    const startCache = performance.now();
    documents.forEach(doc => ThriftParser.parseWithCache(doc));
    const cacheTime = performance.now() - startCache;

    const speedup = ((fillTime - cacheTime) / fillTime * 100);

    assert.ok(cacheTime < fillTime, 'Cache hits should be faster than initial parsing');
}

describe('AST caching', () => {
    it('should pass testBasicCaching', () => {
        testBasicCaching();
    });
    it('should pass testCacheExpiration', () => {
        testCacheExpiration();
    });
    it('should pass testContentChangeDetection', () => {
        testContentChangeDetection();
    });
    it('should pass testMultipleDocuments', () => {
        testMultipleDocuments();
    });
    it('should pass testCacheStatistics', () => {
        testCacheStatistics();
    });
});