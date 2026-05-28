import {Range} from '../types';
import * as nodes from './nodes.types';
import {config} from '../config';
import {
    clearAstCacheForDocument,
    clearExpiredAstCache,
    getCachedAstRange,
    parseWithAstCache,
    setCachedAst,
    setCachedAstRange
} from './cache';
import {createLineRange, LineRange} from '../utils/line-range';
import {QuoteTracker} from '../utils/quote-tracker';
import {createField, createDocument, createStructBlock, createEnumBlock, createServiceBlock, createInteractionBlock} from './factory';
import {isExpired, isFresh} from '../utils/cache-expiry';
import {
    buildConstValueRange,
    findDefaultValueRange,
    findInitializerRange,
    findThrowsStartInRange,
    findTypeRangeInLine,
    findWordRangeInLine,
    parseFieldList,
    readParenthesizedText,
    stripTrailingAnnotation
} from './parser-helpers';
import {
    filterMeaningfulTokens,
    findFirstIdentifier,
    findIdentifierIndex,
    findLastIdentifier,
    findSymbolIndex,
    findSymbolIndexFrom,
    readQualifiedIdentifier
} from './token-utils';
import {ThriftTokenizer, Token, tokenizeLine} from './tokenizer';

export interface ParseRegion {
    startLine: number;
    endLine: number;
}

export interface IncrementalParseResult {
    ast: nodes.ThriftDocument;
    affectedNodes: nodes.ThriftNode[];
    newNodes: nodes.ThriftNode[];
}

export interface ParseContext {
    currentLine: number;
    lines: string[];
    token: ThriftTokenizer;
}

export class ThriftParser {
    private static astByUri = new Map<string, {ast: nodes.ThriftDocument; timestamp: number}>();
    private text: string;
    private lines: string[];
    private currentLine = 0;
    private tokenizer: ThriftTokenizer;

    constructor(content: string | {getText(): string}) {
        this.text = typeof content === 'string' ? content : content.getText();
        this.lines = this.text.split(/\r?\n/);
        this.tokenizer = new ThriftTokenizer();
    }

    /**
     * 带缓存的解析入口（基于 URI、内容和版本号）。
     * 使用 URI + 版本号 + 内容哈希 作为缓存键，提高缓存命中率。
     */
    public static parseWithCacheByVersion(uri: string, content: string, version?: number): nodes.ThriftDocument {
        const ast = parseWithAstCache(uri, content, () => {
            const parser = new ThriftParser(content);
            return parser.parse();
        }, version);

        ThriftParser.setCachedAstByUriUnsafe(uri, ast);
        return ast;
    }

    /** Backward-compatible alias: parseWithCache({getText(), uri: {toString()}}) */
    public static parseWithCache(doc: {getText(): string; uri: {toString(): string}}): nodes.ThriftDocument {
        return ThriftParser.parseWithCacheByVersion(doc.uri.toString(), doc.getText());
    }

    /**
     * 带缓存的解析入口（基于 URI 与内容）。
     * 使用 URI + 内容哈希 作为缓存键。
     */
    public static parseContentWithCache(uri: string, content: string): nodes.ThriftDocument {
        // 使用优化的缓存键：URI + 内容哈希
        const ast = parseWithAstCache(uri, content, () => {
            const parser = new ThriftParser(content);
            return parser.parse();
        });

        ThriftParser.setCachedAstByUriUnsafe(uri, ast);
        return ast;
    }

    /**
     * 清理过期 AST 缓存。
     */
    public static clearExpiredCache(): void {
        clearExpiredAstCache();
        ThriftParser.clearExpiredAstByUriCache();
    }

    /**
     * 清理指定文档的 AST 缓存。
     */
    public static clearDocumentCache(uri: string): void {
        clearAstCacheForDocument(uri);
        ThriftParser.astByUri.delete(uri);
    }

    /**
     * 解析 Thrift 文本为 AST。
     */
    public parse(): nodes.ThriftDocument {
        const estimatedSize = Math.min(this.lines.length, 1000);
        const root = createDocument({
            range: this.createRange(0, 0, this.lines.length > 0 ? this.lines.length - 1 : 0,
                this.lines.length > 0 ? this.lines[this.lines.length - 1].length : 0),
            body: new Array<nodes.ThriftNode>(estimatedSize)
        });

        this.currentLine = 0;
        let bodyIndex = 0;
        while (this.currentLine < this.lines.length) {
            const node = this.parseNextNode(root);
            if (node) {
                if (bodyIndex >= root.body.length) {
                    root.body.length = Math.min(root.body.length * 2, 100000);
                }
                root.body[bodyIndex++] = node;
                this.addChild(root, node);
            }
        }
        root.body.length = bodyIndex;

        return root;
    }

    /**
     * 解析文档的一部分，并将其集成到现有AST中
     */
    public parseSection(startLine: number, endLine: number, existingAst?: nodes.ThriftDocument): nodes.ThriftDocument {
        // If no existing AST is provided, create a new one
        const ast = existingAst ?? createDocument({
            range: this.createRange(0, 0, this.lines.length > 0 ? this.lines.length - 1 : 0,
                this.lines.length > 0 ? this.lines[this.lines.length - 1].length : 0),
            body: []
        });

        // Save current state
        const originalCurrentLine = this.currentLine;

        // Create a map to track existing nodes by their range for efficient lookup
        const existingNodeMap = new Map<string, nodes.ThriftNode>();
        if (existingAst) {
            for (const node of existingAst.body) {
                const key = `${node.range.start.line}-${node.range.end.line}`;
                existingNodeMap.set(key, node);
            }
        }

        // Parse the specific section
        this.currentLine = startLine;
        while (this.currentLine <= endLine && this.currentLine < this.lines.length) {
            const line = this.lines[this.currentLine];
            if (line.trim()) {
                const node = this.parseNextNode(ast);
                if (node) {
                    // Check if there's an existing node that overlaps with the new node
                    const overlapKey = `${node.range.start.line}-${node.range.end.line}`;
                    const existingNode = existingNodeMap.get(overlapKey);

                    if (!existingNode) {
                        // No overlap, simply add the new node
                        ast.body.push(node);
                        this.addChild(ast, node);
                    } else {
                        // Overlap detected - replace the existing node
                        const index = ast.body.findIndex(n =>
                            n.range.start.line === existingNode.range.start.line &&
                            n.range.end.line === existingNode.range.end.line
                        );
                        if (index !== -1) {
                            ast.body[index] = node;
                        } else {
                            ast.body.push(node);
                        }
                        this.addChild(ast, node);
                    }
                }
            } else {
                this.currentLine++;
            }
        }

        // Restore original state
        this.currentLine = originalCurrentLine;

        return ast;
    }

    private ensureChildren(node: nodes.ThriftNode): nodes.ThriftNode[] {
        return node.children ??= [];
    }

    private addChild(parent: nodes.ThriftNode, child: nodes.ThriftNode): void {
        const children = this.ensureChildren(parent);
        if (!children.includes(child)) {
            children.push(child);
        }
    }

    private scanLine(line: string): {stripped: string; tokens: Token[]} {
        const scan = this.tokenizer.scanLine(line);
        return {
            stripped: scan.stripped,
            tokens: filterMeaningfulTokens(scan.tokens)
        };
    }

    private countBraces(tokens: Token[]): {open: number; close: number} {
        let open = 0;
        let close = 0;
        for (const token of tokens) {
            if (token.type !== 'symbol') {
                continue;
            }
            if (token.value === '{') {
                open++;
            } else if (token.value === '}') {
                close++;
            }
        }
        return {open, close};
    }

    private parseNextNode(parent: nodes.ThriftNode): nodes.ThriftNode | null {
        if (this.currentLine >= this.lines.length) {
            return null;
        }

        const line = this.lines[this.currentLine];
        const scan = this.scanLine(line);
        const trimmed = scan.stripped.trim();

        // Skip empty lines and comments
        if (!trimmed) {
            this.currentLine++;
            return null;
        }

        const tokens = scan.tokens;
        if (tokens.length === 0) {
            this.currentLine++;
            return null;
        }

        const keywordToken = tokens[0];
        if (keywordToken.type !== 'identifier') {
            this.currentLine++;
            return null;
        }

        if (keywordToken.value === 'namespace') {
            const scope = readQualifiedIdentifier(tokens, 1);
            const namespace = scope ? readQualifiedIdentifier(tokens, scope.endIndex) : null;
            if (scope && namespace) {
                const node: nodes.Namespace = {
                    type: nodes.ThriftNodeType.Namespace,
                    range: this.createRange(this.currentLine, 0, this.currentLine, line.length),
                    nameRange: this.createRange(this.currentLine, namespace.startOffset, this.currentLine, namespace.endOffset),
                    parent: parent,
                    scope: scope.value,
                    namespace: namespace.value,
                    name: namespace.value
                };
                this.currentLine++;
                return node;
            }
            const invalid = this.createInvalidNode(parent, line, 'Invalid namespace declaration');
            this.currentLine++;
            return invalid;
        }

        if (keywordToken.value === 'include') {
            const pathToken = tokens[1];
            if (pathToken !== undefined && pathToken.type === 'string') {
                const node: nodes.Include = {
                    type: nodes.ThriftNodeType.Include,
                    range: this.createRange(this.currentLine, 0, this.currentLine, line.length),
                    parent: parent,
                    path: pathToken.value,
                    name: pathToken.value
                };
                this.currentLine++;
                return node;
            }
            const invalid = this.createInvalidNode(parent, line, 'Invalid include declaration');
            this.currentLine++;
            return invalid;
        }

        if (keywordToken.value === 'struct' || keywordToken.value === 'union' || keywordToken.value === 'exception') {
            const nameToken = findFirstIdentifier(tokens, 1);
            if (nameToken) {
                return this.parseStruct(parent, keywordToken.value, nameToken.value);
            }
            const invalid = this.createInvalidNode(parent, line, `Invalid ${keywordToken.value} declaration`);
            this.currentLine++;
            return invalid;
        }

        if (keywordToken.value === 'enum' || keywordToken.value === 'senum') {
            const nameToken = findFirstIdentifier(tokens, 1);
            if (nameToken) {
                return this.parseEnum(parent, nameToken.value, keywordToken.value === 'senum');
            }
            const invalid = this.createInvalidNode(parent, line, `Invalid ${keywordToken.value} declaration`);
            this.currentLine++;
            return invalid;
        }

        if (keywordToken.value === 'service') {
            const nameToken = findFirstIdentifier(tokens, 1);
            if (nameToken) {
                let extendsName: string | undefined;
                let extendsRange: Range | undefined;
                const extendsIndex = findIdentifierIndex(tokens, 'extends', nameToken.index + 1);
                if (extendsIndex !== -1) {
                    const parentName = readQualifiedIdentifier(tokens, extendsIndex + 1);
                    if (parentName) {
                        extendsName = parentName.value;
                        extendsRange = this.createRange(
                            this.currentLine, parentName.startOffset,
                            this.currentLine, parentName.endOffset
                        );
                    }
                }
                return this.parseService(parent, nameToken.value, extendsName, extendsRange);
            }
            const invalid = this.createInvalidNode(parent, line, 'Invalid service declaration');
            this.currentLine++;
            return invalid;
        }

        if (keywordToken.value === 'interaction') {
            const nameToken = findFirstIdentifier(tokens, 1);
            if (nameToken) {
                return this.parseInteraction(parent, nameToken.value);
            }
            const invalid = this.createInvalidNode(parent, line, 'Invalid interaction declaration');
            this.currentLine++;
            return invalid;
        }

        if (keywordToken.value === 'const') {
            const equalsIndex = findSymbolIndex(tokens, '=');
            if (equalsIndex !== -1) {
                const nameToken = findLastIdentifier(tokens, equalsIndex);
                if (nameToken) {
                    const typeText = line.slice(keywordToken.end, nameToken.start).trim();
                    if (typeText) {
                        return this.parseConst(parent, typeText, nameToken.value);
                    }
                }
            }
            const invalid = this.createInvalidNode(parent, line, 'Invalid const declaration');
            this.currentLine++;
            return invalid;
        }

        if (keywordToken.value === 'typedef') {
            const nameToken = findLastIdentifier(tokens, tokens.length);
            if (nameToken && nameToken.index > 0) {
                const keywordIndex = keywordToken.end;
                const aliasType = line.slice(keywordIndex, nameToken.start).trim();
                const node: nodes.Typedef = {
                    type: nodes.ThriftNodeType.Typedef,
                    range: this.createRange(this.currentLine, 0, this.currentLine, line.length),
                    nameRange: this.createRange(this.currentLine, nameToken.start, this.currentLine, nameToken.end),
                    parent: parent,
                    aliasType: aliasType,
                    aliasTypeRange: findTypeRangeInLine(line, this.currentLine, aliasType, keywordIndex),
                    name: nameToken.value
                };
                this.currentLine++;
                return node;
            }
            const invalid = this.createInvalidNode(parent, line, 'Invalid typedef declaration');
            this.currentLine++;
            return invalid;
        }

        // Skip unrecognized lines
        this.currentLine++;
        return null;
    }

    private createInvalidNode(parent: nodes.ThriftNode, line: string, message: string): nodes.InvalidNode {
        return {
            type: nodes.ThriftNodeType.Invalid,
            range: this.createRange(this.currentLine, 0, this.currentLine, line.length),
            parent: parent,
            raw: line,
            message
        };
    }


    private parseStruct(parent: nodes.ThriftNode, structType: string, name: string): nodes.Struct {
        const startLine = this.currentLine;
        const type = structType === 'exception' ? nodes.ThriftNodeType.Exception :
            structType === 'union' ? nodes.ThriftNodeType.Union : nodes.ThriftNodeType.Struct;
        const line = this.lines[startLine];
        const keywordIndex = line.indexOf(structType);
        const searchStart = keywordIndex >= 0 ? keywordIndex + structType.length : 0;

        const structNode = createStructBlock({
            type,
            name,
            nameRange: findWordRangeInLine(line, startLine, name, searchStart),
            parent
        });

        // Parse body
        this.currentLine = this.parseStructBody(structNode);
        structNode.range = this.createRange(startLine, 0, this.currentLine,
            (this.lines[this.currentLine] ?? '').length);
        return structNode;
    }

    /**
     * 通用的大括号包裹块解析器。
     * Phase 1: 定位开括号 `{`
     * Phase 2: 逐行扫描，调用 bodyParser 解析内容，直到 braceCount 归零。
     */
    private parseBracedBlock(
        bodyParser: (line: string, scan: {stripped: string; tokens: Token[]}) => void
    ): number {
        let braceCount = 0;
        // Phase 1: Find opening brace
        while (this.currentLine < this.lines.length) {
            const line = this.lines[this.currentLine];
            const scan = this.scanLine(line);
            const braceStats = this.countBraces(scan.tokens);
            if (braceStats.open > 0) {
                braceCount += braceStats.open - braceStats.close;
                break;
            }
            this.currentLine++;
        }

        this.currentLine++; // Move past opening brace
        if (braceCount <= 0) {
            return this.currentLine;
        }

        // Phase 2: Parse body until closing brace
        while (this.currentLine < this.lines.length && braceCount > 0) {
            const line = this.lines[this.currentLine];
            const scan = this.scanLine(line);

            const braceStats = this.countBraces(scan.tokens);
            if (braceStats.open > 0 || braceStats.close > 0) {
                braceCount += braceStats.open - braceStats.close;
                if (braceCount <= 0) {
                    this.currentLine++;
                    break;
                }
            }

            bodyParser(line, scan);
            this.currentLine++;
        }

        return this.currentLine;
    }

    private parseStructBody(parent: nodes.Struct): number {
        return this.parseBracedBlock((line, scan) => {
            const field = this.parseStructFieldLine(parent, line, scan.stripped, scan.tokens);
            if (field) {
                parent.fields.push(field);
                this.addChild(parent, field);
            }
        });
    }

    private parseStructFieldLine(parent: nodes.Struct, line: string, cleanLine: string, tokens: Token[]): nodes.Field | null {
        const trimmed = cleanLine.trim();
        if (!trimmed) {
            return null;
        }
        if (tokens.length === 0) {
            return null;
        }
        const idIndex = tokens.findIndex(token => token.type === 'number');
        if (idIndex === -1) {
            return this.parseStructFieldLineFallback(parent, line, cleanLine);
        }
        const colonIndex = findSymbolIndexFrom(tokens, ':', idIndex + 1);
        if (colonIndex === -1) {
            return this.parseStructFieldLineFallback(parent, line, cleanLine);
        }
        let cursor = colonIndex + 1;
        let requiredness: 'required' | 'optional' | undefined;
        if (tokens[cursor]?.type === 'identifier' &&
            (tokens[cursor].value === 'required' || tokens[cursor].value === 'optional')) {
            requiredness = tokens[cursor].value as 'required' | 'optional';
            cursor += 1;
        }
        const typeStartToken = tokens[cursor];
        if (typeStartToken === undefined) {
            return this.parseStructFieldLineFallback(parent, line, cleanLine);
        }
        let nameTokenIndex = -1;
        let angleDepth = 0;
        for (let i = cursor; i < tokens.length; i++) {
            const token = tokens[i];
            if (token.type === 'symbol') {
                if (token.value === '<') {
                    angleDepth += 1;
                } else if (token.value === '>') {
                    angleDepth = Math.max(0, angleDepth - 1);
                }
                if (angleDepth === 0 && (token.value === '(' || token.value === '=' || token.value === ',' || token.value === ';')) {
                    break;
                }
                continue;
            }
            if (token.type === 'identifier') {
                nameTokenIndex = i;
            }
        }
        if (nameTokenIndex === -1) {
            return this.parseStructFieldLineFallback(parent, line, cleanLine);
        }
        const nameToken = tokens[nameTokenIndex];
        const fieldType = cleanLine.slice(typeStartToken.start, nameToken.start).trim();
        if (!fieldType) {
            return this.parseStructFieldLineFallback(parent, line, cleanLine);
        }
        const valueTarget = stripTrailingAnnotation(cleanLine.replace(/[,;]\s*$/, ''));
        const nameRange = this.createRange(
            this.currentLine,
            nameToken.start,
            this.currentLine,
            nameToken.end
        );
        const typeRange = this.createRange(
            this.currentLine,
            typeStartToken.start,
            this.currentLine,
            nameToken.start
        );
        const defaultInfo = findDefaultValueRange(valueTarget);
        const defaultStart = defaultInfo ? defaultInfo.start : null;
        const defaultEnd = defaultInfo ? defaultInfo.end : null;
        return createField({
            range: this.createRange(this.currentLine, 0, this.currentLine, line.length),
            nameRange,
            typeRange,
            parent,
            id: parseInt(tokens[idIndex].value, 10),
            requiredness,
            fieldType,
            name: nameToken.value,
            defaultValue: defaultInfo?.value,
            defaultValueRange: defaultStart !== null && defaultEnd !== null
                ? this.createRange(this.currentLine, defaultStart, this.currentLine, defaultEnd)
                : undefined
        });
    }

    /**
     * Struct 字段解析的兜底路径。
     *
     * 审计结论（2026-05）：主路径 `parseStructFieldLine` 已覆盖所有合法字段语法。
     * 每个 fallback 触发条件（缺数字 / 缺冒号 / 类型 token 缺失 / 在 `<>` 之外找不到
     * identifier / 类型切片为空）都是旧 regex `^\d+:\s*[a-zA-Z0-9_<>.,]+\s+[a-zA-Z_]\w*`
     * 失败条件的严格子集 —— 主路径解析不了的输入，fallback regex 同样无法匹配。
     *
     * 旧 regex 的类型字符类 `[a-zA-Z0-9_<>.,]+` 对嵌套泛型如 `map<string, list<i32>>`
     * 会在首个逗号处截断，本身就有 bug；主路径用 angleDepth 跟踪正确处理嵌套。
     *
     * 返回 null 等同于"未识别行，跳过"，与旧 regex 不匹配时的行为一致。
     */
    private parseStructFieldLineFallback(
        _parent: nodes.Struct,
        _line: string,
        _cleanLine: string
    ): nodes.Field | null {
        return null;
    }

    private parseEnum(parent: nodes.ThriftNode, name: string, isSenum: boolean): nodes.Enum {
        const startLine = this.currentLine;
        const line = this.lines[startLine];
        const keywordIndex = line.indexOf(isSenum ? 'senum' : 'enum');
        const searchStart = keywordIndex >= 0 ? keywordIndex + (isSenum ? 'senum'.length : 'enum'.length) : 0;
        const enumNode = createEnumBlock({
            name,
            nameRange: findWordRangeInLine(line, startLine, name, searchStart),
            parent,
            isSenum
        });

        // Parse body
        this.currentLine = this.parseEnumBody(enumNode);
        enumNode.range = this.createRange(startLine, 0, this.currentLine,
            (this.lines[this.currentLine] ?? '').length);
        return enumNode;
    }

    private parseEnumBody(parent: nodes.Enum): number {
        return this.parseBracedBlock((line, scan) => {
            const member = this.parseEnumMemberLine(parent, line, scan.stripped, scan.tokens);
            if (member) {
                parent.members.push(member);
                this.addChild(parent, member);
            }
        });
    }

    private parseEnumMemberLine(parent: nodes.Enum, line: string, cleanLine: string, tokens: Token[]): nodes.EnumMember | null {
        const trimmed = cleanLine.trim();
        if (!trimmed) {
            return null;
        }
        if (tokens.length === 0) {
            return null;
        }
        const nameToken = tokens.find(token => token.type === 'identifier');
        if (!nameToken) {
            return null;
        }
        const equalsIndex = findSymbolIndex(tokens, '=');
        let initializer: string | undefined;
        let initializerRange: Range | undefined;
        if (equalsIndex !== -1) {
            let startOffset: number | null = null;
            let endOffset: number | null = null;
            let angleDepth = 0;
            let bracketDepth = 0;
            let braceDepth = 0;
            let parenDepth = 0;
            for (let i = equalsIndex + 1; i < tokens.length; i++) {
                const token = tokens[i];
                if (token.type === 'symbol') {
                    if (token.value === '<') {
                        angleDepth += 1;
                    } else if (token.value === '>') {
                        angleDepth = Math.max(0, angleDepth - 1);
                    } else if (token.value === '[') {
                        bracketDepth += 1;
                    } else if (token.value === ']') {
                        bracketDepth = Math.max(0, bracketDepth - 1);
                    } else if (token.value === '{') {
                        braceDepth += 1;
                    } else if (token.value === '}') {
                        braceDepth = Math.max(0, braceDepth - 1);
                    } else if (token.value === '(') {
                        parenDepth += 1;
                    } else if (token.value === ')') {
                        parenDepth = Math.max(0, parenDepth - 1);
                    }
                    if (angleDepth === 0 && bracketDepth === 0 && braceDepth === 0 && parenDepth === 0 &&
                        (token.value === ',' || token.value === ';' || token.value === '(')) {
                        break;
                    }
                }
                startOffset ??= token.start;
                endOffset = token.end;
            }
            if (startOffset !== null && endOffset !== null) {
                const rawInitializer = cleanLine.slice(startOffset, endOffset).trim();
                const trimmed = stripTrailingAnnotation(rawInitializer.replace(/[,;]\s*$/, '')).trim();
                initializer = trimmed || undefined;
                if (initializer !== undefined && initializer !== '') {
                    initializerRange = this.createRange(
                        this.currentLine,
                        startOffset,
                        this.currentLine,
                        endOffset
                    );
                }
            }
        }
        initializerRange ??= findInitializerRange(cleanLine, cleanLine, initializer, this.currentLine);
        const nameRange = this.createRange(
            this.currentLine,
            nameToken.start,
            this.currentLine,
            nameToken.end
        );
        return {
            type: nodes.ThriftNodeType.EnumMember,
            range: this.createRange(this.currentLine, 0, this.currentLine, line.length),
            nameRange,
            parent: parent,
            name: nameToken.value,
            initializer,
            initializerRange
        };
    }

    private parseService(parent: nodes.ThriftNode, name: string, extendsClass: string | undefined, extendsRange?: Range): nodes.Service {
        const startLine = this.currentLine;
        const line = this.lines[startLine];
        const keywordIndex = line.indexOf('service');
        const searchStart = keywordIndex >= 0 ? keywordIndex + 'service'.length : 0;
        const serviceNode = createServiceBlock({
            name,
            nameRange: findWordRangeInLine(line, startLine, name, searchStart),
            parent,
            extends: extendsClass,
            extendsRange
        });

        // Parse body
        this.currentLine = this.parseServiceBody(serviceNode);
        serviceNode.range = this.createRange(startLine, 0, this.currentLine,
            (this.lines[this.currentLine] ?? '').length);
        return serviceNode;
    }

    private parseInteraction(parent: nodes.ThriftNode, name: string): nodes.Interaction {
        const startLine = this.currentLine;
        const line = this.lines[startLine];
        const keywordIndex = line.indexOf('interaction');
        const searchStart = keywordIndex >= 0 ? keywordIndex + 'interaction'.length : 0;
        const interactionNode = createInteractionBlock({
            name,
            nameRange: findWordRangeInLine(line, startLine, name, searchStart),
            parent
        });

        this.currentLine = this.parseInteractionBody(interactionNode);
        interactionNode.range = this.createRange(startLine, 0, this.currentLine,
            (this.lines[this.currentLine] ?? '').length);
        return interactionNode;
    }

    private parseInteractionBody(parent: nodes.Interaction): number {
        return this.parseBracedBlock((line, scan) => {
            const funcParsed = this.parseServiceFunctionLine(line, scan.stripped, scan.tokens);
            if (funcParsed) {
                const funcNode = this.buildFunctionNode(parent, funcParsed, line);
                if (funcNode) {
                    parent.functions.push(funcNode);
                    this.addChild(parent, funcNode);
                }
            }
        });
    }

    private parseServiceBody(parent: nodes.Service): number {
        return this.parseBracedBlock((line, scan) => {
            const funcParsed = this.parseServiceFunctionLine(line, scan.stripped, scan.tokens);
            if (funcParsed) {
                const funcNode = this.buildFunctionNode(parent, funcParsed, line);
                if (funcNode) {
                    parent.functions.push(funcNode);
                    this.addChild(parent, funcNode);
                }
            } else {
                const perfNode = this.parsePerforms(parent, line, scan.stripped, scan.tokens);
                if (perfNode) {
                    (parent.performs ??= []).push(perfNode);
                    this.addChild(parent, perfNode);
                }
            }
        });
    }

    /**
     * Scan a line for throws clause starting at `start`, return the index after the throws block.
     */
    private skipThrowsBlock(line: string, start: number): number {
        if (line.substring(start, start + 6) !== 'throws') {
            return start;
        }
        let throwsParenCount = 0;
        let j = start + 6;
        for (; j < line.length; j++) {
            if (line[j] === '(') {
                throwsParenCount++;
            } else if (line[j] === ')') {
                throwsParenCount--;
                if (throwsParenCount === 0) {
                    j++;
                    break;
                }
            }
        }
        while (j < line.length && /\s/.test(line[j])) {
            j++;
        }
        return j;
    }

    /**
     * Find function signature end by scanning for the closing paren after args,
     * then skipping any throws clause and trailing whitespace.
     */
    private findFunctionEnd(
        startLine: number,
        startChar: number,
        initialParenCount: number
    ): {endLine: number; endChar: number} | null {
        let parenCount = initialParenCount;
        for (let lineNum = startLine; lineNum < this.lines.length; lineNum++) {
            const text = this.lines[lineNum];
            const colStart = lineNum === startLine ? startChar : 0;
            for (let i = colStart; i < text.length; i++) {
                if (text[i] === '(') {
                    parenCount++;
                } else if (text[i] === ')') {
                    parenCount--;
                    if (parenCount === 0) {
                        const j = this.skipThrowsBlock(text, i + 1);
                        if (j < text.length && (text[j] === ',' || text[j] === ';' || text[j] === '{')) {
                            return {endLine: lineNum, endChar: j + 1};
                        }
                    }
                }
            }
        }
        return null;
    }

    /**
     * Parse throws clause if present between args end and function end.
     */
    private parseFunctionThrows(
        argsEndLine: number,
        argsEndChar: number,
        funcEndLine: number,
        funcEndChar: number
    ): {fields: nodes.Field[]; endLine: number; endChar: number} {
        const throwsFields: nodes.Field[] = [];
        let resultEndLine = funcEndLine;
        let resultEndChar = funcEndChar;

        const throwsStart = findThrowsStartInRange(
            this.lines, argsEndLine, argsEndChar, funcEndLine, funcEndChar
        );
        if (throwsStart) {
            const throwsResult = readParenthesizedText(this.lines, throwsStart.line, throwsStart.char + 1);
            if (throwsResult) {
                throwsFields.push(...parseFieldList(throwsResult.text, throwsStart.line, throwsStart.char + 1));
                resultEndLine = throwsResult.endLine;
                resultEndChar = throwsResult.endChar;
            }
        }
        return {fields: throwsFields, endLine: resultEndLine, endChar: resultEndChar};
    }

    private buildFunctionNode(
        parent: nodes.ThriftNode,
        funcParsed: {
            name: string;
            returnType: string;
            nameRange: Range | undefined;
            returnTypeRange: Range | undefined;
            oneway: boolean;
            isStream: boolean;
            isSink: boolean;
            funcStartLine: number;
            funcStartChar: number;
            funcEndLine: number;
            funcEndChar: number;
        },
        line: string
    ): nodes.ThriftFunction | null {
        const {
            name,
            returnType,
            nameRange,
            returnTypeRange,
            oneway,
            isStream,
            isSink,
            funcStartLine,
            funcStartChar
        } = funcParsed;
        let funcEndLine = funcParsed.funcEndLine;
        let funcEndChar = funcParsed.funcEndChar;

        const args: nodes.Field[] = [];
        const parenStartPos = line.indexOf('(');
        let argResult: {text: string; endLine: number; endChar: number} | null = null;
        if (parenStartPos !== -1) {
            argResult = readParenthesizedText(this.lines, this.currentLine, parenStartPos + 1);
            if (argResult) {
                args.push(...parseFieldList(argResult.text, this.currentLine, parenStartPos + 1));
                funcEndLine = argResult.endLine;
                funcEndChar = this.lines[argResult.endLine] ? this.lines[argResult.endLine].length : 0;
            }
        }

        const end = this.findFunctionEnd(funcStartLine, funcStartChar, 0);
        if (end) {
            funcEndLine = end.endLine;
            funcEndChar = end.endChar;
        }

        const argsEndLine = argResult ? argResult.endLine : funcStartLine;
        const argsEndChar = argResult ? argResult.endChar + 1 : Math.max(parenStartPos + 1, funcStartChar);
        const throws = this.parseFunctionThrows(argsEndLine, argsEndChar, funcEndLine, funcEndChar);
        funcEndLine = throws.endLine;
        funcEndChar = throws.endChar;

        const funcNode: nodes.ThriftFunction = {
            type: nodes.ThriftNodeType.Function,
            range: this.createRange(funcStartLine, funcStartChar, funcEndLine, funcEndChar),
            nameRange,
            parent: parent,
            name,
            returnType,
            returnTypeRange,
            oneway,
            isStream: isStream || undefined,
            isSink: isSink || undefined,
            arguments: args,
            throws: throws.fields
        };

        args.forEach(arg => {
            arg.parent = funcNode;
            this.addChild(funcNode, arg);
        });
        throws.fields.forEach(field => {
            field.parent = funcNode;
            this.addChild(funcNode, field);
        });

        return funcNode;
    }

    /**
     * 解析 service 或 interaction 中的 performs 声明。
     */
    private parsePerforms(parent: nodes.ThriftNode, line: string, cleanLine: string, tokens: Token[]): nodes.Performs | null {
        const trimmed = cleanLine.trim();
        if (!trimmed || tokens.length === 0) {
            return null;
        }
        if (tokens[0].type !== 'identifier' || tokens[0].value !== 'performs') {
            return null;
        }
        const nameToken = tokens[1];
        if (nameToken === undefined || nameToken.type !== 'identifier') {
            return null;
        }
        const nameRange = this.createRange(
            this.currentLine,
            nameToken.start,
            this.currentLine,
            nameToken.end
        );
        return {
            type: nodes.ThriftNodeType.Performs,
            range: this.createRange(this.currentLine, 0, this.currentLine, line.length),
            nameRange,
            parent: parent,
            name: nameToken.value,
            interactionName: nameToken.value,
            interactionNameRange: nameRange
        };
    }

    private parseServiceFunctionLine(line: string, cleanLine: string, tokens: Token[]): {
        name: string;
        returnType: string;
        nameRange: Range | undefined;
        returnTypeRange: Range | undefined;
        oneway: boolean;
        isStream: boolean;
        isSink: boolean;
        funcStartLine: number;
        funcStartChar: number;
        funcEndLine: number;
        funcEndChar: number;
    } | null {
        const trimmed = cleanLine.trim();
        if (!trimmed) {
            return null;
        }
        if (tokens.length === 0) {
            return null;
        }
        const parenIndex = findSymbolIndex(tokens, '(');
        if (parenIndex === -1) {
            return null;
        }
        let nameTokenIndex = -1;
        for (let i = parenIndex - 1; i >= 0; i--) {
            if (tokens[i].type === 'identifier') {
                nameTokenIndex = i;
                break;
            }
        }
        if (nameTokenIndex === -1) {
            return null;
        }
        const oneway = tokens[0].type === 'identifier' && tokens[0].value === 'oneway';
        let returnTypeStartIndex = oneway ? 1 : 0;
        let isStream = false;
        let isSink = false;
        // Check for stream/sink prefix after oneway
        if (returnTypeStartIndex < tokens.length && tokens[returnTypeStartIndex].type === 'identifier') {
            if (tokens[returnTypeStartIndex].value === 'stream') {
                isStream = true;
                returnTypeStartIndex += 1;
            } else if (tokens[returnTypeStartIndex].value === 'sink') {
                isSink = true;
                returnTypeStartIndex += 1;
            }
        }
        const returnTypeStartToken = tokens[returnTypeStartIndex];
        if (returnTypeStartToken === undefined || returnTypeStartIndex >= nameTokenIndex) {
            return null;
        }
        const nameToken = tokens[nameTokenIndex];
        // Include stream/sink keyword in return type string
        const typeStart = isStream ? returnTypeStartIndex - 1 : (isSink ? returnTypeStartIndex - 1 : returnTypeStartIndex);
        const returnType = cleanLine.slice(tokens[typeStart].start, nameToken.start).trim();
        if (!returnType) {
            return this.parseServiceFunctionLineFallback(line, cleanLine);
        }
        const funcStartLine = this.currentLine;
        const funcStartChar = tokens[typeStart].start;
        const nameRange = this.createRange(
            funcStartLine,
            nameToken.start,
            funcStartLine,
            nameToken.end
        );
        const returnTypeRange = this.createRange(
            funcStartLine,
            tokens[typeStart].start,
            funcStartLine,
            nameToken.start
        );
        return {
            name: nameToken.value,
            returnType,
            nameRange,
            returnTypeRange,
            oneway,
            isStream,
            isSink,
            funcStartLine,
            funcStartChar,
            funcEndLine: funcStartLine,
            funcEndChar: line.length
        };
    }

    /**
     * Service / Interaction 函数签名解析的兜底路径。
     *
     * 审计结论（2026-05）：主路径 `parseServiceFunctionLine` 已覆盖所有合法函数语法
     * （`[oneway] [stream|sink] <returnType> <name>(...)`）。每个 fallback 触发条件
     * （缺 `(` / `(` 前无 identifier / returnType 起始 token 缺失 / returnType 切片为空）
     * 都是旧 regex `^(?:oneway\s+)?(?:(stream|sink)\s+)?[a-zA-Z0-9_<>.,]+\s+[a-zA-Z_]\w*\s*\(`
     * 失败条件的严格子集 —— 主路径解析不了的输入，fallback regex 同样无法匹配。
     *
     * 同 `parseStructFieldLineFallback`，旧 regex 的类型字符类对嵌套泛型有 bug。
     *
     * 返回 null 等同于"未识别行，跳过"，与旧 regex 不匹配时的行为一致。
     */
    private parseServiceFunctionLineFallback(
        _line: string,
        _cleanLine: string
    ): {
        name: string;
        returnType: string;
        nameRange: Range | undefined;
        returnTypeRange: Range | undefined;
        oneway: boolean;
        isStream: boolean;
        isSink: boolean;
        funcStartLine: number;
        funcStartChar: number;
        funcEndLine: number;
        funcEndChar: number;
    } | null {
        return null;
    }


    private parseConst(parent: nodes.ThriftNode, valueType: string, name: string): nodes.Const {
        const startLine = this.currentLine;
        const line = this.lines[startLine];
        const keywordIndex = line.indexOf('const');
        const searchStart = keywordIndex >= 0 ? keywordIndex + 'const'.length : 0;
        let endLine = this.currentLine;
        let depthBrace = 0;
        let depthBracket = 0;
        let depthParen = 0;
        let seenEquals = false;
        let eqLine = -1;
        let eqChar = -1;
        const qt = new QuoteTracker();

        while (endLine < this.lines.length) {
            const line = this.lines[endLine];
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (qt.inside()) {
                    qt.feed(ch);
                    continue;
                }
                if (ch === '\'' || ch === '"') {
                    qt.feed(ch);
                    continue;
                }
                if (ch === '=' && !seenEquals) {
                    seenEquals = true;
                    if (eqLine === -1) {
                        eqLine = endLine;
                        eqChar = i;
                    }
                    continue;
                }
                if (!seenEquals) {
                    continue;
                }
                if (ch === '{') {
                    depthBrace++;
                }
                if (ch === '}') {
                    depthBrace = Math.max(0, depthBrace - 1);
                }
                if (ch === '[') {
                    depthBracket++;
                }
                if (ch === ']') {
                    depthBracket = Math.max(0, depthBracket - 1);
                }
                if (ch === '(') {
                    depthParen++;
                }
                if (ch === ')') {
                    depthParen = Math.max(0, depthParen - 1);
                }
            }

            if (seenEquals && depthBrace === 0 && depthBracket === 0 && depthParen === 0) {
                break;
            }
            endLine++;
        }

        const valueRangeInfo = buildConstValueRange(this.lines, startLine, endLine, eqLine, eqChar);
        const constNode: nodes.Const = {
            type: nodes.ThriftNodeType.Const,
            range: this.createRange(startLine, 0, endLine, (this.lines[endLine] ?? '').length),
            nameRange: findWordRangeInLine(line, startLine, name, searchStart),
            parent: parent,
            valueType: valueType,
            valueTypeRange: findTypeRangeInLine(line, startLine, valueType, searchStart),
            name: name,
            value: valueRangeInfo.value,
            valueRange: valueRangeInfo.range
        };

        this.currentLine = endLine + 1;
        return constNode;
    }

    /**
     * 解析指定行范围的内容，用于增量解析。
     */
    public parseRange(startLine: number, endLine: number): nodes.ThriftNode[] {
        const nodesInRange: nodes.ThriftNode[] = [];

        // Adjust bounds to ensure they are valid
        const actualStartLine = Math.max(0, Math.min(startLine, this.lines.length - 1));
        const actualEndLine = Math.max(actualStartLine, Math.min(endLine, this.lines.length - 1));

        // Save current state to restore after parsing range
        const originalCurrentLine = this.currentLine;

        this.currentLine = actualStartLine;

        while (this.currentLine <= actualEndLine && this.currentLine < this.lines.length) {
            const line = this.lines[this.currentLine];
            if (line.trim()) {  // Only parse non-empty lines
                // Create a temporary parent for range parsing
                const tempParent = createDocument({
                    range: this.createRange(actualStartLine, 0, actualEndLine,
                        (this.lines[actualEndLine] ?? '').length),
                    body: []
                }) as nodes.ThriftNode;

                const node = this.parseNextNode(tempParent);
                if (node) {
                    nodesInRange.push(node);
                }
            } else {
                this.currentLine++;
            }
        }

        // Restore original state
        this.currentLine = originalCurrentLine;

        return nodesInRange;
    }

    /**
     * 更新分析受更改影响的区域（扩展脏区算法），现在具有更精确的依赖分析。
     *
     * Token 驱动：所有花括号 / 关键字 / 终止符判定都基于 tokenizer 解析后的 token 流，
     * 避免字符串字面量（如 `const Msg = {"key": "{value}"}` 中的 `{` / `}`）被误计入
     * 花括号深度，导致脏区边界判断错误。
     */
    public analyzeAffectedRegion(startLine: number, endLine: number): {start: number; end: number} {
        let affectedStart = startLine;
        let affectedEnd = endLine;

        // 上行扫描：定位包含 startLine 的顶级声明
        for (let line = startLine; line >= 0 && line > startLine - 50; line--) {
            const text = this.lines[line];
            if (text === undefined) {
                continue;
            }
            const tokens = this.tokenizeLineMeaningful(text);
            if (tokens.length === 0) {
                continue;
            }
            if (isTopLevelDeclaration(tokens) || hasSymbolToken(tokens, '{')) {
                affectedStart = line;

                // 下行扫描：基于 token 计数花括号深度（忽略字符串/注释内的字符）
                let braceDepth = 0;
                for (let searchLine = line; searchLine < this.lines.length && searchLine < line + 100; searchLine++) {
                    const sText = this.lines[searchLine];
                    if (sText === undefined) {
                        continue;
                    }
                    const sTokens = this.tokenizeLineMeaningful(sText);
                    const braces = this.countBraces(sTokens);
                    braceDepth += braces.open - braces.close;
                    if (braceDepth <= 0) {
                        affectedEnd = Math.max(affectedEnd, searchLine);
                        break;
                    }
                }
                break;
            }
        }

        // 下行扫描：扩展到包含 `}` 或以 `;` / `,` 终止的行
        for (let line = endLine; line < this.lines.length && line < endLine + 20; line++) {
            const text = this.lines[line];
            if (text === undefined) {
                continue;
            }
            const tokens = this.tokenizeLineMeaningful(text);
            if (hasSymbolToken(tokens, '}') || endsWithStatementTerminator(tokens)) {
                affectedEnd = line;
                break;
            }
        }

        return {start: affectedStart, end: affectedEnd};
    }

    /**
     * 单行无状态 tokenize（不依赖 `this.tokenizer` 的跨行块注释状态）。
     * 用于 `analyzeAffectedRegion` 这类从文档中间开始扫描的场景。
     */
    private tokenizeLineMeaningful(line: string): Token[] {
        return filterMeaningfulTokens(tokenizeLine(line));
    }

    /**
     * 分析 AST 节点之间的依赖关系。
     */
    public analyzeDependencies(ast: nodes.ThriftDocument): Map<nodes.ThriftNode, nodes.ThriftNode[]> {
        const dependencies = new Map<nodes.ThriftNode, nodes.ThriftNode[]>();

        // Build O(1) type-name lookup from ast.body
        const typeIndex = new Map<string, nodes.ThriftNode>();
        for (const node of ast.body) {
            if (node.name !== undefined &&
                (node.type === nodes.ThriftNodeType.Struct ||
                    node.type === nodes.ThriftNodeType.Enum ||
                    node.type === nodes.ThriftNodeType.Typedef ||
                    node.type === nodes.ThriftNodeType.Service)) {
                typeIndex.set(node.name, node);
            }
        }

        for (const node of ast.body) {
            const nodeDeps: nodes.ThriftNode[] = [];

            if (node.type === nodes.ThriftNodeType.Service) {
                const service = node;
                for (const func of service.functions) {
                    this.addTypeDependency(typeIndex, func.returnType, nodeDeps);
                    for (const arg of func.arguments) {
                        this.addTypeDependency(typeIndex, arg.fieldType, nodeDeps);
                    }
                    for (const thr of func.throws) {
                        this.addTypeDependency(typeIndex, thr.fieldType, nodeDeps);
                    }
                }
            } else if (node.type === nodes.ThriftNodeType.Struct ||
                node.type === nodes.ThriftNodeType.Exception ||
                node.type === nodes.ThriftNodeType.Union) {
                const structLike = node;
                for (const field of structLike.fields) {
                    this.addTypeDependency(typeIndex, field.fieldType, nodeDeps);
                }
            } else if (node.type === nodes.ThriftNodeType.Const) {
                const constNode = node;
                this.addTypeDependency(typeIndex, constNode.valueType, nodeDeps);
            }

            if (nodeDeps.length > 0) {
                dependencies.set(node, nodeDeps);
            }
        }

        return dependencies;
    }

    private addTypeDependency(typeIndex: Map<string, nodes.ThriftNode>, typeStr: string | undefined, deps: nodes.ThriftNode[]): void {
        if (typeStr === undefined || typeStr === '') {
            return;
        }

        const typeMatches = typeStr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
        for (const typeName of typeMatches) {
            const dep = typeIndex.get(typeName);
            if (dep !== undefined && !deps.includes(dep)) {
                deps.push(dep);
            }
        }
    }

    /**
     * 从解析上下文中恢复解析状态。
     */
    public saveParseContext(): ParseContext {
        return {
            currentLine: this.currentLine,
            lines: this.lines,
            token: this.tokenizer
        };
    }

    /**
     * 恢复解析上下文。
     */
    public restoreParseContext(context: ParseContext): void {
        this.currentLine = context.currentLine;
        this.lines = context.lines;
        this.tokenizer = context.token;
    }

    /**
     * 带缓存的增量解析入口。
     */
    public static incrementalParseWithCache(doc: {getText(): string; uri: {toString(): string}}, dirtyRange: LineRange): IncrementalParseResult | null;
    public static incrementalParseWithCache(uri: string, content: string, dirtyRange: LineRange): IncrementalParseResult | null;
    public static incrementalParseWithCache(
        uriOrDoc: string | {getText(): string; uri: {toString(): string}},
        contentOrRange: string | LineRange,
        dirtyRange?: LineRange
    ): IncrementalParseResult | null {
        let uri: string;
        let content: string;
        let range: LineRange;
        if (typeof uriOrDoc === 'string') {
            uri = uriOrDoc;
            content = contentOrRange as string;
            range = dirtyRange!;
        } else {
            uri = uriOrDoc.uri.toString();
            content = uriOrDoc.getText();
            range = contentOrRange as LineRange;
        }
        return ThriftParser._incrementalParseWithCache(uri, content, range);
    }

    private static _incrementalParseWithCache(
        uri: string,
        content: string,
        dirtyRange: LineRange
    ): IncrementalParseResult | null {

        let fullAst = ThriftParser.getCachedAstByUriUnsafe(uri);
        if (!fullAst) {
            fullAst = parseWithAstCache(uri, content, () => {
                const parser = new ThriftParser(content);
                return parser.parse();
            });
            ThriftParser.setCachedAstByUriUnsafe(uri, fullAst);
        }

        // Determine affected range based on changes
        const parser = new ThriftParser(content);
        const affectedRange = parser.analyzeAffectedRegion(dirtyRange.startLine, dirtyRange.endLine);

        // Try to get cached AST for the affected range
        const rangeContent = parser.extractRangeContent(affectedRange.start, affectedRange.end);
        let newNodes = getCachedAstRange(uri,
            createLineRange(affectedRange.start, affectedRange.end),
            rangeContent
        );

        const affectedNodes: nodes.ThriftNode[] = [];

        newNodes ??= parser.parseRange(affectedRange.start, affectedRange.end);

        // Identify which existing nodes in the full AST overlap with the affected range
        for (const node of fullAst.body) {
            if (node.range.start.line <= affectedRange.end && node.range.end.line >= affectedRange.start) {
                affectedNodes.push(node);
            }
        }

        const incrementalResult: IncrementalParseResult = {
            ast: fullAst,
            affectedNodes: affectedNodes,
            newNodes: newNodes
        };

        const mergedAst = parser.mergeIncrementalResults(fullAst, incrementalResult);
        setCachedAstRange(uri,
            createLineRange(affectedRange.start, affectedRange.end),
            rangeContent,
            newNodes
        );
        setCachedAst(uri, content, mergedAst);
        ThriftParser.setCachedAstByUriUnsafe(uri, mergedAst);

        return {
            ...incrementalResult,
            ast: mergedAst
        };
    }

    /**
     * Helper method to extract content for a specific range
     */
    private extractRangeContent(startLine: number, endLine: number): string {
        return this.lines.slice(startLine, endLine + 1).join('\n');
    }

    /**
     * 合并增量解析结果到完整 AST 中。
     */
    public mergeIncrementalResults(
        fullAst: nodes.ThriftDocument,
        incrementalResult: IncrementalParseResult
    ): nodes.ThriftDocument {
        // If there are no new nodes, return the original AST
        if (incrementalResult.newNodes.length === 0) {
            return fullAst;
        }

        // Create a copy of the full AST to avoid modifying the original
        const updatedAst: nodes.ThriftDocument = {
            ...fullAst,
            body: [...fullAst.body]
        };

        // Remove affected nodes that will be replaced
        if (incrementalResult.affectedNodes.length > 0) {
            updatedAst.body = updatedAst.body.filter(node =>
                !incrementalResult.affectedNodes.some(affectedNode =>
                    this.rangesOverlap(affectedNode.range, node.range)
                )
            );
        }

        // Add or update the new nodes in the appropriate positions
        for (const newNode of incrementalResult.newNodes) {
            this.reparentNode(updatedAst, newNode);
            // Find the position where this node should be inserted based on line numbers
            let inserted = false;

            for (let i = 0; i < updatedAst.body.length; i++) {
                if (updatedAst.body[i].range.start.line > newNode.range.start.line) {
                    updatedAst.body.splice(i, 0, newNode);
                    inserted = true;
                    break;
                }
            }

            // If not inserted yet, append to the end
            if (!inserted) {
                updatedAst.body.push(newNode);
            }
        }

        // Re-sort the body by line number to maintain order
        updatedAst.body.sort((a, b) => a.range.start.line - b.range.start.line);

        return updatedAst;
    }

    private rangesOverlap(a: Range, b: Range): boolean {
        return a.start.line <= b.end.line && a.end.line >= b.start.line;
    }

    /**
     * 获取缓存中的 AST（按 URI，忽略内容匹配）。
     * 注意：该方法可能返回与当前文档内容不一致的 AST，仅用于增量解析等容错场景。
     */
    private static getCachedAstByUriUnsafe(uri: string): nodes.ThriftDocument | null {
        const cached = ThriftParser.astByUri.get(uri);
        if (cached && isFresh(cached.timestamp, config.cache.astMaxAgeMs)) {
            return cached.ast;
        }
        return null;
    }

    private static setCachedAstByUriUnsafe(uri: string, ast: nodes.ThriftDocument): void {
        ThriftParser.astByUri.set(uri, {ast, timestamp: Date.now()});
    }

    private static clearExpiredAstByUriCache(): void {
        const now = Date.now();
        for (const [uri, entry] of Array.from(ThriftParser.astByUri.entries())) {
            if (isExpired(entry.timestamp, config.cache.astMaxAgeMs, now)) {
                ThriftParser.astByUri.delete(uri);
            }
        }
    }

    private reparentNode(parent: nodes.ThriftNode, node: nodes.ThriftNode): void {
        node.parent = parent;
        const children = this.getChildNodes(node);
        children.forEach(child => this.reparentNode(node, child));
    }

    private getChildNodes(node: nodes.ThriftNode): nodes.ThriftNode[] {
        const result = new Set<nodes.ThriftNode>();

        if (node.children) {
            node.children.forEach(child => result.add(child));
        }

        if (node.type === nodes.ThriftNodeType.Document) {
            (node.body ?? []).forEach(child => result.add(child));
        } else if (node.type === nodes.ThriftNodeType.Enum) {
            (node.members ?? []).forEach(child => result.add(child));
        } else if (
            node.type === nodes.ThriftNodeType.Struct ||
            node.type === nodes.ThriftNodeType.Union ||
            node.type === nodes.ThriftNodeType.Exception
        ) {
            (node.fields ?? []).forEach(child => result.add(child));
        } else if (node.type === nodes.ThriftNodeType.Service) {
            (node.functions ?? []).forEach(child => result.add(child));
            (node.performs ?? []).forEach(child => result.add(child));
        } else if (node.type === nodes.ThriftNodeType.Interaction) {
            (node.functions ?? []).forEach(child => result.add(child));
        } else if (node.type === nodes.ThriftNodeType.Function) {
            (node.arguments ?? []).forEach(child => result.add(child));
            (node.throws ?? []).forEach(child => result.add(child));
        }

        return Array.from(result);
    }

    private createRange(startLine: number, startChar: number, endLine: number, endChar: number): Range {
        return new Range(startLine, startChar, endLine, endChar);
    }
}

/**
 * 顶级声明关键字集合。用于 `analyzeAffectedRegion` 上行扫描时识别脏区所属的声明。
 */
const TOP_LEVEL_DECL_KEYWORDS = new Set<string>([
    'struct', 'service', 'interaction', 'enum', 'union', 'exception'
]);

/**
 * 判断 token 流是否以顶级声明开头，即 `keyword + identifier` 模式。
 * 替代正则 `/\b(struct|service|interaction|enum|union|exception)\s+\w+/`。
 */
function isTopLevelDeclaration(tokens: Token[]): boolean {
    for (let i = 0; i < tokens.length - 1; i++) {
        const t = tokens[i];
        if (t.type === 'identifier' && TOP_LEVEL_DECL_KEYWORDS.has(t.value)) {
            const next = tokens[i + 1];
            if (next.type === 'identifier') {
                return true;
            }
        }
    }
    return false;
}

/**
 * 检查 token 流中是否包含某个 symbol。复用一次性遍历，避免对原始字符串再做 `match` / `includes`，
 * 也能自动忽略字符串字面量内出现的同名字符。
 */
function hasSymbolToken(tokens: Token[], value: string): boolean {
    for (const t of tokens) {
        if (t.type === 'symbol' && t.value === value) {
            return true;
        }
    }
    return false;
}

/**
 * 判断最后一个有效 token 是否是语句终止符 (`;` 或 `,`)。
 * 替代 `text.trim().endsWith(';')` / `endsWith(',')` —— 字符串字面量内的标点不会被误判。
 */
function endsWithStatementTerminator(tokens: Token[]): boolean {
    const last = tokens[tokens.length - 1];
    if (last === undefined || last.type !== 'symbol') {
        return false;
    }
    return last.value === ';' || last.value === ',';
}
