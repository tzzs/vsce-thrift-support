import * as vscode from 'vscode';
import * as nodes from './nodes';

// AST缓存机制 - 避免重复解析相同内容
interface ASTCacheEntry {
    content: string;
    ast: nodes.ThriftDocument;
    timestamp: number;
}

const astCache = new Map<string, ASTCacheEntry>();
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5分钟缓存

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

    // 带缓存的解析方法
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

    // 基于内容和URI的缓存解析方法
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

    // 清理过期缓存
    public static clearExpiredCache(): void {
        const now = Date.now();
        for (const [uri, entry] of astCache.entries()) {
            if (now - entry.timestamp > CACHE_MAX_AGE) {
                astCache.delete(uri);
            }
        }
    }

    // 清理特定文档的缓存
    public static clearDocumentCache(uri: string): void {
        astCache.delete(uri);
    }

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
            const node: nodes.Namespace = {
                type: nodes.ThriftNodeType.Namespace,
                range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
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

        // Enum
        const enumMatch = trimmed.match(/^enum\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (enumMatch) {
            return this.parseEnum(parent, enumMatch[1]);
        }

        // Service
        const serviceMatch = trimmed.match(/^service\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+extends\s+([a-zA-Z_][a-zA-Z0-9_.]*))?/);
        if (serviceMatch) {
            return this.parseService(parent, serviceMatch[1], serviceMatch[2]);
        }

        // Const
        const constMatch = trimmed.match(/^const\s+([a-zA-Z0-9_<>]+)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
        if (constMatch) {
            return this.parseConst(parent, constMatch[1], constMatch[2]);
        }

        // Typedef
        const typedefMatch = trimmed.match(/^typedef\s+(.+)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (typedefMatch) {
            const node: nodes.Typedef = {
                type: nodes.ThriftNodeType.Typedef,
                range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
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

        const structNode: nodes.Struct = {
            type: type,
            name: name,
            range: new vscode.Range(startLine, 0, startLine, 0), // Will be updated
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
        const startLine = this.currentLine;

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

            // Field regex: 1: optional string name,
            const fieldMatch = trimmed.match(/^(\d+):\s*(?:(required|optional)\s+)?([a-zA-Z0-9_<>.,\s]+)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (fieldMatch) {
                const field: nodes.Field = {
                    type: nodes.ThriftNodeType.Field,
                    range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
                    parent: parent,
                    id: parseInt(fieldMatch[1]),
                    requiredness: fieldMatch[2] as 'required' | 'optional',
                    fieldType: fieldMatch[3].trim(),
                    name: fieldMatch[4]
                };

                // Check for default value
                const defaultValueMatch = trimmed.match(/=\s*([^,;]+)/);
                if (defaultValueMatch) {
                    field.defaultValue = defaultValueMatch[1].trim();
                }

                parent.fields.push(field);
            }

            this.currentLine++;
        }

        return this.currentLine;
    }

    private parseEnum(parent: nodes.ThriftNode, name: string): nodes.Enum {
        const startLine = this.currentLine;
        const enumNode: nodes.Enum = {
            type: nodes.ThriftNodeType.Enum,
            name: name,
            range: new vscode.Range(startLine, 0, startLine, 0), // Will be updated
            parent: parent,
            members: []
        };

        // Parse body
        this.currentLine = this.parseEnumBody(enumNode);
        enumNode.range = new vscode.Range(startLine, 0, this.currentLine,
            this.lines[this.currentLine] ? this.lines[this.currentLine].length : 0);
        return enumNode;
    }

    private parseEnumBody(parent: nodes.Enum): number {
        let braceCount = 0;
        const startLine = this.currentLine;

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

            // Enum Member: NAME = 1, or just NAME,
            const memberMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=\s*(\d+|0x[0-9a-fA-F]+))?/);
            if (memberMatch && trimmed && !trimmed.startsWith('//')) {
                const member: nodes.EnumMember = {
                    type: nodes.ThriftNodeType.EnumMember,
                    range: new vscode.Range(this.currentLine, 0, this.currentLine, line.length),
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
        const serviceNode: nodes.Service = {
            type: nodes.ThriftNodeType.Service,
            name: name,
            extends: extendsClass,
            range: new vscode.Range(startLine, 0, startLine, 0), // Will be updated
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
        const startLine = this.currentLine;

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

                // Parse function arguments
                const args: nodes.Field[] = [];

                // Find the opening parenthesis
                let parenStartPos = line.indexOf('(');
                if (parenStartPos !== -1) {
                    // Parse arguments between parentheses
                    let argParsingLine = this.currentLine;
                    let argParsingChar = parenStartPos + 1;
                    let argParenCount = 1;

                    // Collect argument text
                    let argText = '';
                    let inArgParsing = true;

                    while (inArgParsing && argParsingLine < this.lines.length) {
                        const argLine = this.lines[argParsingLine];
                        while (argParsingChar < argLine.length && inArgParsing) {
                            const char = argLine[argParsingChar];
                            if (char === '(') {
                                argParenCount++;
                                argText += char;
                            } else if (char === ')') {
                                argParenCount--;
                                if (argParenCount === 0) {
                                    inArgParsing = false;
                                    // Don't add the closing parenthesis to argText
                                } else {
                                    argText += char;
                                }
                            } else {
                                argText += char;
                            }
                            argParsingChar++;
                        }

                        if (inArgParsing) {
                            argParsingLine++;
                            argParsingChar = 0;
                            if (argParsingLine < this.lines.length) {
                                argText += '\n';
                            }
                        }
                    }

                    // Parse individual arguments
                    if (argText.trim()) {
                        // Split arguments by comma, but be careful about commas in complex types
                        const argParts = argText.split(',');
                        let currentArgText = '';
                        let parenDepth = 0;

                        for (let i = 0; i < argParts.length; i++) {
                            currentArgText += argParts[i];

                            // Count parentheses in this part
                            for (const char of argParts[i]) {
                                if (char === '(') parenDepth++;
                                if (char === ')') parenDepth--;
                            }

                            // If we're at the top level (no unclosed parentheses), this is a complete argument
                            if (parenDepth === 0) {
                                const trimmedArg = currentArgText.trim();
                                if (trimmedArg) {
                                    // Parse argument: id: type name
                                    const argMatch = trimmedArg.match(/^(\d+):\s*(?:(required|optional)\s+)?([a-zA-Z0-9_<>.,\s]+)\s+([a-zA-Z_][a-zA-Z0-9_]*)$/);
                                    if (argMatch) {
                                        const argNode: nodes.Field = {
                                            type: nodes.ThriftNodeType.Field,
                                            range: new vscode.Range(argParsingLine, 0, argParsingLine, 0), // TODO: Better range calculation
                                            parent: null as any, // Will be set later
                                            id: parseInt(argMatch[1]),
                                            requiredness: (argMatch[2] === 'required' || argMatch[2] === 'optional') ? argMatch[2] : 'required',
                                            fieldType: argMatch[3].trim(),
                                            name: argMatch[4]
                                        };
                                        args.push(argNode);
                                    }
                                }
                                currentArgText = '';
                            } else {
                                // Not at top level, add a comma back for next iteration
                                currentArgText += ',';
                            }
                        }
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
                            while (j < line.length && /\s/.test(line[j])) j++; // Skip whitespace

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
                            while (j < line.length && /\s/.test(line[j])) j++; // Skip whitespace
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
                                    while (j < searchLineText.length && /\s/.test(searchLineText[j])) j++; // Skip whitespace

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
                                    while (j < searchLineText.length && /\s/.test(searchLineText[j])) j++; // Skip whitespace
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

                const funcNode: nodes.ThriftFunction = {
                    type: nodes.ThriftNodeType.Function,
                    range: new vscode.Range(funcStartLine, funcStartChar, funcEndLine, funcEndChar),
                    parent: parent,
                    name: funcMatch[3],
                    returnType: funcMatch[2].trim(),
                    oneway: !!funcMatch[1],
                    arguments: args,
                    throws: []
                };

                // Set parent for all arguments
                args.forEach(arg => {
                    arg.parent = funcNode;
                });

                parent.functions.push(funcNode);
            }

            this.currentLine++;
        }

        return this.currentLine;
    }

    private parseConst(parent: nodes.ThriftNode, valueType: string, name: string): nodes.Const {
        const startLine = this.currentLine;
        let endLine = this.currentLine;

        // Simple heuristic for multi-line const: keep reading until we see a line ending with ;
        while (endLine < this.lines.length && !this.lines[endLine].trim().endsWith(';')) {
            endLine++;
        }

        const constNode: nodes.Const = {
            type: nodes.ThriftNodeType.Const,
            range: new vscode.Range(startLine, 0, endLine, this.lines[endLine] ? this.lines[endLine].length : 0),
            parent: parent,
            valueType: valueType,
            name: name,
            value: '' // TODO: extract value
        };

        this.currentLine = endLine + 1;
        return constNode;
    }
}
