const assert = require('assert');
const vscode = require('vscode');

require('../../../require-hook.js');


describe('definition-lookup', () => {
    it('should pass all test assertions', async () => {
        delete require.cache[require.resolve('../../../../out/definition/lookup.js')];

        const {CacheManager} = require('../../../../out/utils/cache-manager.js');
        const {DefinitionLookup} = require('../../../../out/definition/lookup.js');

        function createDocument(text, fileName) {
            const uri = vscode.Uri.file(`/tmp/${fileName}`);
            const doc = vscode.createTextDocument(text, uri);
            doc.languageId = 'thrift';
            doc.uri = uri;
            doc.lineCount = text.split('\n').length;
            return doc;
        }

        async function run() {

            const cacheManager = new CacheManager();
            cacheManager.registerCache('document', {maxSize: 10, ttl: 10000});
            cacheManager.registerCache('workspace', {maxSize: 10, ttl: 10000});

            const lookup = new DefinitionLookup(cacheManager);
            const text = ['struct Person {', '  1: i32 id', '}'].join('\n');
            const doc = createDocument(text, 'person.thrift');

            const location = await lookup.findDefinitionInDocument(doc.uri, text, 'Person');
            assert.ok(location, 'Should find struct definition');
            assert.strictEqual(location.range.start.line, 0);

            const cachedLocation = await lookup.findDefinitionInDocument(doc.uri, text, 'Person');
            assert.ok(cachedLocation, 'Cached lookup should succeed');
            assert.strictEqual(cachedLocation?.range.start.line, 0);

            // Workspace lookup should use cached document and match open buffer
            vscode.workspace.textDocuments.push(doc);
            vscode.workspace.findFiles = async () => [doc.uri];
            const workspaceDefs = await lookup.findDefinitionInWorkspace('Person');
            assert.strictEqual(workspaceDefs.length, 1);

        }

        await run();
    });
});
