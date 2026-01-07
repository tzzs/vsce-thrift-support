import * as vscode from 'vscode';
import { clearIncludeCacheForDocument } from './include-resolver';
import { logDiagnostics } from './logger';
import * as path from 'path';

/**
 * Manages file dependencies for diagnostics analysis.
 * Tracks structural dependencies (includes) and reverse dependencies (dependent files).
 */
export class DependencyManager {
    /** 文件依赖跟踪：被 include 的文件 -> 依赖它的文件集合 */
    private fileDependencies = new Map<string, Set<string>>();

    /** 反向依赖跟踪：文件 -> 它 include 的文件集合 */
    private fileIncludes = new Map<string, Set<string>>();

    /**
     * 记录 include 依赖关系。
     * @param doc 当前文档
     * @param includedFiles include 文件列表
     */
    public trackFileDependencies(doc: vscode.TextDocument, includedFiles: vscode.Uri[]) {
        const docKey = this.getDocumentKey(doc);

        const oldIncludes = this.fileIncludes.get(docKey);
        if (oldIncludes) {
            for (const includedKey of oldIncludes) {
                const dependents = this.fileDependencies.get(includedKey);
                if (dependents) {
                    dependents.delete(docKey);
                    if (dependents.size === 0) {
                        this.fileDependencies.delete(includedKey);
                    }
                }
            }
        }

        const newIncludes = new Set<string>();
        for (const includedFile of includedFiles) {
            const includedKey = includedFile.toString();
            newIncludes.add(includedKey);

            if (!this.fileDependencies.has(includedKey)) {
                this.fileDependencies.set(includedKey, new Set<string>());
            }
            this.fileDependencies.get(includedKey)!.add(docKey);
        }

        this.fileIncludes.set(docKey, newIncludes);
    }

    /**
     * 获取依赖当前文件的其他文件。
     * @param fileKey 当前文件 key
     * @returns 依赖文件列表
     */
    public getDependentFiles(fileKey: string): string[] {
        const dependents = this.fileDependencies.get(fileKey);
        return dependents ? Array.from(dependents) : [];
    }

    /**
     * 清理文档依赖关系。
     * @param doc 当前文档
     */
    public clearDocument(doc: vscode.TextDocument) {
        const key = this.getDocumentKey(doc);
        const oldIncludes = this.fileIncludes.get(key);
        if (oldIncludes) {
            for (const includedKey of oldIncludes) {
                const dependents = this.fileDependencies.get(includedKey);
                if (dependents) {
                    dependents.delete(key);
                    if (dependents.size === 0) {
                        this.fileDependencies.delete(includedKey);
                    }
                }
            }
        }
        this.fileIncludes.delete(key);

        const docUri = doc.uri.toString();
        if (clearIncludeCacheForDocument(docUri)) {
            logDiagnostics(`[Diagnostics] Cleared include cache for: ${path.basename(doc.uri.fsPath)}`);
        }
    }

    /**
     * 释放所有资源。
     */
    public dispose() {
        this.fileDependencies.clear();
        this.fileIncludes.clear();
    }

    // Testing helpers
    public getFileDependenciesForTesting(): Map<string, Set<string>> {
        return this.fileDependencies;
    }

    public getFileIncludesForTesting(): Map<string, Set<string>> {
        return this.fileIncludes;
    }

    private getDocumentKey(doc: vscode.TextDocument): string {
        return doc.uri.toString();
    }
}
