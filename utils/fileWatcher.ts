import * as vscode from 'vscode';

export class ThriftFileWatcher {
    private static instance: ThriftFileWatcher;
    private watchers: Map<string, vscode.FileSystemWatcher> = new Map();

    static getInstance(): ThriftFileWatcher {
        if (!this.instance) {
            this.instance = new ThriftFileWatcher();
        }
        return this.instance;
    }

    createWatcher(pattern: string, onChange: () => void): vscode.FileSystemWatcher {
        const key = `thrift-${pattern}`;
        if (this.watchers.has(key)) {
            return this.watchers.get(key)!;
        }

        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        watcher.onDidCreate(onChange);
        watcher.onDidChange(onChange);
        watcher.onDidDelete(onChange);

        this.watchers.set(key, watcher);
        return watcher;
    }

    dispose(): void {
        this.watchers.forEach(watcher => watcher.dispose());
        this.watchers.clear();
    }
}