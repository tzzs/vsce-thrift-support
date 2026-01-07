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

/**
 * 收集 AST 内定义的类型与类型类别。
 * @param ast Thrift AST 根节点
 * @returns 类型名称到类型类别的映射 (e.g. "User" -> "struct")
 */
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

/**
 * 解析 include 语句，返回包含文件的 URI 列表。
 * @param document 当前文档
 * @returns 解析得到的包含文件 URI 数组
 */
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

/**
 * 收集 include 文件中的类型信息（带缓存与文件状态校验）。
 * @param document起始文档
 * @param errorHandler 错误处理器（可选）
 * @param log 日志记录函数（可选）
 * @returns 所有被包含文件中的类型映射表
 */
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

/**
 * 尝试直接从缓存获取 include 类型信息，若缓存失效返回 null。
 * @param includedFiles 包含文件 URI 列表
 * @returns 缓存的类型映射表，如果任意文件缓存失效则返回 null
 */
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

/**
 * 清空 include 类型缓存。
 */
export function clearIncludeCaches(): void {
    includeTypesCache.clear();
    includeFileTimestamps.clear();
    includeFileStats.clear();
}

/**
 * 清除指定 URI 的 include 缓存条目。
 */
export function clearIncludeCacheForDocument(docUri: string): boolean {
    if (!includeTypesCache.has(docUri)) {
        return false;
    }
    includeTypesCache.delete(docUri);
    includeFileTimestamps.delete(docUri);
    includeFileStats.delete(docUri);
    return true;
}
