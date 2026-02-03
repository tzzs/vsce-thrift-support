import * as vscode from 'vscode';
import * as nodes from './nodes.types';
import {config} from '../config';
import {
    clearAstCacheForDocument,
    clearExpiredAstCache,
    parseWithAstCache,
    getCachedAstRange,
    setCachedAstRange,
    setCachedAst
} from './cache';
import {LineRange} from '../utils/line-range';
import {isFresh, isExpired} from '../utils/cache-expiry';
import {
    buildConstValueRange,
    findDefaultValueRange,
    findInitializerRange,
    findNameRangeInLine,
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
import {ThriftTokenizer, Token} from './tokenizer';

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
    token: any;
}

export class ThriftParser {
    private static astByUri = new Map<string, { ast: nodes.ThriftDocument; timestamp: number }>();
    private text: string;
    private lines: string[];
    private currentLine: number = 0;
    private tokenizer: ThriftTokenizer;

    constructor(documentOrContent: vscode.TextDocument | string) {
        if (typeof documentOrContent === 'string') {
            this.text = documentOrContent;
        } else {
            this.text = documentOrContent.getText();
        }
        this.lines = this.text.split(/\r?\n/);
        this.tokenizer = new ThriftTokenizer();
    }

    /**
     * 带缓存的解析入口（基于文档内容）。
     */
    public static parseWithCache(document: vscode.TextDocument): nodes.ThriftDocument {
        const uri = document.uri.toString();
        const content = document.getText();
        const ast = parseWithAstCache(uri, content, () => {
            const parser = new ThriftParser(content);
            return parser.parse();
        });
        ThriftParser.setCachedAstByUriUnsafe(uri, ast);
        return ast;
    }

    /**
     * 带缓存的解析入口（基于 URI 与内容）。
     */
    public static parseContentWithCache(uri: string, content: string): nodes.ThriftDocument {
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
        const root: nodes.ThriftDocument = {
            type: nodes.ThriftNodeType.Document,
            range: new vscode.Range(0, 0, this.lines.length > 0 ? this.lines.length - 1 : 0,
                this.lines.length > 0 ? this.lines[this.lines.length - 1].length : 0),
            body: []
        };

        this.currentLine = 0;
        while (this.currentLine < this.lines.length) {
            const node = this.parseNextNode(root);
            if (node) {
                root.body.push(node);
                this.addChild(root, node);
            }
        }

        return root;
    }

    /**
     * 解析文档的一部分，并将其集成到现有AST中
     */
    public parseSection(startLine: number, endLine: number, existingAst?: nodes.ThriftDocument): nodes.ThriftDocument {
        // If no existing AST is provided, create a new one
        const ast: nodes.ThriftDocument = existingAst || {
            type: nodes.ThriftNodeType.Document,
            range: new vscode.Range(0, 0, this.lines.length > 0 ? this.lines.length - 1 : 0,
                this.lines.length > 0 ? this.lines[this.lines.length - 1].length : 0),
            body: []
        };

        // Save current state
        const originalCurrentLine = this.currentLine;

        // Parse the specific section
        this.currentLine = startLine;
        while (this.currentLine <= endLine && this.currentLine < this.lines.length) {
            const node = this.parseNextNode(ast);
            if (node) {
                ast.body = ast.body.filter(existing =>
                    !(existing.range.start.line <= node.range.end.line &&
                      existing.range.end.line >= node.range.start.line)
                );
                ast.body.push(node);
                this.addChild(ast, node);
            }
        }

        // Restore original state
        this.currentLine = originalCurrentLine;

        return ast;
    }

    private ensureChildren(node: nodes.ThriftNode): nodes.ThriftNode[] {
        if (!node.children) {
            node.children = [];
        }
        return node.children;
    }

    private addChild(parent: nodes.ThriftNode, child: nodes.ThriftNode): void {
        const children = this.ensureChildren(parent);
        if (!children.includes(child)) {
            children.push(child);
        }
    }

    private scanLine(line: string): { stripped: string; tokens: Token[] } {
        const scan = this.tokenizer.scanLine(line);
        return {
            stripped: scan.stripped,
            tokens: filterMeaningfulTokens(scan.tokens)
        };
    }

    private countBraces(tokens: Token[]): { open: number; close: number } {
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
                    range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
                    nameRange: new vscode.Range(this.currentLine, namespace.startOffset, this.currentLine, namespace.endOffset),
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
            if (pathToken && pathToken.type === 'string') {
                const node: nodes.Include = {
                    type: nodes.ThriftNodeType.Include,
                    range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
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
                const extendsIndex = findIdentifierIndex(tokens, 'extends', nameToken.index + 1);
                if (extendsIndex !== -1) {
                    const parentName = readQualifiedIdentifier(tokens, extendsIndex + 1);
                    if (parentName) {
                        extendsName = parentName.value;
                    }
                }
                return this.parseService(parent, nameToken.value, extendsName);
            }
            const invalid = this.createInvalidNode(parent, line, 'Invalid service declaration');
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
                    range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
                    nameRange: new vscode.Range(this.currentLine, nameToken.start, this.currentLine, nameToken.end),
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
            range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
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

        const structNode: nodes.Struct = {
            type: type,
            name: name,
            range: new vscode.Range(startLine, 0, startLine, 0), // Will be updated
            nameRange: findWordRangeInLine(line, startLine, name, searchStart),
            parent: parent,
            fields: []
        };

        // Parse body
        this.currentLine = this.parseStructBody(structNode);
        structNode.range = new vscode.Range(startLine, 0, this.currentLine,
            this.lines[this.currentLine] ? this.lines[this.currentLine].length : 0);
        return structNode;
    }

    private parseStructBody(parent: nodes.Struct): number {
        let braceCount = 0;
        // Find opening brace
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

        // Parse fields until closing brace
        while (this.currentLine < this.lines.length && braceCount > 0) {
            const line = this.lines[this.currentLine];
            const scan = this.scanLine(line);
            const trimmed = scan.stripped.trim();

            const braceStats = this.countBraces(scan.tokens);
            if (braceStats.open > 0 || braceStats.close > 0) {
                braceCount += braceStats.open - braceStats.close;
                if (braceCount <= 0) {
                    this.currentLine++;
                    break;
                }
            }

            const field = this.parseStructFieldLine(parent, line, scan.stripped, scan.tokens);
            if (field) {
                parent.fields.push(field);
                this.addChild(parent, field);
            }

            this.currentLine++;
        }

        return this.currentLine;
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
        if (!typeStartToken) {
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
        const nameRange = new vscode.Range(
            this.currentLine,
            nameToken.start,
            this.currentLine,
            nameToken.end
        );
        const typeRange = new vscode.Range(
            this.currentLine,
            typeStartToken.start,
            this.currentLine,
            nameToken.start
        );
        const defaultInfo = findDefaultValueRange(valueTarget);
        const defaultStart = defaultInfo ? defaultInfo.start : null;
        const defaultEnd = defaultInfo ? defaultInfo.end : null;
        return {
            type: nodes.ThriftNodeType.Field,
            range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
            nameRange,
            typeRange,
            parent: parent,
            id: parseInt(tokens[idIndex].value, 10),
            requiredness,
            fieldType,
            name: nameToken.value,
            defaultValue: defaultInfo?.value,
            defaultValueRange: defaultStart !== null && defaultEnd !== null
                ? new vscode.Range(this.currentLine, defaultStart, this.currentLine, defaultEnd)
                : undefined
        };
    }

    private parseStructFieldLineFallback(parent: nodes.Struct, line: string, cleanLine: string): nodes.Field | null {
        const trimmed = cleanLine.trim();
        const codeStart = cleanLine.indexOf(trimmed);
        const fieldMatch = trimmed.match(/^(\d+):\s*(?:(required|optional)\s+)?([a-zA-Z0-9_<>.,\s]+)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (!fieldMatch) {
            return null;
        }
        const valueTarget = stripTrailingAnnotation(cleanLine.replace(/[,;]\s*$/, ''));
        const nameRange = findNameRangeInLine(cleanLine, this.currentLine, fieldMatch[4], trimmed);
        const typeRange = findTypeRangeInLine(cleanLine, this.currentLine, fieldMatch[3].trim(), codeStart);
        const defaultInfo = findDefaultValueRange(valueTarget);
        const defaultStart = defaultInfo ? defaultInfo.start : null;
        const defaultEnd = defaultInfo ? defaultInfo.end : null;
        return {
            type: nodes.ThriftNodeType.Field,
            range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
            nameRange,
            typeRange,
            parent: parent,
            id: parseInt(fieldMatch[1], 10),
            requiredness: fieldMatch[2] as 'required' | 'optional',
            fieldType: fieldMatch[3].trim(),
            name: fieldMatch[4],
            defaultValue: defaultInfo?.value,
            defaultValueRange: defaultStart !== null && defaultEnd !== null
                ? new vscode.Range(this.currentLine, defaultStart, this.currentLine, defaultEnd)
                : undefined
        };
    }

    private parseEnum(parent: nodes.ThriftNode, name: string, isSenum: boolean): nodes.Enum {
        const startLine = this.currentLine;
        const line = this.lines[startLine];
        const keywordIndex = line.indexOf(isSenum ? 'senum' : 'enum');
        const searchStart = keywordIndex >= 0 ? keywordIndex + (isSenum ? 'senum'.length : 'enum'.length) : 0;
        const enumNode: nodes.Enum = {
            type: nodes.ThriftNodeType.Enum,
            name: name,
            range: new vscode.Range(startLine, 0, startLine, 0), // Will be updated
            nameRange: findWordRangeInLine(line, startLine, name, searchStart),
            parent: parent,
            members: [],
            isSenum: isSenum
        };

        // Parse body
        this.currentLine = this.parseEnumBody(enumNode);
        enumNode.range = new vscode.Range(startLine, 0, this.currentLine,
            this.lines[this.currentLine] ? this.lines[this.currentLine].length : 0);
        return enumNode;
    }

    private parseEnumBody(parent: nodes.Enum): number {
        let braceCount = 0;
        // Find opening brace
        while (this.currentLine < this.lines.length) {
            const line = this.lines[this.currentLine];
            const scan = this.scanLine(line);
            if (scan.stripped.includes('{')) {
                braceCount++;
                break;
            }
            this.currentLine++;
        }

        this.currentLine++; // Move past opening brace

        // Parse members until closing brace
        while (this.currentLine < this.lines.length && braceCount > 0) {
            const line = this.lines[this.currentLine];
            const scan = this.scanLine(line);
            const trimmed = scan.stripped.trim();

            if (trimmed.includes('{')) {
                braceCount++;
            }
            if (trimmed.includes('}')) {
                braceCount--;
                if (braceCount <= 0) {
                    this.currentLine++;
                    break;
                }
            }

            const member = this.parseEnumMemberLine(parent, line, scan.stripped, scan.tokens);
            if (member) {
                parent.members.push(member);
                this.addChild(parent, member);
            }

            this.currentLine++;
        }

        return this.currentLine;
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
        let initializerRange: vscode.Range | undefined;
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
                if (startOffset === null) {
                    startOffset = token.start;
                }
                endOffset = token.end;
            }
            if (startOffset !== null && endOffset !== null) {
                const rawInitializer = cleanLine.slice(startOffset, endOffset).trim();
                const trimmed = stripTrailingAnnotation(rawInitializer.replace(/[,;]\s*$/, '')).trim();
                initializer = trimmed || undefined;
                if (initializer) {
                    initializerRange = new vscode.Range(
                        this.currentLine,
                        startOffset,
                        this.currentLine,
                        endOffset
                    );
                }
            }
        }
        if (!initializerRange) {
            initializerRange = findInitializerRange(cleanLine, cleanLine, initializer, this.currentLine);
        }
        const nameRange = new vscode.Range(
            this.currentLine,
            nameToken.start,
            this.currentLine,
            nameToken.end
        );
        return {
            type: nodes.ThriftNodeType.EnumMember,
            range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
            nameRange,
            parent: parent,
            name: nameToken.value,
            initializer,
            initializerRange
        };
    }

    private parseService(parent: nodes.ThriftNode, name: string, extendsClass: string | undefined): nodes.Service {
        const startLine = this.currentLine;
        const line = this.lines[startLine];
        const keywordIndex = line.indexOf('service');
        const searchStart = keywordIndex >= 0 ? keywordIndex + 'service'.length : 0;
        const serviceNode: nodes.Service = {
            type: nodes.ThriftNodeType.Service,
            name: name,
            extends: extendsClass,
            range: new vscode.Range(startLine, 0, startLine, 0), // Will be updated
            nameRange: findWordRangeInLine(line, startLine, name, searchStart),
            parent: parent,
            functions: []
        };

        // Parse body
        this.currentLine = this.parseServiceBody(serviceNode);
        serviceNode.range = new vscode.Range(startLine, 0, this.currentLine,
            this.lines[this.currentLine] ? this.lines[this.currentLine].length : 0);
        return serviceNode;
    }

    private parseServiceBody(parent: nodes.Service): number {
        let braceCount = 0;
        // Find opening brace
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

        // Parse functions until closing brace
        while (this.currentLine < this.lines.length && braceCount > 0) {
            const line = this.lines[this.currentLine];
            const scan = this.scanLine(line);
            const trimmed = scan.stripped.trim();

            const braceStats = this.countBraces(scan.tokens);
            if (braceStats.open > 0 || braceStats.close > 0) {
                braceCount += braceStats.open - braceStats.close;
                if (braceCount <= 0) {
                    this.currentLine++;
                    break;
                }
            }

            const funcParsed = this.parseServiceFunctionLine(line, scan.stripped, scan.tokens);
            if (funcParsed) {
                const {
                    name,
                    returnType,
                    nameRange,
                    returnTypeRange,
                    oneway,
                    funcStartLine,
                    funcStartChar
                } = funcParsed;
                let funcEndLine = funcParsed.funcEndLine;
                let funcEndChar = funcParsed.funcEndChar;

                // Parse function arguments
                const args: nodes.Field[] = [];
                const throwsFields: nodes.Field[] = [];

                const parenStartPos = line.indexOf('(');
                let argResult: { text: string; endLine: number; endChar: number } | null = null;
                if (parenStartPos !== -1) {
                    argResult = readParenthesizedText(this.lines, this.currentLine, parenStartPos + 1);
                    if (argResult) {
                        args.push(...parseFieldList(argResult.text, this.currentLine, parenStartPos + 1));
                    }
                }

                // Find the end of the function declaration (either , or ; or {)
                let parenCount = 0;
                let foundEnd = false;
                if (argResult) {
                    funcEndLine = argResult.endLine;
                    funcEndChar = this.lines[argResult.endLine] ? this.lines[argResult.endLine].length : 0;
                }

                // Look for the end of function declaration on the same line first
                for (let i = funcStartChar; i < line.length; i++) {
                    const char = line[i];
                    if (char === '(') {
                        parenCount++;
                    } else if (char === ')') {
                        parenCount--;
                        if (parenCount === 0) {
                            // Look for throws clause or end of declaration
                            let j = i + 1;
                            while (j < line.length && /\s/.test(line[j])) {
                                j++;
                            } // Skip whitespace

                            // Check if there's a throws clause
                            if (line.substring(j, j + 6) === 'throws') {
                                // Find the end of throws clause
                                let throwsParenCount = 0;
                                for (let k = j + 6; k < line.length; k++) {
                                    if (line[k] === '(') {
                                        throwsParenCount++;
                                    } else if (line[k] === ')') {
                                        throwsParenCount--;
                                        if (throwsParenCount === 0) {
                                            j = k + 1;
                                            break;
                                        }
                                    }
                                }
                            }

                            // Find the end of the declaration
                            while (j < line.length && /\s/.test(line[j])) {
                                j++;
                            } // Skip whitespace
                            if (j < line.length && (line[j] === ',' || line[j] === ';' || line[j] === '{')) {
                                funcEndChar = j + 1;
                                foundEnd = true;
                                break;
                            }
                        }
                    }
                }

                // If not found on the same line, look on subsequent lines
                if (!foundEnd) {
                    let searchLine = funcStartLine + 1;
                    while (searchLine < this.lines.length && !foundEnd) {
                        const searchLineText = this.lines[searchLine];
                        for (let i = 0; i < searchLineText.length; i++) {
                            const char = searchLineText[i];
                            if (char === '(') {
                                parenCount++;
                            } else if (char === ')') {
                                parenCount--;
                                if (parenCount === 0) {
                                    // Look for throws clause or end of declaration
                                    let j = i + 1;
                                    while (j < searchLineText.length && /\s/.test(searchLineText[j])) {
                                        j++;
                                    } // Skip whitespace

                                    // Check if there's a throws clause
                                    if (searchLineText.substring(j, j + 6) === 'throws') {
                                        // Find the end of throws clause
                                        let throwsParenCount = 0;
                                        for (let k = j + 6; k < searchLineText.length; k++) {
                                            if (searchLineText[k] === '(') {
                                                throwsParenCount++;
                                            } else if (searchLineText[k] === ')') {
                                                throwsParenCount--;
                                                if (throwsParenCount === 0) {
                                                    j = k + 1;
                                                    break;
                                                }
                                            }
                                        }
                                    }

                                    // Find the end of the declaration
                                    while (j < searchLineText.length && /\s/.test(searchLineText[j])) {
                                        j++;
                                    } // Skip whitespace
                                    if (j < searchLineText.length && (searchLineText[j] === ',' || searchLineText[j] === ';' || searchLineText[j] === '{')) {
                                        funcEndLine = searchLine;
                                        funcEndChar = j + 1;
                                        foundEnd = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if (!foundEnd) {
                            searchLine++;
                        }
                    }
                }

                const throwsStart = findThrowsStartInRange(
                    this.lines,
                    argResult ? argResult.endLine : funcStartLine,
                    argResult ? argResult.endChar + 1 : Math.max(parenStartPos + 1, funcStartChar),
                    funcEndLine,
                    funcEndChar
                );
                let throwsResult: { text: string; endLine: number; endChar: number } | null = null;
                if (throwsStart) {
                    throwsResult = readParenthesizedText(this.lines, throwsStart.line, throwsStart.char + 1);
                    if (throwsResult) {
                        throwsFields.push(...parseFieldList(throwsResult.text, throwsStart.line, throwsStart.char + 1));
                    }
                }
                if (throwsResult) {
                    funcEndLine = Math.max(funcEndLine, throwsResult.endLine);
                    funcEndChar = throwsResult.endChar;
                } else if (argResult) {
                    funcEndLine = Math.max(funcEndLine, argResult.endLine);
                    funcEndChar = argResult.endChar;
                }

                const funcNode: nodes.ThriftFunction = {
                    type: nodes.ThriftNodeType.Function,
                    range: new vscode.Range(funcStartLine, funcStartChar, funcEndLine, funcEndChar),
                    nameRange,
                    parent: parent,
                    name,
                    returnType,
                    returnTypeRange,
                    oneway,
                    arguments: args,
                    throws: throwsFields
                };

                // Set parent for all arguments
                args.forEach(arg => {
                    arg.parent = funcNode;
                    this.addChild(funcNode, arg);
                });
                throwsFields.forEach(field => {
                    field.parent = funcNode;
                    this.addChild(funcNode, field);
                });

                parent.functions.push(funcNode);
                this.addChild(parent, funcNode);
            }

            this.currentLine++;
        }

        return this.currentLine;
    }

    private parseServiceFunctionLine(line: string, cleanLine: string, tokens: Token[]): {
        name: string;
        returnType: string;
        nameRange: vscode.Range | undefined;
        returnTypeRange: vscode.Range | undefined;
        oneway: boolean;
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
        const returnTypeStartIndex = oneway ? 1 : 0;
        const returnTypeStartToken = tokens[returnTypeStartIndex];
        if (!returnTypeStartToken || returnTypeStartIndex >= nameTokenIndex) {
            return null;
        }
        const nameToken = tokens[nameTokenIndex];
        const returnType = cleanLine.slice(returnTypeStartToken.start, nameToken.start).trim();
        if (!returnType) {
            return this.parseServiceFunctionLineFallback(line, cleanLine);
        }
        const funcStartLine = this.currentLine;
        const funcStartChar = returnTypeStartToken.start;
        const nameRange = new vscode.Range(
            funcStartLine,
            nameToken.start,
            funcStartLine,
            nameToken.end
        );
        const returnTypeRange = new vscode.Range(
            funcStartLine,
            returnTypeStartToken.start,
            funcStartLine,
            nameToken.start
        );
        return {
            name: nameToken.value,
            returnType,
            nameRange,
            returnTypeRange,
            oneway,
            funcStartLine,
            funcStartChar,
            funcEndLine: funcStartLine,
            funcEndChar: line.length
        };
    }

    private parseServiceFunctionLineFallback(line: string, cleanLine: string): {
        name: string;
        returnType: string;
        nameRange: vscode.Range | undefined;
        returnTypeRange: vscode.Range | undefined;
        oneway: boolean;
        funcStartLine: number;
        funcStartChar: number;
        funcEndLine: number;
        funcEndChar: number;
    } | null {
        const trimmed = cleanLine.trim();
        const funcMatch = trimmed.match(/^(?:(oneway)\s+)?([a-zA-Z0-9_<>.,\s]+)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
        if (!funcMatch) {
            return null;
        }
        const funcStartLine = this.currentLine;
        const funcStartChar = cleanLine.indexOf(funcMatch[0]);
        const nameRange = findWordRangeInLine(cleanLine, funcStartLine, funcMatch[3], funcStartChar);
        const returnTypeRange = findTypeRangeInLine(cleanLine, funcStartLine, funcMatch[2].trim(), funcStartChar);
        return {
            name: funcMatch[3],
            returnType: funcMatch[2].trim(),
            nameRange,
            returnTypeRange,
            oneway: !!funcMatch[1],
            funcStartLine,
            funcStartChar,
            funcEndLine: funcStartLine,
            funcEndChar: line.length
        };
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
        let inS = false;
        let inD = false;
        let escaped = false;
        let eqLine = -1;
        let eqChar = -1;

        while (endLine < this.lines.length) {
            const line = this.lines[endLine];
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (inS) {
                    if (!escaped && ch === '\\') {
                        escaped = true;
                        continue;
                    }
                    if (!escaped && ch === '\'') {
                        inS = false;
                    }
                    escaped = false;
                    continue;
                }
                if (inD) {
                    if (!escaped && ch === '\\') {
                        escaped = true;
                        continue;
                    }
                    if (!escaped && ch === '"') {
                        inD = false;
                    }
                    escaped = false;
                    continue;
                }
                if (ch === '\'') {
                    inS = true;
                    continue;
                }
                if (ch === '"') {
                    inD = true;
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
            range: new vscode.Range(startLine, 0, endLine, this.lines[endLine] ? this.lines[endLine].length : 0),
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
                const tempParent: nodes.ThriftNode = {
                    type: nodes.ThriftNodeType.Document,
                    range: new vscode.Range(actualStartLine, 0, actualEndLine,
                        this.lines[actualEndLine] ? this.lines[actualEndLine].length : 0),
                    body: [],
                    parent: undefined
                };

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
     */
    public analyzeAffectedRegion(startLine: number, endLine: number): { start: number; end: number } {
        // Start with the initial range
        let affectedStart = startLine;
        let affectedEnd = endLine;

        // Expand upward to capture multi-line constructs that might be affected
        // For example, if we modify the middle of a struct, we need to capture the whole struct
        for (let line = startLine; line >= 0 && line > startLine - 50; line--) { // Limit expansion for performance
            const text = this.lines[line];
            if (text && (text.trim().match(/\b(struct|service|enum|union|exception)\s+\w+/) ||
                         text.trim().includes('{'))) {
                // Found a top-level construct definition
                affectedStart = line;

                // Now expand downward to find the end of this construct
                let braceDepth = 0;
                for (let searchLine = line; searchLine < this.lines.length && searchLine < line + 100; searchLine++) {
                    const searchText = this.lines[searchLine];
                    const openBraces = (searchText.match(/{/g) || []).length;
                    const closeBraces = (searchText.match(/}/g) || []).length;
                    braceDepth += openBraces - closeBraces;

                    if (braceDepth <= 0) {
                        affectedEnd = Math.max(affectedEnd, searchLine);
                        break;
                    }
                }
                break;
            }
        }

        // Expand downward to capture continuation of constructs that might span multiple lines
        for (let line = endLine; line < this.lines.length && line < endLine + 20; line++) {
            const text = this.lines[line];
            if (text && (text.includes('}') || text.trim().endsWith(';') || text.trim().endsWith(','))) {
                affectedEnd = line;
                break;
            }
        }

        return { start: affectedStart, end: affectedEnd };
    }

    /**
     * 分析 AST 节点之间的依赖关系。
     */
    public analyzeDependencies(ast: nodes.ThriftDocument): Map<nodes.ThriftNode, nodes.ThriftNode[]> {
        const dependencies = new Map<nodes.ThriftNode, nodes.ThriftNode[]>();

        // Simple dependency analysis: identify references between nodes
        // For example, if a service uses a struct, the service depends on the struct
        for (const node of ast.body) {
            const nodeDeps: nodes.ThriftNode[] = [];

            // Look for type references in the node content
            if (node.type === nodes.ThriftNodeType.Service) {
                const service = node as nodes.Service;
                for (const func of service.functions) {
                    // Find dependencies in function return types and argument types
                    this.addTypeDependency(ast, func.returnType, nodeDeps);
                    for (const arg of func.arguments) {
                        this.addTypeDependency(ast, arg.fieldType, nodeDeps);
                    }
                    for (const thr of func.throws) {
                        this.addTypeDependency(ast, thr.fieldType, nodeDeps);
                    }
                }
            } else if (node.type === nodes.ThriftNodeType.Struct ||
                      node.type === nodes.ThriftNodeType.Exception ||
                      node.type === nodes.ThriftNodeType.Union) {
                const structLike = node as nodes.Struct;
                for (const field of structLike.fields) {
                    this.addTypeDependency(ast, field.fieldType, nodeDeps);
                }
            } else if (node.type === nodes.ThriftNodeType.Const) {
                const constNode = node as nodes.Const;
                this.addTypeDependency(ast, constNode.valueType, nodeDeps);
            }

            if (nodeDeps.length > 0) {
                dependencies.set(node, nodeDeps);
            }
        }

        return dependencies;
    }

    private addTypeDependency(ast: nodes.ThriftDocument, typeStr: string | undefined, deps: nodes.ThriftNode[]): void {
        if (!typeStr) return;

        // Extract potential type names from typeStr (handles complex types like list<string>, map<i32, string>, etc.)
        const typeMatches = typeStr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
        for (const typeName of typeMatches) {
            // Look for nodes with matching names
            for (const potentialDep of ast.body) {
                if (potentialDep.name === typeName &&
                    (potentialDep.type === nodes.ThriftNodeType.Struct ||
                     potentialDep.type === nodes.ThriftNodeType.Enum ||
                     potentialDep.type === nodes.ThriftNodeType.Typedef ||
                     potentialDep.type === nodes.ThriftNodeType.Service)) {
                    if (!deps.includes(potentialDep)) {
                        deps.push(potentialDep);
                    }
                }
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
    public static incrementalParseWithCache(
        document: vscode.TextDocument,
        dirtyRange: LineRange
    ): IncrementalParseResult | null {
        const uri = document.uri.toString();
        const content = document.getText();

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
            { startLine: affectedRange.start, endLine: affectedRange.end },
            rangeContent
        );

        let affectedNodes: nodes.ThriftNode[] = [];

        if (!newNodes) {
            // Parse the affected range if not in cache
            newNodes = parser.parseRange(affectedRange.start, affectedRange.end);
        }

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
            { startLine: affectedRange.start, endLine: affectedRange.end },
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
        if (!incrementalResult.newNodes || incrementalResult.newNodes.length === 0) {
            return fullAst;
        }

        // Create a copy of the full AST to avoid modifying the original
        const updatedAst: nodes.ThriftDocument = {
            ...fullAst,
            body: [...fullAst.body]
        };

        // Remove affected nodes that will be replaced
        if (incrementalResult.affectedNodes && incrementalResult.affectedNodes.length > 0) {
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

    private rangesOverlap(a: vscode.Range, b: vscode.Range): boolean {
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
        ThriftParser.astByUri.set(uri, { ast, timestamp: Date.now() });
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
        } else if (node.type === nodes.ThriftNodeType.Function) {
            (node.arguments ?? []).forEach(child => result.add(child));
            (node.throws ?? []).forEach(child => result.add(child));
        }

        return Array.from(result);
    }
}
