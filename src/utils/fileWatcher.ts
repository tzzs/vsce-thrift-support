import * as vscode from 'vscode';

/**
 * ThriftFileWatcher：统一管理文件监听器。
 */
export class ThriftFileWatcher {
    private static instance: ThriftFileWatcher;
    private watchers: Map<string, vscode.FileSystemWatcher> = new Map();

    /**
     * 获取单例实例。
     */
    static getInstance(): ThriftFileWatcher {
        if (!this.instance) {
            this.instance = new ThriftFileWatcher();
        }
        return this.instance;
    }

    /**
     * 创建或复用监听器，并挂载变化回调。
     */
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

    /**
     * 释放所有监听器。
     */
    dispose(): void {
        this.watchers.forEach(watcher => watcher.dispose());
        this.watchers.clear();
    }
}
