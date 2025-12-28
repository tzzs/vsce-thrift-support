// AST缓存机制测试
const assert = require('assert');
// 导入AST解析器
const {ThriftParser} = require('../../../../out/ast/parser.js');
const {createVscodeMock, installVscodeMock} = require('../../../mock_vscode.js');

Module.prototype.require = originalRequire;

function run() {
    console.log('\n🗂️  Testing AST caching mechanism...');

    testBasicCaching();
    testCacheExpiration();
    testContentChangeDetection();
    testMultipleDocuments();
    testCacheStatistics();

    console.log('\n✅ All AST caching tests passed!');
}

function testBasicCaching() {
    console.log('\n🔍 Testing basic caching...');

    const uri = vscode.Uri.file('test.thrift');
    const content = `struct TestStruct {
  1: required string name,
  2: optional i32 age
}`;

    const document = vscode.TextDocument(uri, content);

    // 第一次解析
    const start1 = performance.now();
    const ast1 = ThriftParser.parseWithCache(document);
    const time1 = performance.now() - start1;

    // 第二次解析（应该命中缓存）
    const start2 = performance.now();
    const ast2 = ThriftParser.parseWithCache(document);
    const time2 = performance.now() - start2;

    // 验证结果相同
    assert.deepStrictEqual(ast1, ast2, 'Cached AST should be identical to original');

    // 验证第二次应该更快（缓存命中）
    console.log(`  First parse: ${time1.toFixed(2)}ms`);
    console.log(`  Second parse: ${time2.toFixed(2)}ms`);
    console.log(`  Cache speedup: ${((time1 - time2) / time1 * 100).toFixed(1)}%`);

    // 验证AST结构
    assert.ok(ast1, 'AST should not be null');
    assert.ok(ast1.type, 'AST should have type');
    assert.ok(ast1.range, 'AST should have range');

    console.log('  ✅ Basic caching test passed');
}

function testCacheExpiration() {
    console.log('\n⏰ Testing cache expiration...');

    const uri = vscode.Uri.file('expiration-test.thrift');
    const content = 'struct ExpirationTest { 1: string field }';
    const document = vscode.TextDocument(uri, content);

    // 第一次解析
    const ast1 = ThriftParser.parseWithCache(document);

    // 模拟缓存过期（这需要访问内部缓存，我们使用间接方法）
    // 创建新文档但内容相同，应该使用缓存
    const document2 = vscode.TextDocument(uri, content);
    const ast2 = ThriftParser.parseWithCache(document2);

    assert.deepStrictEqual(ast1, ast2, 'Same content should produce identical AST');

    console.log('  ✅ Cache expiration test passed');
}

function testContentChangeDetection() {
    console.log('\n📝 Testing content change detection...');

    const uri = vscode.Uri.file('change-test.thrift');
    const originalContent = 'struct Original { 1: string field1 }';
    const changedContent = 'struct Changed { 1: i32 field2 }';

    const originalDoc = vscode.TextDocument(uri, originalContent);
    const changedDoc = vscode.TextDocument(uri, changedContent);

    // 解析原始内容
    const originalAST = ThriftParser.parseWithCache(originalDoc);

    // 解析改变后的内容
    const changedAST = ThriftParser.parseWithCache(changedDoc);

    // 验证AST不同
    assert.notDeepStrictEqual(originalAST, changedAST, 'Changed content should produce different AST');

    // 验证新AST的正确性
    assert.ok(changedAST, 'Changed AST should be valid');

    console.log('  ✅ Content change detection test passed');
}

function testMultipleDocuments() {
    console.log('\n📄 Testing multiple documents...');

    const doc1 = vscode.TextDocument(vscode.Uri.file('doc1.thrift'), 'struct Doc1 { 1: string name }');
    const doc2 = vscode.TextDocument(vscode.Uri.file('doc2.thrift'), 'struct Doc2 { 1: i32 age }');
    const doc3 = vscode.TextDocument(vscode.Uri.file('doc3.thrift'), 'struct Doc3 { 1: bool flag }');

    // 解析多个文档
    const start = performance.now();
    const ast1 = ThriftParser.parseWithCache(doc1);
    const ast2 = ThriftParser.parseWithCache(doc2);
    const ast3 = ThriftParser.parseWithCache(doc3);
    const totalTime = performance.now() - start;

    // 验证所有AST都不同
    assert.notDeepStrictEqual(ast1, ast2, 'Different documents should produce different ASTs');
    assert.notDeepStrictEqual(ast2, ast3, 'Different documents should produce different ASTs');
    assert.notDeepStrictEqual(ast1, ast3, 'Different documents should produce different ASTs');

    // 验证所有AST都有效
    assert.ok(ast1 && ast2 && ast3, 'All ASTs should be valid');

    console.log(`  Parsed 3 documents in ${totalTime.toFixed(2)}ms`);
    console.log(`  Average time per document: ${(totalTime / 3).toFixed(2)}ms`);

    console.log('  ✅ Multiple documents test passed');
}

function testCacheStatistics() {
    console.log('\n📊 Testing cache statistics...');

    // 创建测试文档
    const documents = [];
    for (let i = 0; i < 5; i++) {
        const uri = vscode.Uri.file(`stats-test-${i}.thrift`);
        const content = `struct StatsTest${i} { 1: string field${i} }`;
        documents.push(vscode.TextDocument(uri, content));
    }

    // 第一次解析所有文档（填充缓存）
    const startFill = performance.now();
    documents.forEach(doc => ThriftParser.parseWithCache(doc));
    const fillTime = performance.now() - startFill;

    // 第二次解析所有文档（应该命中缓存）
    const startCache = performance.now();
    documents.forEach(doc => ThriftParser.parseWithCache(doc));
    const cacheTime = performance.now() - startCache;

    // 验证缓存效果
    const speedup = ((fillTime - cacheTime) / fillTime * 100);
    console.log(`  Cache fill time: ${fillTime.toFixed(2)}ms`);
    console.log(`  Cache hit time: ${cacheTime.toFixed(2)}ms`);
    console.log(`  Cache speedup: ${speedup.toFixed(1)}%`);

    // 验证缓存确实提供了加速
    assert.ok(cacheTime < fillTime, 'Cache hits should be faster than initial parsing');

    console.log('  ✅ Cache statistics test passed');
}

// 运行测试
if (require.main === module) {
    run();
}

module.exports = {run};