import * as vscode from 'vscode';

type WatchEventCallback = (uri: vscode.Uri) => void;

interface TestableFileSystemWatcher extends vscode.FileSystemWatcher {
    fireCreate(uri: vscode.Uri): void;
    fireChange(uri: vscode.Uri): void;
    fireDelete(uri: vscode.Uri): void;
}

class WatcherWrapper implements TestableFileSystemWatcher {
    private createCallbacks = new Set<WatchEventCallback>();
    private changeCallbacks = new Set<WatchEventCallback>();
    private deleteCallbacks = new Set<WatchEventCallback>();

    constructor(private readonly underlying: vscode.FileSystemWatcher) {}

    public onDidCreate(listener: WatchEventCallback): vscode.Disposable {
        this.createCallbacks.add(listener);
        const disposable = this.underlying.onDidCreate?.(listener) ?? { dispose: () => {} };
        return {
            dispose: () => {
                this.createCallbacks.delete(listener);
                disposable.dispose();
            }
        };
    }

    public onDidChange(listener: WatchEventCallback): vscode.Disposable {
        this.changeCallbacks.add(listener);
        const disposable = this.underlying.onDidChange?.(listener) ?? { dispose: () => {} };
        return {
            dispose: () => {
                this.changeCallbacks.delete(listener);
                disposable.dispose();
            }
        };
    }

    public onDidDelete(listener: WatchEventCallback): vscode.Disposable {
        this.deleteCallbacks.add(listener);
        const disposable = this.underlying.onDidDelete?.(listener) ?? { dispose: () => {} };
        return {
            dispose: () => {
                this.deleteCallbacks.delete(listener);
                disposable.dispose();
            }
        };
    }

    public fireCreate(uri: vscode.Uri): void {
        for (const callback of Array.from(this.createCallbacks)) {
            callback(uri);
        }
    }

    public fireChange(uri: vscode.Uri): void {
        for (const callback of Array.from(this.changeCallbacks)) {
            callback(uri);
        }
    }

    public fireDelete(uri: vscode.Uri): void {
        for (const callback of Array.from(this.deleteCallbacks)) {
            callback(uri);
        }
    }

    public dispose(): void {
        this.underlying.dispose();
        this.createCallbacks.clear();
        this.changeCallbacks.clear();
        this.deleteCallbacks.clear();
    }

    get ignoreCreateEvents(): boolean {
        return this.underlying.ignoreCreateEvents ?? false;
    }

    get ignoreChangeEvents(): boolean {
        return this.underlying.ignoreChangeEvents ?? false;
    }

    get ignoreDeleteEvents(): boolean {
        return this.underlying.ignoreDeleteEvents ?? false;
    }
}

/**
 * ThriftFileWatcher：统一管理文件监听器。
 */
export class ThriftFileWatcher {
    private static instance: ThriftFileWatcher;
    private watchers: Map<string, TestableFileSystemWatcher> = new Map();

    static getInstance(): ThriftFileWatcher {
        if (!this.instance) {
            this.instance = new ThriftFileWatcher();
        }
        return this.instance;
    }

    private getOrCreateWatcher(pattern: string): TestableFileSystemWatcher {
        const key = `thrift-${pattern}`;
        if (this.watchers.has(key)) {
            return this.watchers.get(key)!;
        }
        const underlying = vscode.workspace.createFileSystemWatcher(pattern);
        const wrapper = new WatcherWrapper(underlying);
        this.watchers.set(key, wrapper);
        return wrapper;
    }

    public createWatcher(pattern: string, onChange: () => void): vscode.FileSystemWatcher {
        const watcher = this.getOrCreateWatcher(pattern);
        watcher.onDidCreate(() => onChange());
        watcher.onDidChange(() => onChange());
        watcher.onDidDelete(() => onChange());
        return watcher;
    }

    public createWatcherWithEvents(
        pattern: string,
        handlers: {
            onCreate?: (uri: vscode.Uri) => void;
            onChange?: (uri: vscode.Uri) => void;
            onDelete?: (uri: vscode.Uri) => void;
        }
    ): vscode.FileSystemWatcher {
        const watcher = this.getOrCreateWatcher(pattern);
        if (handlers.onCreate) {
            watcher.onDidCreate(handlers.onCreate);
        }
        if (handlers.onChange) {
            watcher.onDidChange(handlers.onChange);
        }
        if (handlers.onDelete) {
            watcher.onDidDelete(handlers.onDelete);
        }
        return watcher;
    }

    public dispose(): void {
        this.watchers.forEach(watcher => watcher.dispose());
        this.watchers.clear();
    }
}
