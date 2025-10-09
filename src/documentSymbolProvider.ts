import * as vscode from 'vscode';

export class ThriftDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    public provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        const symbols: vscode.DocumentSymbol[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        let inBlock = false;
        let currentSymbol: vscode.DocumentSymbol | null = null;
        let braceDepth = 0;
        let blockStartLine = 0;
        let currentType = '';
        let currentName = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // 跳过空行和注释
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
                continue;
            }

            // 检测类型定义开始
            const typeDefMatch = trimmed.match(/^(struct|union|exception|enum|senum|service|typedef)\s+([A-Za-z_][A-Za-z0-9_]*)/);
            const constMatch = trimmed.match(/^const\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)/);

            if (constMatch) {
                const constType = constMatch[1];
                const constName = constMatch[2];
                const symbol = new vscode.DocumentSymbol(
                    constName,
                    `const ${constType} ${constName}`,
                    vscode.SymbolKind.Constant,
                    new vscode.Range(i, 0, i, line.length),
                    new vscode.Range(i, line.indexOf(constName), i, line.indexOf(constName) + constName.length)
                );
                symbols.push(symbol);
                continue;
            }
            if (typeDefMatch) {
                const type = typeDefMatch[1];
                const name = typeDefMatch[2];
                const kind = this.getSymbolKind(type);

                // 创建符号
                const symbol = new vscode.DocumentSymbol(
                    name,
                    `${type} ${name}`,
                    kind,
                    new vscode.Range(i, 0, i, line.length),
                    new vscode.Range(i, line.indexOf(name), i, line.indexOf(name) + name.length)
                );

                symbols.push(symbol);

                // 如果是复合类型（有代码块），设置跟踪状态
                if (['struct', 'union', 'exception', 'enum', 'senum', 'service'].includes(type)) {
                    inBlock = true;
                    currentSymbol = symbol;
                    blockStartLine = i;
                    currentType = type;
                    currentName = name;

                    // 添加子符号（字段、枚举值、方法等）
                    this.addChildSymbols(symbol, lines, i, type);
                }

                continue;
            }

            // 处理命名空间
            const namespaceMatch = trimmed.match(/^namespace\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)/);
            if (namespaceMatch) {
                const language = namespaceMatch[1];
                const namespace = namespaceMatch[2];
                const symbol = new vscode.DocumentSymbol(
                    `namespace ${language}`,
                    `namespace ${language} ${namespace}`,
                    vscode.SymbolKind.Namespace,
                    new vscode.Range(i, 0, i, line.length),
                    new vscode.Range(i, line.indexOf(language), i, line.indexOf(language) + language.length)
                );
                symbols.push(symbol);
                continue;
            }

            // 处理 include
            const includeMatch = trimmed.match(/^include\s+["']([^"']+)["']/);
            if (includeMatch) {
                const fileName = includeMatch[1];
                const symbol = new vscode.DocumentSymbol(
                    `include ${fileName}`,
                    `include "${fileName}"`,
                    vscode.SymbolKind.File,
                    new vscode.Range(i, 0, i, line.length),
                    new vscode.Range(i, line.indexOf(fileName), i, line.indexOf(fileName) + fileName.length)
                );
                symbols.push(symbol);
                continue;
            }
        }

        return symbols;
    }

    private addChildSymbols(parent: vscode.DocumentSymbol, lines: string[], startLine: number, type: string): void {
        let braceDepth = 0;
        let inBlock = false;

        // Start with braceDepth = 1 since we know the opening brace is on the struct definition line
        braceDepth = 1;
        inBlock = true;

        for (let i = startLine + 1; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // 跟踪大括号深度
            if (trimmed.includes('{')) {
                braceDepth++;
            }
            if (trimmed.includes('}')) {
                braceDepth--;
                if (braceDepth === 0) {
                    break; // 结束当前块
                }
            }

            // 根据类型处理子符号
            if (type === 'struct' || type === 'union' || type === 'exception') {
                this.parseFieldSymbol(line, i, parent);
            } else if (type === 'enum' || type === 'senum') {
                this.parseEnumValueSymbol(line, i, parent);
            } else if (type === 'service') {
                this.parseServiceMethodSymbol(line, i, parent);
            }
        }
    }

    private parseFieldSymbol(line: string, lineNumber: number, parent: vscode.DocumentSymbol): void {
        // 匹配字段定义：1: required string name,
        const fieldMatch = line.match(/^(\s*)(\d+)\s*:\s*(?:required|optional)?\s*([^\s,]+(?:\s*\u003c[^\u003e]+\u003e)?)\s+([A-Za-z_][A-Za-z0-9_]*)/);
        if (fieldMatch) {
            const fieldId = fieldMatch[2];
            const fieldType = fieldMatch[3];
            const fieldName = fieldMatch[4];

            const symbol = new vscode.DocumentSymbol(
                fieldName,
                `${fieldId}: ${fieldType} ${fieldName}`,
                vscode.SymbolKind.Field,
                new vscode.Range(lineNumber, 0, lineNumber, line.length),
                new vscode.Range(lineNumber, line.indexOf(fieldName), lineNumber, line.indexOf(fieldName) + fieldName.length)
            );

            parent.children.push(symbol);
        }
    }

    private parseEnumValueSymbol(line: string, lineNumber: number, parent: vscode.DocumentSymbol): void {
        // 匹配枚举值：VALUE = 1,
        const enumMatch = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*([^,;]+))?[,;]?/);
        if (enumMatch && !line.includes('}')) {
            const valueName = enumMatch[2];
            const valueExpr = enumMatch[3] ? ` = ${enumMatch[3]}` : '';

            const symbol = new vscode.DocumentSymbol(
                valueName,
                `${valueName}${valueExpr}`,
                vscode.SymbolKind.EnumMember,
                new vscode.Range(lineNumber, 0, lineNumber, line.length),
                new vscode.Range(lineNumber, line.indexOf(valueName), lineNumber, line.indexOf(valueName) + valueName.length)
            );

            parent.children.push(symbol);
        }
    }

    private parseServiceMethodSymbol(line: string, lineNumber: number, parent: vscode.DocumentSymbol): void {
        // 匹配服务方法：ReturnType methodName(1: ParamType param),
        const methodMatch = line.match(/^(\s*)(oneway\s+)?([A-Za-z_][A-Za-z0-9_]*(?:\s*\u003c[^\u003e]+\u003e)?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
        if (methodMatch) {
            const isOneway = methodMatch[2] ? 'oneway ' : '';
            const returnType = methodMatch[3];
            const methodName = methodMatch[4];

            const symbol = new vscode.DocumentSymbol(
                methodName,
                `${isOneway}${returnType} ${methodName}`,
                vscode.SymbolKind.Method,
                new vscode.Range(lineNumber, 0, lineNumber, line.length),
                new vscode.Range(lineNumber, line.indexOf(methodName), lineNumber, line.indexOf(methodName) + methodName.length)
            );

            parent.children.push(symbol);
        }
    }

    private getSymbolKind(type: string): vscode.SymbolKind {
        switch (type) {
            case 'struct': return vscode.SymbolKind.Struct;
            case 'union': return vscode.SymbolKind.Struct;
            case 'exception': return vscode.SymbolKind.Class;
            case 'enum': return vscode.SymbolKind.Enum;
            case 'senum': return vscode.SymbolKind.Enum;
            case 'service': return vscode.SymbolKind.Interface;
            case 'typedef': return vscode.SymbolKind.TypeParameter;
            case 'const': return vscode.SymbolKind.Constant;
            default: return vscode.SymbolKind.Variable;
        }
    }
}

export function registerDocumentSymbolProvider(context: vscode.ExtensionContext) {
    const provider = new ThriftDocumentSymbolProvider();
    const disposable = vscode.languages.registerDocumentSymbolProvider('thrift', provider);
    context.subscriptions.push(disposable);
}