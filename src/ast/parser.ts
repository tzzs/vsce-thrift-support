import * as vscode from 'vscode';
import * as nodes from './nodes.types';
import {
    clearAstCacheForDocument,
    clearExpiredAstCache,
    parseWithAstCache
} from './cache';
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
    stripLineComments,
    stripTrailingAnnotation
} from './parser-helpers';

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
        return parseWithAstCache(uri, content, () => {
            const parser = new ThriftParser(content);
            return parser.parse();
        });
    }

    /**
     * 带缓存的解析入口（基于 URI 与内容）。
     */
    public static parseContentWithCache(uri: string, content: string): nodes.ThriftDocument {
        return parseWithAstCache(uri, content, () => {
            const parser = new ThriftParser(content);
            return parser.parse();
        });
    }

    /**
     * 清理过期 AST 缓存。
     */
    public static clearExpiredCache(): void {
        clearExpiredAstCache();
    }

    /**
     * 清理指定文档的 AST 缓存。
     */
    public static clearDocumentCache(uri: string): void {
        clearAstCacheForDocument(uri);
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
                nameRange: findWordRangeInLine(line, this.currentLine, namespaceMatch[2], searchStart),
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
                nameRange: findWordRangeInLine(line, this.currentLine, typedefMatch[2], searchStart),
                parent: parent,
                aliasType: typedefMatch[1],
                aliasTypeRange: findTypeRangeInLine(line, this.currentLine, typedefMatch[1].trim(), searchStart),
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

            const codeOnly = stripLineComments(trimmed);
            const codeStart = line.indexOf(codeOnly);
            // Field regex: 1: optional string name,
            const fieldMatch = codeOnly.match(/^(\d+):\s*(?:(required|optional)\s+)?([a-zA-Z0-9_<>.,\s]+)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (fieldMatch) {
                const valueTarget = stripTrailingAnnotation(codeOnly.replace(/[,;]\s*$/, ''));
                const nameRange = findNameRangeInLine(line, this.currentLine, fieldMatch[4], codeOnly);
                const typeRange = findTypeRangeInLine(line, this.currentLine, fieldMatch[3].trim(), codeStart);
                const defaultInfo = findDefaultValueRange(valueTarget);
                const defaultStart = defaultInfo ? codeStart + defaultInfo.start : null;
                const defaultEnd = defaultInfo ? codeStart + defaultInfo.end : null;
                const field: nodes.Field = {
                    type: nodes.ThriftNodeType.Field,
                    range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
                    nameRange,
                    typeRange,
                    parent: parent,
                    id: parseInt(fieldMatch[1]),
                    requiredness: fieldMatch[2] as 'required' | 'optional',
                    fieldType: fieldMatch[3].trim(),
                    name: fieldMatch[4],
                    defaultValue: defaultInfo?.value,
                    defaultValueRange: defaultStart !== null && defaultEnd !== null
                        ? new vscode.Range(this.currentLine, defaultStart, this.currentLine, defaultEnd)
                        : undefined
                };

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

            const codeOnly = stripLineComments(trimmed);
            // Enum Member: NAME = 1, or just NAME,
            const memberMatch = codeOnly.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=\s*([^,;]+))?/);
            if (memberMatch && codeOnly && !codeOnly.startsWith('//')) {
                const initializer = memberMatch[2]?.trim();
                const initializerRange = findInitializerRange(line, codeOnly, initializer, this.currentLine);
                const nameRange = findNameRangeInLine(line, this.currentLine, memberMatch[1], codeOnly);
                const member: nodes.EnumMember = {
                    type: nodes.ThriftNodeType.EnumMember,
                    range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
                    nameRange,
                    parent: parent,
                    name: memberMatch[1],
                    initializer,
                    initializerRange
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
                const funcNameRange = findWordRangeInLine(line, funcStartLine, funcMatch[3], funcStartChar);
                const funcReturnTypeRange = findTypeRangeInLine(line, funcStartLine, funcMatch[2].trim(), funcStartChar);

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

                const throwsStart = findThrowsStartInRange(
                    this.lines,
                    argResult ? argResult.endLine : funcStartLine,
                    argResult ? argResult.endChar + 1 : Math.max(parenStartPos + 1, funcStartChar),
                    funcEndLine,
                    funcEndChar
                );
                if (throwsStart) {
                    const throwsResult = readParenthesizedText(this.lines, throwsStart.line, throwsStart.char + 1);
                    if (throwsResult) {
                        throwsFields.push(...parseFieldList(throwsResult.text, throwsStart.line, throwsStart.char + 1));
                    }
                }

                const funcNode: nodes.ThriftFunction = {
                    type: nodes.ThriftNodeType.Function,
                    range: new vscode.Range(funcStartLine, funcStartChar, funcEndLine, funcEndChar),
                    nameRange: funcNameRange,
                    parent: parent,
                    name: funcMatch[3],
                    returnType: funcMatch[2].trim(),
                    returnTypeRange: funcReturnTypeRange,
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

}
