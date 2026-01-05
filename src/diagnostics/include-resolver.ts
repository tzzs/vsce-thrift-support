import * as path from 'path';
import * as vscode from 'vscode';
import * as nodes from '../ast/nodes.types';
import { ThriftParser } from '../ast/parser';
import { config } from '../config';
import { ErrorHandler } from '../utils/error-handler';

const includeTypesCache = new Map<string, Map<string, string>>();
const includeFileTimestamps = new Map<string, number>();
const includeFileStats = new Map<string, { mtime: number; size: number }>();
const INCLUDE_CACHE_MAX_AGE = config.cache.includeTypesMaxAgeMs;

export function collectTypesFromAst(ast: nodes.ThriftDocument): Map<string, string> {
    const typeKind = new Map<string, string>();
    for (const node of ast.body) {
        switch (node.type) {
            case nodes.ThriftNodeType.Typedef:
                if (node.name) {
                    typeKind.set(node.name, 'typedef');
                }
                break;
            case nodes.ThriftNodeType.Enum:
                if (node.name) {
                    typeKind.set(node.name, (node as nodes.Enum).isSenum ? 'senum' : 'enum');
                }
                break;
            case nodes.ThriftNodeType.Struct:
                if (node.name) {
                    typeKind.set(node.name, 'struct');
                }
                break;
            case nodes.ThriftNodeType.Union:
                if (node.name) {
                    typeKind.set(node.name, 'union');
                }
                break;
            case nodes.ThriftNodeType.Exception:
                if (node.name) {
                    typeKind.set(node.name, 'exception');
                }
                break;
            case nodes.ThriftNodeType.Service:
                if (node.name) {
                    typeKind.set(node.name, 'service');
                }
                break;
            default:
                break;
        }
    }
    return typeKind;
}

function parseTypesFromContent(content: string, uri: string): Map<string, string> {
    const ast = ThriftParser.parseContentWithCache(uri, content);
    return collectTypesFromAst(ast);
}

export async function getIncludedFiles(document: vscode.TextDocument): Promise<vscode.Uri[]> {
    const includedFiles: vscode.Uri[] = [];
    const documentDir = path.dirname(document.uri.fsPath);
    const ast = ThriftParser.parseWithCache(document);

    for (const node of ast.body) {
        if (node.type !== nodes.ThriftNodeType.Include) {
            continue;
        }
        const includePath = (node as nodes.Include).path;
        let fullPath: string;

        if (path.isAbsolute(includePath)) {
            fullPath = includePath;
        } else {
            fullPath = path.resolve(documentDir, includePath);
        }

        try {
            const uri = vscode.Uri.file(fullPath);
            includedFiles.push(uri);
        } catch {
            // Invalid path, skip
        }
    }

    return includedFiles;
}

export async function collectIncludedTypes(
    document: vscode.TextDocument,
    errorHandler?: ErrorHandler,
    log?: (message: string) => void
): Promise<Map<string, string>> {
    const includedTypes = new Map<string, string>();
    const includedFiles = await getIncludedFiles(document);
    const now = Date.now();
    const decoder = new TextDecoder('utf-8');

    for (const includedFile of includedFiles) {
        try {
            const includedFileKey = includedFile.toString();

            let fileStats;
            try {
                const stat = await vscode.workspace.fs.stat(includedFile);
                fileStats = { mtime: stat.mtime, size: stat.size };
            } catch {
                fileStats = null;
            }

            const cachedStats = includeFileStats.get(includedFileKey);
            const cachedTypes = includeTypesCache.get(includedFileKey);
            const cachedTime = includeFileTimestamps.get(includedFileKey);

            const cacheValid = cachedTypes && cachedTime &&
                (now - cachedTime) < INCLUDE_CACHE_MAX_AGE &&
                (!fileStats || !cachedStats || (
                    fileStats.mtime === cachedStats.mtime &&
                    fileStats.size === cachedStats.size
                ));

            if (cacheValid) {
                if (log) {
                    log(`[Diagnostics] Using cached types for included file: ${path.basename(includedFile.fsPath)}`);
                }
                for (const [name, kind] of cachedTypes) {
                    if (!includedTypes.has(name)) {
                        includedTypes.set(name, kind);
                    }
                }
                continue;
            }

            if (log) {
                log(`[Diagnostics] Analyzing included file: ${path.basename(includedFile.fsPath)} (cache miss)`);
            }

            let text = '';
            const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === includedFileKey);

            if (openDoc) {
                text = openDoc.getText();
            } else {
                const content = await vscode.workspace.fs.readFile(includedFile);
                text = decoder.decode(content);
            }

            const types = parseTypesFromContent(text, includedFileKey);

            includeTypesCache.set(includedFileKey, new Map(types));
            includeFileTimestamps.set(includedFileKey, now);
            if (fileStats) {
                includeFileStats.set(includedFileKey, fileStats);
            }

            for (const [name, kind] of types) {
                if (!includedTypes.has(name)) {
                    includedTypes.set(name, kind);
                }
            }
        } catch (error) {
            if (errorHandler) {
                errorHandler.handleError(error, {
                    component: 'DiagnosticManager',
                    operation: 'collectIncludedTypes',
                    filePath: includedFile.fsPath,
                    additionalInfo: { reason: 'includedFileAnalysis' }
                });
            }
            continue;
        }
    }

    return includedTypes;
}

export function collectIncludedTypesFromCache(includedFiles: vscode.Uri[]): Map<string, string> | null {
    const includedTypes = new Map<string, string>();
    const now = Date.now();
    for (const includedFile of includedFiles) {
        const includedFileKey = includedFile.toString();
        const cachedTypes = includeTypesCache.get(includedFileKey);
        const cachedTime = includeFileTimestamps.get(includedFileKey);
        if (!cachedTypes || !cachedTime || (now - cachedTime) >= INCLUDE_CACHE_MAX_AGE) {
            return null;
        }
        for (const [name, kind] of cachedTypes) {
            if (!includedTypes.has(name)) {
                includedTypes.set(name, kind);
            }
        }
    }
    return includedTypes;
}

export function clearIncludeCaches(): void {
    includeTypesCache.clear();
    includeFileTimestamps.clear();
    includeFileStats.clear();
}

export function clearIncludeCacheForDocument(docUri: string): boolean {
    if (!includeTypesCache.has(docUri)) {
        return false;
    }
    includeTypesCache.delete(docUri);
    includeFileTimestamps.delete(docUri);
    includeFileStats.delete(docUri);
    return true;
}
