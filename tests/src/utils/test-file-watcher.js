const assert = require('assert');
const vscode = require('vscode');

// We directly require the module to get the ThriftFileWatcher class.
// The singleton is stored on the static 'instance' property.
const fileWatcherModule = require('../../../out/utils/file-watcher.js');
const ThriftFileWatcher = fileWatcherModule.ThriftFileWatcher;

function resetSingleton() {
    ThriftFileWatcher.instance = undefined;
}

describe('file-watcher', () => {
    beforeEach(() => {
        // Reset singleton before each test for clean state
        const watcher = ThriftFileWatcher.getInstance();
        watcher.dispose();
        resetSingleton();
    });

    afterEach(() => {
        resetSingleton();
    });

    describe('ThriftFileWatcher singleton', () => {
        it('getInstance() should return same instance on multiple calls', () => {
            const instance1 = ThriftFileWatcher.getInstance();
            const instance2 = ThriftFileWatcher.getInstance();
            assert.strictEqual(instance1, instance2);
        });

        it('should create new instance after dispose and reset', () => {
            const instance1 = ThriftFileWatcher.getInstance();
            instance1.dispose();
            resetSingleton();

            const instance2 = ThriftFileWatcher.getInstance();
            assert.notStrictEqual(instance1, instance2);
        });
    });

    describe('createWatcher', () => {
        it('should return same wrapper for same pattern', () => {
            const watcher = ThriftFileWatcher.getInstance();
            const w1 = watcher.createWatcher('**/*.thrift', () => {});
            const w2 = watcher.createWatcher('**/*.thrift', () => {});
            assert.strictEqual(w1, w2);
        });

        it('should call onChange on fireCreate/fireChange/fireDelete', () => {
            const watcher = ThriftFileWatcher.getInstance();
            const events = [];
            const onChange = () => events.push('change');

            const w = watcher.createWatcher('**/*.watch1.thrift', onChange);
            const uri = vscode.Uri.file('/test/test.thrift');

            w.fireCreate(uri);
            w.fireChange(uri);
            w.fireDelete(uri);

            assert.deepStrictEqual(events, ['change', 'change', 'change']);
        });
    });

    describe('createWatcherWithEvents', () => {
        it('should only trigger onCreate handler', () => {
            const watcher = ThriftFileWatcher.getInstance();
            const createEvents = [];

            const w = watcher.createWatcherWithEvents('**/*.watch2.thrift', {
                onCreate: (uri) => createEvents.push(uri.toString())
            });
            const uri = vscode.Uri.file('/test/test.thrift');

            w.fireCreate(uri);
            w.fireChange(uri);
            w.fireDelete(uri);

            assert.strictEqual(createEvents.length, 1);
            assert.strictEqual(createEvents[0], 'file:///test/test.thrift');
        });

        it('should trigger each handler independently when all provided', () => {
            const watcher = ThriftFileWatcher.getInstance();
            const events = [];
            const w = watcher.createWatcherWithEvents('**/*.watch3.thrift', {
                onCreate: (uri) => events.push('create:' + uri.toString()),
                onChange: (uri) => events.push('change:' + uri.toString()),
                onDelete: (uri) => events.push('delete:' + uri.toString())
            });
            const uri = vscode.Uri.file('/test/test.thrift');

            w.fireCreate(uri);
            w.fireChange(uri);
            w.fireDelete(uri);

            assert.deepStrictEqual(events, [
                'create:file:///test/test.thrift',
                'change:file:///test/test.thrift',
                'delete:file:///test/test.thrift'
            ]);
        });

        it('should not throw when handlers are undefined', () => {
            const watcher = ThriftFileWatcher.getInstance();
            assert.doesNotThrow(() => {
                watcher.createWatcherWithEvents('**/*.watch4.thrift', {});
            });
        });
    });

    describe('WatcherWrapper dispose and callback management', () => {
        it('should not call callback after watcher dispose', () => {
            const watcher = ThriftFileWatcher.getInstance();
            let callCount = 0;
            const w = watcher.createWatcher('**/*.watch5.thrift', () => { callCount++; });

            w.dispose();

            const uri = vscode.Uri.file('/test/test.thrift');
            w.fireCreate(uri);
            w.fireChange(uri);
            w.fireDelete(uri);

            assert.strictEqual(callCount, 0);
        });

        it('should allow individual callback unregistration via disposable', () => {
            const watcher = ThriftFileWatcher.getInstance();
            let callCount = 0;
            const w = watcher.createWatcher('**/*.watch6.thrift', () => { callCount++; });

            // Add a separate listener and dispose it
            const separateCalls = [];
            const disposable = w.onDidCreate((uri) => separateCalls.push(uri.toString()));
            disposable.dispose();

            const uri = vscode.Uri.file('/test/test.thrift');
            w.fireCreate(uri);

            // Separate listener was disposed, should not have been called
            assert.strictEqual(separateCalls.length, 0);
            // Original createWatcher callback should still fire
            assert.strictEqual(callCount, 1);
        });
    });

    describe('fireCreate/Change/Delete', () => {
        it('should pass correct Uri to callback', () => {
            const watcher = ThriftFileWatcher.getInstance();
            let receivedUri = null;

            const w = watcher.createWatcherWithEvents('**/*.watch7.thrift', {
                onCreate: (uri) => { receivedUri = uri; }
            });

            const testUri = vscode.Uri.file('/test/specific.thrift');
            w.fireCreate(testUri);

            assert.strictEqual(receivedUri, testUri);
            assert.strictEqual(receivedUri.toString(), 'file:///test/specific.thrift');
        });

        it('should call multiple registered callbacks for same event', () => {
            const watcher = ThriftFileWatcher.getInstance();
            const calls = [];
            const w = watcher.createWatcherWithEvents('**/*.watch8.thrift', {
                onCreate: () => calls.push('a'),
            });
            w.onDidCreate(() => calls.push('b'));
            w.onDidCreate(() => calls.push('c'));

            w.fireCreate(vscode.Uri.file('/test/test.thrift'));

            assert.deepStrictEqual(calls, ['a', 'b', 'c']);
        });
    });
});
