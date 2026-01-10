import * as vscode from 'vscode';
import * as path from 'path';
import {CacheManager} from './utils/cache-manager';
import {ErrorHandler} from './utils/error-handler';
import {CoreDependencies} from './utils/dependencies';
import {config} from './config';
import {DefinitionLookup} from './definition/lookup';
import {
    checkIncludeStatement,
    fileDeclaresNamespace,
    findIncludeForNamespace,
    getIncludedFiles,
    getWordRangeAtPosition,
    isPrimitiveType
} from './definition/helpers';

/**
 * ThriftDefinitionProvider：提供 Thrift 文件中的定义导航。
 */
export class ThriftDefinitionProvider implements vscode.DefinitionProvider {
    // 缓存管理器
    private cacheManager: CacheManager;

    // 错误处理器
    private errorHandler: ErrorHandler;

    private definitionLookup: DefinitionLookup;

    constructor(deps?: Partial<CoreDependencies>) {
        this.cacheManager = deps?.cacheManager ?? new CacheManager();
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();

        // 注册缓存配置
        this.cacheManager.registerCache('definition', {
            maxSize: config.cache.definition.maxSize,
            ttl: config.cache.definition.ttlMs
        });
        this.cacheManager.registerCache('document', {
            maxSize: config.cache.definitionDocument.maxSize,
            ttl: config.cache.definitionDocument.ttlMs
        });
        this.cacheManager.registerCache('workspace', {
            maxSize: config.cache.definitionWorkspace.maxSize,
            ttl: config.cache.definitionWorkspace.ttlMs
        });

        this.definitionLookup = new DefinitionLookup(this.cacheManager);
    }

    /**
     * 清理定义相关缓存。
     */
    public clearCache(): void {
        this.cacheManager.clear('definition');
        this.cacheManager.clear('document');
        this.cacheManager.clear('workspace');
    }

    /**
     * 根据当前位置返回定义位置（含 include 与命名空间处理）。
     * @param document 当前文档
     * @param position 光标位置
     * @param _token 取消令牌
     * @returns 定义位置（Definition | undefined）
     */
    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        // Check if cursor is on an include statement first
        const includeDefinition = await checkIncludeStatement(document, position, this.errorHandler);
        if (includeDefinition) {
            return includeDefinition;
        }

        // For non-include statements, get the word at cursor position
        const wordRange = getWordRangeAtPosition(document, position);
        if (!wordRange) {
            return undefined;
        }
        // Use the line where the word was actually found (may differ from position.line due to fallback logic)
        // This ensures correct word extraction when getWordRangeAtPosition falls back to adjacent lines
        const line = document.lineAt(wordRange.start.line);
        const lineText = line.text;
        const word = lineText.substring(wordRange.start.character, wordRange.end.character);

        // Skip primitive types
        if (isPrimitiveType(word)) {
            return undefined;
        }

        // Check if we need to look for a namespaced type by scanning the entire line
        const wordStart = wordRange.start.character;
        const wordEnd = wordRange.end.character;

        let searchTypeName = word;
        let targetNamespace = '';
        let isNamespaceClick = false;

        // Robust detection: find occurrences of namespace.type and see which part user clicked
        const nsRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
        let match: RegExpExecArray | null;
        let matchedNamespaced = false;
        let nsStartIdx = -1;
        while ((match = nsRegex.exec(lineText)) !== null) {
            const nsStart = match.index;
            const nsEnd = nsStart + match[0].length;
            if (wordStart >= nsStart && wordEnd <= nsEnd) {
                // Cursor is within namespace.type
                targetNamespace = match[1];
                searchTypeName = match[2];
                isNamespaceClick = word === targetNamespace; // clicked on namespace part
                matchedNamespaced = true;
                nsStartIdx = nsStart;
                break;
            }
        }

        // If clicked exactly on the dot between namespace and type, do not navigate
        if (matchedNamespaced && nsStartIdx >= 0) {
            const dotIndex = nsStartIdx + targetNamespace.length; // position of the dot
            if (position.character === dotIndex) {
                return undefined;
            }
        }

        // If clicked on the namespace itself, try to navigate to the include line for that namespace
        if (matchedNamespaced && isNamespaceClick && targetNamespace) {
            const includeLoc = await findIncludeForNamespace(document, targetNamespace);
            if (includeLoc) {
                return includeLoc;
            }
            // No include for the namespace: do not fallback; return undefined
            return undefined;
        }

        // Search in current document
        const currentDocDefinition = await this.definitionLookup.findDefinitionInDocument(document.uri, document.getText(), searchTypeName);
        if (currentDocDefinition) {
            return currentDocDefinition;
        }

        // Search in included files
        const includedFiles = await getIncludedFiles(document, this.errorHandler);
        const decoder = new TextDecoder('utf-8');
        for (const includedFile of includedFiles) {
            try {
                // Check if already open
                const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === includedFile.toString());
                let text = '';
                if (openDoc) {
                    text = openDoc.getText();
                } else {
                    const content = await vscode.workspace.fs.readFile(includedFile);
                    text = decoder.decode(content);
                }

                // If we have a namespace, check either include alias or declared namespace.
                if (targetNamespace) {
                    const fileName = path.basename(includedFile.fsPath, '.thrift');
                    const matchesNamespace = fileName === targetNamespace || fileDeclaresNamespace(text, targetNamespace);
                    if (!matchesNamespace) {
                        continue; // Skip files that don't match the namespace
                    }
                }

                const definition = await this.definitionLookup.findDefinitionInDocument(includedFile, text, searchTypeName);
                if (definition) {
                    return definition;
                }
            } catch (error) {
                this.errorHandler.handleError(error, {
                    component: 'ThriftDefinitionProvider',
                    operation: 'findDefinitionInIncludedFile',
                    filePath: includedFile.fsPath,
                    additionalInfo: {searchTypeName}
                });
                continue;
            }
        }

        // If namespaced type is used but corresponding include is missing, do NOT fallback to workspace
        if (targetNamespace) {
            const includeLoc = await findIncludeForNamespace(document, targetNamespace);
            if (!includeLoc) {
                return undefined;
            }
        }

        // Search in all thrift files in workspace, return multiple candidates if any
        const workspaceDefinitions = await this.definitionLookup.findDefinitionInWorkspace(searchTypeName);
        if (workspaceDefinitions && workspaceDefinitions.length > 0) {
            return workspaceDefinitions; // VS Code will present multiple results to the user
        }

        return undefined;
    }
}
