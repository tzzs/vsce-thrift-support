import * as vscode from 'vscode';
import {config} from '../config';

/**
 * Maintain a throttled workspace file list for Thrift references.
 */
export class ThriftFileList {
    private workspaceFileList: Set<string> = new Set();
    private lastFileListUpdate = 0;
    private readonly updateIntervalMs: number;

    constructor(updateIntervalMs: number = config.references.fileListUpdateIntervalMs) {
        this.updateIntervalMs = updateIntervalMs;
    }

    /**
     * Get workspace Thrift files with throttled refresh.
     * @returns List of Thrift file URIs.
     */
    public async getFiles(): Promise<vscode.Uri[]> {
        const now = Date.now();
        if ((now - this.lastFileListUpdate) > this.updateIntervalMs || this.workspaceFileList.size === 0) {
            const files = await vscode.workspace.findFiles(
                config.filePatterns.thrift,
                config.filePatterns.excludeNodeModules,
                config.search.workspaceFileLimit
            );
            this.workspaceFileList = new Set(files.map(f => f.fsPath));
            this.lastFileListUpdate = now;
            return files;
        }

        return Array.from(this.workspaceFileList, fsPath => vscode.Uri.file(fsPath));
    }

    /**
     * Reset cached file list state.
     */
    public clear(): void {
        this.workspaceFileList = new Set();
        this.lastFileListUpdate = 0;
    }

    /**
     * Track a new file in the cached list.
     * @param uri - Created file URI.
     */
    public handleFileCreated(uri: vscode.Uri): void {
        if (!uri?.fsPath) {
            return;
        }
        this.workspaceFileList.add(uri.fsPath);
        this.lastFileListUpdate = Date.now();
    }

    /**
     * Remove a deleted file from the cached list.
     * @param uri - Deleted file URI.
     */
    public handleFileDeleted(uri: vscode.Uri): void {
        if (!uri?.fsPath) {
            return;
        }
        this.workspaceFileList.delete(uri.fsPath);
        this.lastFileListUpdate = Date.now();
    }
}
