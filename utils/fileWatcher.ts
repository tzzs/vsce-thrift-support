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
            const existing = this.watchers.get(key)!;
            // 即便已有 watcher，也要为新的订阅者挂载回调，确保缓存清理不会漏掉
            existing.onDidCreate(onChange);
            existing.onDidChange(onChange);
            existing.onDidDelete(onChange);
            return existing;
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
