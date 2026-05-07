const assert = require('assert');

function createDoc(uriStr) {
    return {
        uri: {
            toString: () => uriStr,
            fsPath: uriStr.replace('file://', '/')
        }
    };
}

function createUri(uriStr) {
    return {toString: () => uriStr};
}

describe('dependency-manager', () => {
    let DependencyManager;
    let includeResolver;
    let logger;

    let originalLoad;

    before(() => {
        // Stub external modules before importing the module under test
        const Module = require('module');
        originalLoad = Module._load;

        Module._load = function (request, parent, isMain) {
            if (request === 'vscode') {
                return originalLoad.call(this, request, parent, isMain);
            }
            if (request.includes('include-resolver')) {
                if (!includeResolver) {
                    includeResolver = {clearIncludeCacheForDocument: () => false};
                }
                return includeResolver;
            }
            if (request.includes('logger')) {
                if (!logger) {
                    logger = {logDiagnostics: () => {}};
                }
                return logger;
            }
            return originalLoad.call(this, request, parent, isMain);
        };

        // Clear previous cache to ensure fresh load with our stubs
        delete require.cache[require.resolve('../../../out/diagnostics/dependency-manager.js')];
        DependencyManager = require('../../../out/diagnostics/dependency-manager.js').DependencyManager;
    });

    after(() => {
        // Restore original module loading
        if (originalLoad) {
            require('module')._load = originalLoad;
        }
    });

    let manager;

    beforeEach(() => {
        // Reset stubs
        if (includeResolver) {
            includeResolver.clearIncludeCacheForDocument = () => false;
        }
        if (logger) {
            logger.logDiagnostics = () => {};
        }
        manager = new DependencyManager();
    });

    describe('trackFileDependencies', () => {
        it('should track first document and its includes correctly', () => {
            const doc = createDoc('file:///project/main.thrift');
            const included = [createUri('file:///project/shared.thrift')];

            manager.trackFileDependencies(doc, included);

            const deps = manager.getFileDependenciesForTesting();
            const includes = manager.getFileIncludesForTesting();

            // Reverse dep: shared.thrift -> [main.thrift]
            const sharedDependents = deps.get('file:///project/shared.thrift');
            assert.ok(sharedDependents);
            assert.strictEqual(sharedDependents.has('file:///project/main.thrift'), true);

            // Forward dep: main.thrift -> [shared.thrift]
            const mainIncludes = includes.get('file:///project/main.thrift');
            assert.ok(mainIncludes);
            assert.strictEqual(mainIncludes.has('file:///project/shared.thrift'), true);
        });

        it('should update dependencies when includes change', () => {
            const doc = createDoc('file:///project/main.thrift');
            const oldIncludes = [createUri('file:///project/shared.thrift')];
            const newIncludes = [createUri('file:///project/other.thrift')];

            // First track
            manager.trackFileDependencies(doc, oldIncludes);

            // Re-track with changed includes
            manager.trackFileDependencies(doc, newIncludes);

            const deps = manager.getFileDependenciesForTesting();
            const includes = manager.getFileIncludesForTesting();

            // Old reverse dep should be cleaned up
            const sharedDependents = deps.get('file:///project/shared.thrift');
            assert.strictEqual(sharedDependents, undefined);

            // New reverse dep should exist
            const otherDependents = deps.get('file:///project/other.thrift');
            assert.ok(otherDependents);
            assert.strictEqual(otherDependents.has('file:///project/main.thrift'), true);

            // Forward dep should be updated
            const mainIncludes = includes.get('file:///project/main.thrift');
            assert.ok(mainIncludes);
            assert.strictEqual(mainIncludes.has('file:///project/shared.thrift'), false);
            assert.strictEqual(mainIncludes.has('file:///project/other.thrift'), true);
        });

        it('should handle empty includes list', () => {
            const doc = createDoc('file:///project/main.thrift');
            const included = [];

            manager.trackFileDependencies(doc, included);

            const includes = manager.getFileIncludesForTesting();
            const mainIncludes = includes.get('file:///project/main.thrift');
            assert.ok(mainIncludes);
            assert.strictEqual(mainIncludes.size, 0);
        });

        it('should track multiple documents depending on same file', () => {
            const doc1 = createDoc('file:///project/a.thrift');
            const doc2 = createDoc('file:///project/b.thrift');
            const shared = [createUri('file:///project/shared.thrift')];

            manager.trackFileDependencies(doc1, shared);
            manager.trackFileDependencies(doc2, shared);

            const deps = manager.getFileDependenciesForTesting();
            const sharedDependents = deps.get('file:///project/shared.thrift');
            assert.ok(sharedDependents);
            assert.strictEqual(sharedDependents.size, 2);
            assert.strictEqual(sharedDependents.has('file:///project/a.thrift'), true);
            assert.strictEqual(sharedDependents.has('file:///project/b.thrift'), true);
        });
    });

    describe('getDependentFiles', () => {
        it('should return dependent files when they exist', () => {
            const doc = createDoc('file:///project/main.thrift');
            const included = [createUri('file:///project/shared.thrift')];
            manager.trackFileDependencies(doc, included);

            const dependents = manager.getDependentFiles('file:///project/shared.thrift');
            assert.deepStrictEqual(dependents, ['file:///project/main.thrift']);
        });

        it('should return empty array for file with no dependents', () => {
            const doc = createDoc('file:///project/main.thrift');
            const included = [createUri('file:///project/shared.thrift')];
            manager.trackFileDependencies(doc, included);

            const dependents = manager.getDependentFiles('file:///project/main.thrift');
            assert.deepStrictEqual(dependents, []);
        });

        it('should return empty array for never-tracked file', () => {
            const dependents = manager.getDependentFiles('file:///project/unknown.thrift');
            assert.deepStrictEqual(dependents, []);
        });
    });

    describe('clearDocument', () => {
        it('should remove all mappings for a document', () => {
            const doc = createDoc('file:///project/main.thrift');
            const included = [createUri('file:///project/shared.thrift')];
            manager.trackFileDependencies(doc, included);

            manager.clearDocument(doc);

            const deps = manager.getFileDependenciesForTesting();
            const includes = manager.getFileIncludesForTesting();

            assert.strictEqual(deps.get('file:///project/shared.thrift'), undefined);
            assert.strictEqual(includes.get('file:///project/main.thrift'), undefined);
        });

        it('should not affect other documents when clearing one', () => {
            const doc1 = createDoc('file:///project/a.thrift');
            const doc2 = createDoc('file:///project/b.thrift');
            const shared = [createUri('file:///project/shared.thrift')];

            manager.trackFileDependencies(doc1, shared);
            manager.trackFileDependencies(doc2, shared);

            manager.clearDocument(doc1);

            const deps = manager.getFileDependenciesForTesting();
            const sharedDependents = deps.get('file:///project/shared.thrift');
            assert.ok(sharedDependents);
            assert.strictEqual(sharedDependents.size, 1);
            assert.strictEqual(sharedDependents.has('file:///project/b.thrift'), true);
        });

        it('should call clearIncludeCacheForDocument on clear', () => {
            let cacheCleared = false;
            includeResolver.clearIncludeCacheForDocument = () => {
                cacheCleared = true;
                return true;
            };

            const doc = createDoc('file:///project/main.thrift');
            const included = [createUri('file:///project/shared.thrift')];
            manager.trackFileDependencies(doc, included);

            manager.clearDocument(doc);
            assert.strictEqual(cacheCleared, true);
        });
    });

    describe('dispose', () => {
        it('should clear all mappings', () => {
            const doc = createDoc('file:///project/main.thrift');
            const included = [createUri('file:///project/shared.thrift')];
            manager.trackFileDependencies(doc, included);

            manager.dispose();

            const deps = manager.getFileDependenciesForTesting();
            const includes = manager.getFileIncludesForTesting();
            assert.strictEqual(deps.size, 0);
            assert.strictEqual(includes.size, 0);
        });
    });

    describe('getFileDependenciesForTesting', () => {
        it('should return internal dependencies map', () => {
            const doc = createDoc('file:///project/main.thrift');
            const included = [createUri('file:///project/shared.thrift')];
            manager.trackFileDependencies(doc, included);

            const deps = manager.getFileDependenciesForTesting();
            assert.ok(deps instanceof Map);
            assert.strictEqual(deps.size, 1);
        });
    });
});
