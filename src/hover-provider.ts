import * as vscode from 'vscode';
import { ThriftDefinitionProvider } from './definition-provider';
import * as path from 'path';
import { CacheManager } from './utils/cache-manager';
import { readThriftFile } from './utils/file-reader';
import { ThriftParser } from './ast/parser';
import { collectIncludes } from './ast/utils';
import { ErrorHandler } from './utils/error-handler';
import { config } from './config';

/**
 * ThriftHoverProvider：提供符号悬停文档展示。
 */
export class ThriftHoverProvider implements vscode.HoverProvider {

    // 使用单例定义提供器，避免重复创建实例
    private static definitionProvider: ThriftDefinitionProvider | null = null;

    // 缓存管理器
    private cacheManager = CacheManager.getInstance();

    // 错误处理器
    private errorHandler = ErrorHandler.getInstance();

    constructor() {
        // 注册缓存配置
        this.cache-manager.registerCache('hoverIncludes', {
            maxSize: config.cache.hoverIncludes.maxSize,
            ttl: config.cache.hoverIncludes.ttlMs
        });
        this.cache-manager.registerCache('hoverContent', {
            maxSize: config.cache.hoverContent.maxSize,
            ttl: config.cache.hoverContent.ttlMs
        });
    }

    /**
     * 清理全局缓存（静态入口）。
     */
    public static clearCache(): void {
        if (ThriftHoverProvider.definitionProvider) {
            ThriftHoverProvider.definition-provider.clearCache();
        }
    }

    /**
     * 清理实例级缓存。
     */
    public clearCache(): void {
        this.cache-manager.clear('hoverIncludes');
        this.cache-manager.clear('hoverContent');
        ThriftHoverProvider.clearCache();
    }

    /**
     * 提供当前位置的 Hover 信息。
     */
    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        try {
            // 使用单例定义提供器，避免重复创建实例
            const defProvider = this.getDefinitionProvider();
            const def = await defProvider.provideDefinition(document, position, token);
            const loc = this.normalizeDefinition(def);
            if (!loc) {
                return undefined;
            }

            // Only allow hover for definitions in current document or explicitly included files
            const allowed = new Set<string>();
            allowed.add(document.uri.fsPath);
            const includes = await this.getIncludedFiles(document);
            for (const u of includes) {
                allowed.add(u.fsPath);
            }
            if (!allowed.has(loc.uri.fsPath)) {
                return undefined;
            }

            // 使用文件内容读取器获取内容
            const content = await readThriftFile(loc.uri);
            const defLineIndex = loc.range.start.line;
            const lines = content.split('\n');

            // Extract the definition line and preceding doc comments
            const defLine = lines[defLineIndex] ?? '';
            const docLines = this.extractLeadingDocComments(lines, defLineIndex);

            if (!defLine.trim() && docLines.length === 0) {
                return undefined;
            }

            const md = new vscode.MarkdownString();
            const signature = defLine.trim();
            if (signature) {
                md.appendCodeblock(signature, 'thrift');
            }

            if (docLines.length > 0) {
                md.appendMarkdown('\n');
                md.appendMarkdown(docLines.join('\n'));
            }

            return new vscode.Hover(md);
        } catch (error) {
            this.error-handler.handleError(error, {
                component: 'ThriftHoverProvider',
                operation: 'provideHover',
                filePath: document.uri.fsPath,
                additionalInfo: { position: position.toString() }
            });
            return undefined;
        }
    }

    private getDefinitionProvider(): ThriftDefinitionProvider {
        if (!ThriftHoverProvider.definitionProvider) {
            ThriftHoverProvider.definitionProvider = new ThriftDefinitionProvider();
        }
        return ThriftHoverProvider.definitionProvider;
    }

    private normalizeDefinition(def: vscode.Definition | undefined): vscode.Location | undefined {
        if (!def) {
            return undefined;
        }
        if (Array.isArray(def)) {
            if (def.length === 0) {
                return undefined;
            }
            // Recursively normalize the first entry
            return this.normalizeDefinition(def[0] as any);
        }
        // def can be a Location or a LocationLink
        if ('uri' in def && 'range' in def) {
            return def as vscode.Location;
        }
        if ('targetUri' in def && 'targetRange' in def) {
            const link = def as vscode.LocationLink;
            return new vscode.Location(link.targetUri, link.targetRange);
        }
        return undefined;
    }

    private async getIncludedFiles(document: vscode.TextDocument): Promise<vscode.Uri[]> {
        // 使用缓存键
        const cacheKey = document.uri.toString();
        const cacheName = 'hoverIncludes';

        // 检查缓存
        const cached = this.cache-manager.get<vscode.Uri[]>(cacheName, cacheKey);
        if (cached) {
            return cached;
        }

        const ast = ThriftParser.parseWithCache(document);
        const includedFiles: vscode.Uri[] = [];
        const documentDir = path.dirname(document.uri.fsPath);

        for (const includeNode of collectIncludes(ast)) {
            const includePath = includeNode.path;
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
                // ignore invalid include
            }
        }

        // 缓存结果
        this.cache-manager.set(cacheName, cacheKey, includedFiles);
        return includedFiles;
    }

    private extractLeadingDocComments(lines: string[], defLineIndex: number): string[] {
        const results: string[] = [];
        let i = defLineIndex - 1;
        if (i < 0) {
            return results;
        }

        const trim = (s: string) => s.replace(/\s+$/, '');

        // Allow up to one blank line between the definition and its doc comments
        let blanks = 0;
        while (i >= 0 && trim(lines[i] || '') === '' && blanks < 1) {
            blanks++;
            i--;
        }
        if (i < 0) {
            return results;
        }

        // Handle block comments ending right above the definition (possibly after one blank line)
        if (/\*\//.test(lines[i])) {
            const block: string[] = [];
            while (i >= 0) {
                const t = lines[i];
                block.push(t);
                if (/\/\*/.test(t)) {
                    break;
                }
                i--;
            }
            block.reverse();
            const cleaned = this.cleanBlockComment(block);
            results.push(...cleaned);
            return results;
        }

        // Handle consecutive line comments (// ...)
        if (/^\s*\/\//.test(lines[i])) {
            const group: string[] = [];
            while (i >= 0 && /^\s*\/\//.test(lines[i])) {
                group.push(lines[i]);
                i--;
            }
            group.reverse();
            const cleaned = group.map(s => s.replace(/^\s*\/\/\s?/, ''));
            results.push(...cleaned);
            return results;
        }

        return results;
    }

    private cleanBlockComment(blockLines: string[]): string[] {
        // Normalize /** ... */ and /* ... */ styles to plain markdown lines
        const out: string[] = [];
        for (let idx = 0; idx < blockLines.length; idx++) {
            let line = blockLines[idx];
            // Remove comment delimiters
            line = line.replace(/^\s*\/\*\*?\s?/, '');
            line = line.replace(/\*\/\s*$/, '');
            // Trim leading '* ' commonly used in JSDoc-style blocks
            line = line.replace(/^\s*\*\s?/, '');
            out.push(line);
        }
        // Trim trailing/leading empty lines
        while (out.length && out[0].trim() === '') {
            out.shift();
        }
        while (out.length && out[out.length - 1].trim() === '') {
            out.pop();
        }
        return out;
    }
}
