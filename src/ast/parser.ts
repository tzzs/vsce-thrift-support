import * as vscode from 'vscode';
import * as nodes from './nodes';
import { config } from '../config';

// AST缓存机制 - 避免重复解析相同内容
interface ASTCacheEntry {
    content: string;
    ast: nodes.ThriftDocument;
    timestamp: number;
}

const astCache = new Map<string, ASTCacheEntry>();
const CACHE_MAX_AGE = config.cache.astMaxAgeMs;

export class ThriftParser {
    private text: string;
    private lines: string[];
    private currentLine: number = 0;

    constructor(documentOrContent: vscode.TextDocument | string) {
        if (typeof documentOrContent === 'string') {
            this.text = documentOrContent;
        } else {
            this.text = documentOrContent.getText();
        }
        this.lines = this.text.split(/\r?\n/);
    }

    /**
     * 带缓存的解析入口（基于文档内容）。
     */
    public static parseWithCache(document: vscode.TextDocument): nodes.ThriftDocument {
        const uri = document.uri.toString();
        const content = document.getText();
        const now = Date.now();

        // 检查缓存
        const cached = astCache.get(uri);
        if (cached && cached.content === content && (now - cached.timestamp) < CACHE_MAX_AGE) {
            return cached.ast;
        }

        // 解析并缓存
        const parser = new ThriftParser(content);
        const ast = parser.parse();

        astCache.set(uri, {
            content,
            ast,
            timestamp: now
        });

        return ast;
    }

    /**
     * 带缓存的解析入口（基于 URI 与内容）。
     */
    public static parseContentWithCache(uri: string, content: string): nodes.ThriftDocument {
        const now = Date.now();

        // 检查缓存
        const cached = astCache.get(uri);
        if (cached && cached.content === content && (now - cached.timestamp) < CACHE_MAX_AGE) {
            return cached.ast;
        }

        // 解析并缓存
        const parser = new ThriftParser(content);
        const ast = parser.parse();

        astCache.set(uri, {
            content,
            ast,
            timestamp: now
        });

        return ast;
    }

    /**
     * 清理过期 AST 缓存。
     */
    public static clearExpiredCache(): void {
        const now = Date.now();
        for (const [uri, entry] of astCache.entries()) {
            if (now - entry.timestamp > CACHE_MAX_AGE) {
                astCache.delete(uri);
            }
        }
    }

    /**
     * 清理指定文档的 AST 缓存。
     */
    public static clearDocumentCache(uri: string): void {
        astCache.delete(uri);
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
            }
        }

        return root;
    }

    private parseNextNode(parent: nodes.ThriftNode): nodes.ThriftNode | null {
        if (this.currentLine >= this.lines.length) {
            return null;
        }

        const line = this.lines[this.currentLine];
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
            this.currentLine++;
            return null;
        }

        // Namespace
        const namespaceMatch = trimmed.match(/^namespace\s+([a-zA-Z0-9_.]+)\s+([a-zA-Z0-9_.]+)/);
        if (namespaceMatch) {
            const scopeIndex = line.indexOf(namespaceMatch[1]);
            const searchStart = scopeIndex >= 0 ? scopeIndex + namespaceMatch[1].length : 0;
            const node: nodes.Namespace = {
                type: nodes.ThriftNodeType.Namespace,
                range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
                nameRange: this.findWordRangeInLine(line, this.currentLine, namespaceMatch[2], searchStart),
                parent: parent,
                scope: namespaceMatch[1],
                namespace: namespaceMatch[2],
                name: namespaceMatch[2]
            };
            this.currentLine++;
            return node;
        }

        // Include
        const includeMatch = trimmed.match(/^include\s+['"](.+)['"]/);
        if (includeMatch) {
            const node: nodes.Include = {
                type: nodes.ThriftNodeType.Include,
                range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
                parent: parent,
                path: includeMatch[1],
                name: includeMatch[1]
            };
            this.currentLine++;
            return node;
        }

        // Struct, Union, Exception
        const structMatch = trimmed.match(/^(struct|union|exception)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (structMatch) {
            return this.parseStruct(parent, structMatch[1], structMatch[2]);
        }

        // Enum / Senum
        const enumMatch = trimmed.match(/^(enum|senum)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (enumMatch) {
            return this.parseEnum(parent, enumMatch[2], enumMatch[1] === 'senum');
        }

        // Service
        const serviceMatch = trimmed.match(/^service\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+extends\s+([a-zA-Z_][a-zA-Z0-9_.]*))?/);
        if (serviceMatch) {
            return this.parseService(parent, serviceMatch[1], serviceMatch[2]);
        }

        // Const
        const constSig = this.parseConstSignature(trimmed);
        if (constSig) {
            return this.parseConst(parent, constSig.valueType, constSig.name);
        }

        // Typedef
        const typedefMatch = trimmed.match(/^typedef\s+(.+)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (typedefMatch) {
            const keywordIndex = line.indexOf('typedef');
            const searchStart = keywordIndex >= 0 ? keywordIndex + 'typedef'.length : 0;
            const node: nodes.Typedef = {
                type: nodes.ThriftNodeType.Typedef,
                range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
                nameRange: this.findWordRangeInLine(line, this.currentLine, typedefMatch[2], searchStart),
                parent: parent,
                aliasType: typedefMatch[1],
                name: typedefMatch[2]
            };
            this.currentLine++;
            return node;
        }

        // Skip unrecognized lines
        this.currentLine++;
        return null;
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
            nameRange: this.findWordRangeInLine(line, startLine, name, searchStart),
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
            if (line.includes('{')) {
                braceCount++;
                break;
            }
            this.currentLine++;
        }

        this.currentLine++; // Move past opening brace

        // Parse fields until closing brace
        while (this.currentLine < this.lines.length && braceCount > 0) {
            const line = this.lines[this.currentLine];
            const trimmed = line.trim();

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

            const codeOnly = this.stripLineComments(trimmed);
            // Field regex: 1: optional string name,
            const fieldMatch = codeOnly.match(/^(\d+):\s*(?:(required|optional)\s+)?([a-zA-Z0-9_<>.,\s]+)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (fieldMatch) {
                const nameRange = this.findNameRangeInLine(line, this.currentLine, fieldMatch[4], codeOnly);
                const field: nodes.Field = {
                    type: nodes.ThriftNodeType.Field,
                    range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
                    nameRange,
                    parent: parent,
                    id: parseInt(fieldMatch[1]),
                    requiredness: fieldMatch[2] as 'required' | 'optional',
                    fieldType: fieldMatch[3].trim(),
                    name: fieldMatch[4]
                };

                // Check for default value (ignore trailing annotations)
                const valueTarget = this.stripTrailingAnnotation(codeOnly.replace(/[,;]\s*$/, ''));
                const defaultValueMatch = valueTarget.match(/=\s*([^,;]+)/);
                if (defaultValueMatch) {
                    field.defaultValue = defaultValueMatch[1].trim();
                }

                parent.fields.push(field);
            }

            this.currentLine++;
        }

        return this.currentLine;
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
            nameRange: this.findWordRangeInLine(line, startLine, name, searchStart),
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
            if (line.includes('{')) {
                braceCount++;
                break;
            }
            this.currentLine++;
        }

        this.currentLine++; // Move past opening brace

        // Parse members until closing brace
        while (this.currentLine < this.lines.length && braceCount > 0) {
            const line = this.lines[this.currentLine];
            const trimmed = line.trim();

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

            const codeOnly = this.stripLineComments(trimmed);
            // Enum Member: NAME = 1, or just NAME,
            const memberMatch = codeOnly.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=\s*([^,;]+))?/);
            if (memberMatch && codeOnly && !codeOnly.startsWith('//')) {
                const nameRange = this.findNameRangeInLine(line, this.currentLine, memberMatch[1], codeOnly);
                const member: nodes.EnumMember = {
                    type: nodes.ThriftNodeType.EnumMember,
                    range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
                    nameRange,
                    parent: parent,
                    name: memberMatch[1],
                    initializer: memberMatch[2]
                };
                parent.members.push(member);
            }

            this.currentLine++;
        }

        return this.currentLine;
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
            nameRange: this.findWordRangeInLine(line, startLine, name, searchStart),
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
            if (line.includes('{')) {
                braceCount++;
                break;
            }
            this.currentLine++;
        }

        this.currentLine++; // Move past opening brace

        // Parse functions until closing brace
        while (this.currentLine < this.lines.length && braceCount > 0) {
            const line = this.lines[this.currentLine];
            const trimmed = line.trim();

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

            // Function: type name(args) throws (exceptions)
            // Simplified match: just look for return type and name and parens
            const funcMatch = trimmed.match(/^(?:(oneway)\s+)?([a-zA-Z0-9_<>.,\s]+)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
            if (funcMatch) {
                // Calculate more accurate range for the function declaration
                const funcStartLine = this.currentLine;
                const funcStartChar = line.indexOf(funcMatch[0]); // Start from the beginning of the function match
                const funcNameRange = this.findWordRangeInLine(line, funcStartLine, funcMatch[3], funcStartChar);

                // Parse function arguments
                const args: nodes.Field[] = [];
                const throwsFields: nodes.Field[] = [];

                const parenStartPos = line.indexOf('(');
                let argResult: { text: string; endLine: number; endChar: number } | null = null;
                if (parenStartPos !== -1) {
                    argResult = this.readParenthesizedText(this.currentLine, parenStartPos + 1);
                    if (argResult) {
                        args.push(...this.parseFieldList(argResult.text, this.currentLine, parenStartPos + 1));
                    }
                }

                // Find the end of the function declaration (either , or ; or {)
                let funcEndLine = funcStartLine;
                let funcEndChar = line.length;
                let parenCount = 0;
                let foundEnd = false;

                // Look for the end of function declaration on the same line first
                for (let i = funcMatch[0].length; i < line.length; i++) {
                    const char = line[i];
                    if (char === '(') {
                        parenCount++;
                    } else if (char === ')') {
                        parenCount--;
                        if (parenCount === 0) {
                            // Look for throws clause or end of declaration
                            let j = i + 1;
                            while (j < line.length && /\s/.test(line[j])) { j++; } // Skip whitespace

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
                            while (j < line.length && /\s/.test(line[j])) { j++; } // Skip whitespace
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
                    let searchLine = funcStartLine;
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
                                    while (j < searchLineText.length && /\s/.test(searchLineText[j])) { j++; } // Skip whitespace

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
                                    while (j < searchLineText.length && /\s/.test(searchLineText[j])) { j++; } // Skip whitespace
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

                const throwsStart = this.findThrowsStartInRange(
                    argResult ? argResult.endLine : funcStartLine,
                    argResult ? argResult.endChar + 1 : Math.max(parenStartPos + 1, funcStartChar),
                    funcEndLine,
                    funcEndChar
                );
                if (throwsStart) {
                    const throwsResult = this.readParenthesizedText(throwsStart.line, throwsStart.char + 1);
                    if (throwsResult) {
                        throwsFields.push(...this.parseFieldList(throwsResult.text, throwsStart.line, throwsStart.char + 1));
                    }
                }

                const funcNode: nodes.ThriftFunction = {
                    type: nodes.ThriftNodeType.Function,
                    range: new vscode.Range(funcStartLine, funcStartChar, funcEndLine, funcEndChar),
                    nameRange: funcNameRange,
                    parent: parent,
                    name: funcMatch[3],
                    returnType: funcMatch[2].trim(),
                    oneway: !!funcMatch[1],
                    arguments: args,
                    throws: throwsFields
                };

                // Set parent for all arguments
                args.forEach(arg => {
                    arg.parent = funcNode;
                });
                throwsFields.forEach(field => {
                    field.parent = funcNode;
                });

                parent.functions.push(funcNode);
            }

            this.currentLine++;
        }

        return this.currentLine;
    }

    private parseConstSignature(trimmedLine: string): { valueType: string; name: string } | null {
        const headerRe = /^const\s+/;
        const m = headerRe.exec(trimmedLine);
        if (!m) {
            return null;
        }
        let i = m[0].length;
        const n = trimmedLine.length;
        let typeBuf = '';
        let angle = 0;
        let paren = 0;
        while (i < n && /\s/.test(trimmedLine[i])) {
            i++;
        }
        while (i < n) {
            const ch = trimmedLine[i];
            if (ch === '<') { angle++; }
            if (ch === '>') { angle = Math.max(0, angle - 1); }
            if (ch === '(') { paren++; }
            if (ch === ')') { paren = Math.max(0, paren - 1); }
            if (angle === 0 && paren === 0 && /\s/.test(ch)) {
                break;
            }
            typeBuf += ch;
            i++;
        }
        while (i < n && /\s/.test(trimmedLine[i])) {
            i++;
        }
        const nameMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)/.exec(trimmedLine.slice(i));
        if (!nameMatch) {
            return null;
        }
        return { valueType: typeBuf.trim(), name: nameMatch[1] };
    }

    private stripLineComments(line: string): string {
        let out = '';
        let inS = false;
        let inD = false;
        let escaped = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            const next = i + 1 < line.length ? line[i + 1] : '';
            if (inS) {
                if (!escaped && ch === '\\') {
                    escaped = true;
                    out += ch;
                    continue;
                }
                if (!escaped && ch === '\'') {
                    inS = false;
                }
                escaped = false;
                out += ch;
                continue;
            }
            if (inD) {
                if (!escaped && ch === '\\') {
                    escaped = true;
                    out += ch;
                    continue;
                }
                if (!escaped && ch === '"') {
                    inD = false;
                }
                escaped = false;
                out += ch;
                continue;
            }
            if (ch === '\'') {
                inS = true;
                out += ch;
                continue;
            }
            if (ch === '"') {
                inD = true;
                out += ch;
                continue;
            }
            if ((ch === '/' && next === '/') || ch === '#') {
                break;
            }
            out += ch;
        }
        return out;
    }

    /**
     * 处理行尾的注解
     * @param line 行内容
     * @returns 去除注解后的行内容
     */
    private stripTrailingAnnotation(line: string): string {
        let trimmed = line.trimEnd();
        if (!trimmed.endsWith(')')) {
            return line;
        }
        let inS = false;
        let inD = false;
        let escaped = false;
        let depth = 0;
        for (let i = trimmed.length - 1; i >= 0; i--) {
            const ch = trimmed[i];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (inS) {
                if (ch === '\'') {
                    inS = false;
                }
                continue;
            }
            if (inD) {
                if (ch === '"') {
                    inD = false;
                }
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
            if (ch === ')') {
                depth++;
                continue;
            }
            if (ch === '(') {
                depth--;
                if (depth === 0) {
                    return trimmed.slice(0, i).trimEnd();
                }
            }
        }
        return line;
    }

    /**
     * 分割顶层逗号并保留偏移量
     * @param text 输入文本
     * @returns 分割后的文本片段及其起始偏移量数组
     */
    private splitTopLevelCommasWithOffsets(text: string): Array<{ text: string; start: number }> {
        const parts: Array<{ text: string; start: number }> = [];
        let start = 0;
        let depthAngle = 0;
        let depthBracket = 0;
        let depthBrace = 0;
        let depthParen = 0;
        let inS = false;
        let inD = false;
        let escaped = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
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
            if (ch === '<') { depthAngle++; }
            if (ch === '>') { depthAngle = Math.max(0, depthAngle - 1); }
            if (ch === '[') { depthBracket++; }
            if (ch === ']') { depthBracket = Math.max(0, depthBracket - 1); }
            if (ch === '{') { depthBrace++; }
            if (ch === '}') { depthBrace = Math.max(0, depthBrace - 1); }
            if (ch === '(') { depthParen++; }
            if (ch === ')') { depthParen = Math.max(0, depthParen - 1); }

            if (ch === ',' && depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0) {
                const raw = text.slice(start, i);
                const leading = raw.match(/^\s*/)?.[0].length ?? 0;
                const trimmed = raw.trim();
                if (trimmed) {
                    parts.push({ text: trimmed, start: start + leading });
                }
                start = i + 1;
            }
        }
        const tail = text.slice(start);
        const leading = tail.match(/^\s*/)?.[0].length ?? 0;
        const trimmed = tail.trim();
        if (trimmed) {
            parts.push({ text: trimmed, start: start + leading });
        }
        return parts;
    }

    private offsetToPosition(text: string, baseLine: number, baseChar: number, offset: number): { line: number; char: number } {
        let line = baseLine;
        let char = baseChar;
        for (let i = 0; i < offset && i < text.length; i++) {
            if (text[i] === '\n') {
                line++;
                char = 0;
            } else {
                char++;
            }
        }
        return { line, char };
    }

    private parseFieldList(text: string, baseLine: number, baseChar: number): nodes.Field[] {
        const fields: nodes.Field[] = [];
        const segments = this.splitTopLevelCommasWithOffsets(text);
        for (const seg of segments) {
            const leading = seg.text.match(/^\s*/)?.[0].length ?? 0;
            const segmentText = this.stripLineComments(seg.text).trim();
            const segmentStart = seg.start + leading;
            const segmentEnd = segmentStart + segmentText.length;
            const match = segmentText.match(/^(\d+):\s*(?:(required|optional)\s+)?([a-zA-Z0-9_<>.,\s]+)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (!match) {
                continue;
            }
            const nameOffset = this.findWordOffset(segmentText, match[4]);
            const startPos = this.offsetToPosition(text, baseLine, baseChar, segmentStart);
            const endPos = this.offsetToPosition(text, baseLine, baseChar, segmentEnd);
            const nameStart = nameOffset !== null ? this.offsetToPosition(text, baseLine, baseChar, segmentStart + nameOffset) : null;
            const nameEnd = nameOffset !== null ? this.offsetToPosition(text, baseLine, baseChar, segmentStart + nameOffset + match[4].length) : null;
            const field: nodes.Field = {
                type: nodes.ThriftNodeType.Field,
                range: new vscode.Range(startPos.line, startPos.char, endPos.line, endPos.char),
                nameRange: nameStart && nameEnd ? new vscode.Range(nameStart.line, nameStart.char, nameEnd.line, nameEnd.char) : undefined,
                parent: null as any,
                id: parseInt(match[1]),
                requiredness: (match[2] === 'required' || match[2] === 'optional') ? match[2] : 'required',
                fieldType: match[3].trim(),
                name: match[4]
            };
            fields.push(field);
        }
        return fields;
    }

    private readParenthesizedText(startLine: number, startChar: number): { text: string; endLine: number; endChar: number } | null {
        let line = startLine;
        let char = startChar;
        let depth = 1;
        let text = '';

        while (line < this.lines.length) {
            const lineText = this.lines[line];
            while (char < lineText.length) {
                const c = lineText[char];
                if (c === '(') {
                    depth++;
                    text += c;
                } else if (c === ')') {
                    depth--;
                    if (depth === 0) {
                        return { text, endLine: line, endChar: char };
                    }
                    text += c;
                } else {
                    text += c;
                }
                char++;
            }
            line++;
            char = 0;
            if (line < this.lines.length) {
                text += '\n';
            }
        }
        return null;
    }

    private findThrowsStartInRange(startLine: number, startChar: number, endLine: number, endChar: number): { line: number; char: number } | null {
        let seenThrows = false;
        for (let line = startLine; line < this.lines.length; line++) {
            if (line > endLine) {
                break;
            }
            const lineText = this.lines[line];
            const searchStart = line === startLine ? startChar : 0;
            const searchEnd = line === endLine ? endChar : lineText.length;
            const segment = lineText.slice(searchStart, searchEnd);
            if (!seenThrows) {
                const idx = segment.indexOf('throws');
                if (idx !== -1) {
                    seenThrows = true;
                    const parenIdx = segment.indexOf('(', idx + 'throws'.length);
                    if (parenIdx !== -1) {
                        return { line, char: searchStart + parenIdx };
                    }
                }
            } else {
                const parenIdx = segment.indexOf('(');
                if (parenIdx !== -1) {
                    return { line, char: searchStart + parenIdx };
                }
            }
        }
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
        let inS = false;
        let inD = false;
        let escaped = false;

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
                    continue;
                }
                if (!seenEquals) {
                    continue;
                }
                if (ch === '{') { depthBrace++; }
                if (ch === '}') { depthBrace = Math.max(0, depthBrace - 1); }
                if (ch === '[') { depthBracket++; }
                if (ch === ']') { depthBracket = Math.max(0, depthBracket - 1); }
                if (ch === '(') { depthParen++; }
                if (ch === ')') { depthParen = Math.max(0, depthParen - 1); }
            }

            if (seenEquals && depthBrace === 0 && depthBracket === 0 && depthParen === 0) {
                break;
            }
            endLine++;
        }

        const constNode: nodes.Const = {
            type: nodes.ThriftNodeType.Const,
            range: new vscode.Range(startLine, 0, endLine, this.lines[endLine] ? this.lines[endLine].length : 0),
            nameRange: this.findWordRangeInLine(line, startLine, name, searchStart),
            parent: parent,
            valueType: valueType,
            name: name,
            value: '' // TODO: extract value
        };

        this.currentLine = endLine + 1;
        return constNode;
    }

    private findNameRangeInLine(line: string, lineNumber: number, name: string, codeOnly: string): vscode.Range | undefined {
        const codeIndex = line.indexOf(codeOnly);
        const searchStart = codeIndex >= 0 ? codeIndex : 0;
        return this.findWordRangeInLine(line, lineNumber, name, searchStart);
    }

    private findWordRangeInLine(line: string, lineNumber: number, word: string, searchStart: number): vscode.Range | undefined {
        if (!word) {
            return undefined;
        }
        const escaped = this.escapeRegExp(word);
        const regex = new RegExp(`\\b${escaped}\\b`, 'g');
        let match: RegExpExecArray | null;
        while ((match = regex.exec(line)) !== null) {
            if (match.index >= searchStart) {
                return new vscode.Range(lineNumber, match.index, lineNumber, match.index + word.length);
            }
        }
        return undefined;
    }

    private findWordOffset(text: string, word: string): number | null {
        if (!word) {
            return null;
        }
        const escaped = this.escapeRegExp(word);
        const regex = new RegExp(`\\b${escaped}\\b`, 'g');
        const match = regex.exec(text);
        return match ? match.index : null;
    }

    private escapeRegExp(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
