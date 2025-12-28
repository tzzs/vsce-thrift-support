// Cross-file dependencies unit tests (Node environment with vscode mock)
const assert = require('assert');
// Import the diagnostics module
const {DiagnosticManager} = require('../../../out/diagnostics.js');
const {createVscodeMock, installVscodeMock} = require('../../mock_vscode.js');
Module.prototype.require = originalRequire;

// Create test documents
function createMockDocument(uri, content, languageId = 'thrift') {
    const document = {
        uri: vscode.Uri.file(uri.replace('file://', '')),
        languageId,
        version: 1,
        getText: () => content,
        save: () => Promise.resolve()
    };
    vscode.workspace.textDocuments.push(document);
    return document;
}

function run() {
    console.log('\nRunning cross-file dependencies tests...');

    // Test 1: Track file dependencies when analyzing files with includes
    (function testFileDependencyTracking() {
        console.log('  Testing file dependency tracking...');

        const manager = new DiagnosticManager();

        // Create base file
        const baseContent = `
      struct BaseStruct {
        1: required i32 baseField
      }
    `;
        const baseDoc = createMockDocument('file://test-thrift/base.thrift', baseContent);

        // Create dependent file
        const dependentContent = `
      include "base.thrift"
      
      struct DependentStruct {
        1: required base.BaseStruct baseData
      }
    `;
        const dependentDoc = createMockDocument('file://test-thrift/dependent.thrift', dependentContent);

        // Track dependencies manually (simulate what performAnalysis does)
        const includedFiles = [vscode.Uri.file('e:/workspaces/trae/trae2/thrift-support2/test-thrift/base.thrift')];
        manager.trackFileDependencies(dependentDoc, includedFiles);

        // Verify dependencies are tracked
        const baseKey = includedFiles[0].toString(); // Use the same URI format as trackFileDependencies
        const dependentKey = dependentDoc.uri.toString();

        // Access internal state using testing methods
        const fileDependencies = manager.getFileDependenciesForTesting();
        const fileIncludes = manager.getFileIncludesForTesting();

        assert(fileDependencies.has(baseKey), 'Base file should have dependencies');
        assert(fileDependencies.get(baseKey).has(dependentKey), 'Dependent file should be tracked as dependency');
        assert(fileIncludes.has(dependentKey), 'Dependent file should have includes tracked');
        assert(fileIncludes.get(dependentKey).has(baseKey), 'Base file should be in includes');

        console.log('  ✓ File dependency tracking works');
    })();

    // Test 2: Get dependent files
    (function testGetDependentFiles() {
        console.log('  Testing get dependent files...');

        const manager = new DiagnosticManager();

        // Create files
        const baseDoc = createMockDocument('file://test-thrift/base.thrift', 'struct Base {}');
        const dependent1Doc = createMockDocument('file://test-thrift/dependent1.thrift', 'include "base.thrift"');
        const dependent2Doc = createMockDocument('file://test-thrift/dependent2.thrift', 'include "base.thrift"');

        // Track dependencies
        const baseUri = baseDoc.uri;
        const includedFiles = [baseUri];

        manager.trackFileDependencies(dependent1Doc, includedFiles);
        manager.trackFileDependencies(dependent2Doc, includedFiles);

        // Get dependent files
        const baseKey = baseDoc.uri.toString();
        const dependents = manager.getDependentFiles(baseKey);

        assert(dependents.length === 2, 'Should have 2 dependent files');
        assert(dependents.includes(dependent1Doc.uri.toString()), 'Should include dependent1');
        assert(dependents.includes(dependent2Doc.uri.toString()), 'Should include dependent2');

        console.log('  ✓ Get dependent files works');
    })();

    // Test 3: Clean up dependencies when file is closed
    (function testDependencyCleanup() {
        console.log('  Testing dependency cleanup...');

        const manager = new DiagnosticManager();

        // Create files
        const baseDoc = createMockDocument('file://test-thrift/base.thrift', 'struct Base {}');
        const dependentDoc = createMockDocument('file://test-thrift/dependent.thrift', 'include "base.thrift"');

        // Track dependencies
        const includedFiles = [baseDoc.uri];
        manager.trackFileDependencies(dependentDoc, includedFiles);

        // Clear dependent file
        manager.clearDocument(dependentDoc);

        // Dependencies should be cleaned up
        const baseKey = baseDoc.uri.toString();
        const dependentKey = dependentDoc.uri.toString();

        const fileDependencies = manager.fileDependencies;
        const fileIncludes = manager.fileIncludes;

        if (fileDependencies.has(baseKey)) {
            assert(!fileDependencies.get(baseKey).has(dependentKey), 'Dependent file should be removed from dependencies');
        }
        assert(!fileIncludes.has(dependentKey), 'Dependent file includes should be removed');

        console.log('  ✓ Dependency cleanup works');
    })();

    // Test 4: Handle multiple includes from same file
    (function testMultipleIncludes() {
        console.log('  Testing multiple includes from same file...');

        const manager = new DiagnosticManager();

        // Create complex file with multiple includes
        const complexContent = `
      include "base1.thrift"
      include "base2.thrift"
      include "base3.thrift"
      
      struct ComplexStruct {
        1: required base1.Struct1 field1
        2: required base2.Struct2 field2
        3: required base3.Struct3 field3
      }
    `;
        const complexDoc = createMockDocument('file://test-thrift/complex.thrift', complexContent);

        // Create base files
        const base1Doc = createMockDocument('file://test-thrift/base1.thrift', 'struct Struct1 {}');
        const base2Doc = createMockDocument('file://test-thrift/base2.thrift', 'struct Struct2 {}');
        const base3Doc = createMockDocument('file://test-thrift/base3.thrift', 'struct Struct3 {}');

        // Track multiple includes
        const includedFiles = [
            base1Doc.uri,
            base2Doc.uri,
            base3Doc.uri
        ];
        manager.trackFileDependencies(complexDoc, includedFiles);

        // Verify all includes are tracked
        const complexKey = complexDoc.uri.toString();
        const fileIncludes = manager.fileIncludes;

        assert(fileIncludes.has(complexKey), 'Complex file should track includes');
        const includes = fileIncludes.get(complexKey);
        assert(includes.size === 3, 'Should track all 3 includes');
        assert(includes.has(base1Doc.uri.toString()), 'Should include base1');
        assert(includes.has(base2Doc.uri.toString()), 'Should include base2');
        assert(includes.has(base3Doc.uri.toString()), 'Should include base3');

        console.log('  ✓ Multiple includes tracking works');
    })();

    console.log('All cross-file dependencies tests passed! ✓');
}

if (require.main === module) {
    run();
}

module.exports = {run};