import * as vscode from 'vscode';
import * as path from 'path';

export class ThriftCompletionProvider implements vscode.CompletionItemProvider {
    private keywords = [
        'namespace', 'include', 'cpp_include', 'php_include', 'py_module', 'perl_package', 'ruby_namespace',
        'smalltalk_category', 'smalltalk_prefix', 'java_package', 'cocoa_prefix', 'csharp_namespace',
        'delphi_namespace', 'cpp_namespace', 'd_namespace', 'c_glib', 'netstd', 'st', 'xsd_all', 'xsd_optional',
        'xsd_nillable', 'xsd_namespace', 'xsd_attrs', 'const', 'typedef', 'enum', 'senum', 'struct', 'union',
        'exception', 'extends', 'service', 'oneway', 'void', 'throws', 'optional', 'required', 'async',
        // 高级特性关键字
        'stream', 'sink', 'interaction', 'performs', 'reference'
    ];

    private primitives = [
        'bool', 'byte', 'i8', 'i16', 'i32', 'i64', 'double', 'string', 'binary', 'uuid', 'slist', 'void'
    ];

    private containers = ['list', 'set', 'map'];

    // 解析当前文档中的用户定义类型
    private parseUserTypes(text: string): string[] {
        const types: string[] = [];
        const lines = text.split('\n');

        // 匹配类型定义：struct/union/exception/enum/senum/service/typedef
        const typeDefRe = /^(\s*)(struct|union|exception|enum|senum|service|typedef)\s+([A-Za-z_][A-Za-z0-9_]*)/;
        const typedefRe = /^(\s*)typedef\s+([^\s;]+(?:\s*<[^>]+>)?)\s+([A-Za-z_][A-Za-z0-9_]*)/;

        for (const line of lines) {
            const mType = line.match(typeDefRe);
            if (mType && mType[3]) {
                types.push(mType[3]);
            }

            const mTypedef = line.match(typedefRe);
            if (mTypedef && mTypedef[3]) {
                types.push(mTypedef[3]);
            }
        }

        return types;
    }

    // 解析枚举值
    private parseEnumValues(text: string): string[] {
        const values: string[] = [];
        const lines = text.split('\n');
        let inEnumBlock = false;

        for (const line of lines) {
            const trimmed = line.trim();

            // 检测枚举块开始
            if (/^\s*(enum|senum)\s+\w+/.test(trimmed)) {
                inEnumBlock = true;
                continue;
            }

            // 检测枚举块结束
            if (inEnumBlock && trimmed === '}') {
                inEnumBlock = false;
                continue;
            }

            // 在枚举块内解析枚举值
            if (inEnumBlock) {
                const enumValueMatch = trimmed.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)/);
                if (enumValueMatch && enumValueMatch[1]) {
                    values.push(enumValueMatch[1]);
                }
            }
        }

        return values;
    }

    // 解析 include 路径
    private parseIncludePaths(text: string): string[] {
        const paths: string[] = [];
        const lines = text.split('\n');

        const includeRe = /^\s*include\s+["']([^"']+)["']/;

        for (const line of lines) {
            const m = line.match(includeRe);
            if (m && m[1]) {
                paths.push(m[1]);
            }
        }

        return paths;
    }

    // 解析常量定义
    private parseConstants(text: string): string[] {
        const constants: string[] = [];
        const lines = text.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            // 匹配 const 定义：const TYPE NAME = VALUE
            const constMatch = trimmed.match(/^\s*const\s+\w+\s+([A-Za-z_][A-Za-z0-9_]*)/);
            if (constMatch && constMatch[1]) {
                constants.push(constMatch[1]);
            }
        }

        return constants;
    }

    // 解析服务定义
    private parseServices(text: string): string[] {
        const services: string[] = [];
        const lines = text.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            // 匹配 service 定义
            const serviceMatch = trimmed.match(/^\s*service\s+([A-Za-z_][A-Za-z0-9_]*)/);
            if (serviceMatch && serviceMatch[1]) {
                services.push(serviceMatch[1]);
            }
        }

        return services;
    }

    // 获取当前上下文
    private getContext(text: string, position: number): { line: string; lineStart: number; prefix: string } {
        const beforeCursor = text.substring(0, position);
        const lines = beforeCursor.split('\n');
        const currentLine = lines[lines.length - 1];
        const prefix = currentLine.trim();

        return {
            line: currentLine,
            lineStart: position - currentLine.length,
            prefix: prefix
        };
    }

    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList> {
        const text = document.getText();
        const currentContext = this.getContext(text, document.offsetAt(position));

        const completions: vscode.CompletionItem[] = [];

        // 获取用户定义的类型和枚举值
        const userTypes = this.parseUserTypes(text);
        const enumValues = this.parseEnumValues(text);
        const includePaths = this.parseIncludePaths(text);
        const constants = this.parseConstants(text);
        const services = this.parseServices(text);

        // 根据上下文提供不同类型的补全
        const line = currentContext.line;
        let prefix = currentContext.prefix;

        // 在类型上下文中，提取用户实际输入的部分
        if (this.isInTypeContext(line, position.character)) {
            const beforeCursor = line.substring(0, position.character);
            // 提取最后一个词作为前缀（在 required/optional 之后的部分）
            const typePrefixMatch = beforeCursor.match(/\s+(\w*)$/);
            if (typePrefixMatch) {
                // 如果我们只是在 required/optional 之后，还没有开始输入类型名，
                // 那么前缀应该是空的，显示所有类型
                const trimmedPrefix = typePrefixMatch[1].toLowerCase();
                if (trimmedPrefix === 'required' || trimmedPrefix === 'optional') {
                    prefix = ''; // 显示所有类型
                } else {
                    prefix = trimmedPrefix;
                }
            }
        }

        // 在枚举值上下文中，提取用户实际输入的部分
        if (this.isInEnumValueContext(line, position.character)) {
            const beforeCursor = line.substring(0, position.character);
            // 提取在 = 之后的部分作为前缀
            const enumPrefixMatch = beforeCursor.match(/=\s*(\w*)$/);
            if (enumPrefixMatch) {
                prefix = enumPrefixMatch[1];
            } else {
                prefix = ''; // 如果 = 后面没有内容，显示所有枚举值
            }
        }

        // 1. 如果在 include 语句中，提供路径补全
        if (/^\s*include\s+["']?[^"']*$/.test(line)) {
            const pathCompletions = await this.provideIncludePathCompletions(document, prefix);
            completions.push(...pathCompletions);
        }

        // 2. 如果在 namespace 语句中，提供命名空间关键字补全
        if (/^\s*namespace\s+\w*$/.test(line)) {
            const namespaceKeywords = [
                { keyword: 'c_glib', description: 'C GLib namespace' },
                { keyword: 'cpp', description: 'C++ namespace' },
                { keyword: 'cpp_namespace', description: 'C++ namespace (explicit)' },
                { keyword: 'csharp_namespace', description: 'C# namespace' },
                { keyword: 'd_namespace', description: 'D namespace' },
                { keyword: 'delphi_namespace', description: 'Delphi namespace' },
                { keyword: 'go', description: 'Go package' },
                { keyword: 'java_package', description: 'Java package' },
                { keyword: 'js', description: 'JavaScript module' },
                { keyword: 'lua', description: 'Lua module' },
                { keyword: 'netstd', description: '.NET Standard namespace' },
                { keyword: 'perl', description: 'Perl package' },
                { keyword: 'php', description: 'PHP namespace' },
                { keyword: 'py', description: 'Python module' },
                { keyword: 'py.twisted', description: 'Python Twisted module' },
                { keyword: 'rb', description: 'Ruby module' },
                { keyword: 'rust', description: 'Rust crate/module' },
                { keyword: 'scala', description: 'Scala package' },
                { keyword: 'smalltalk_category', description: 'Smalltalk category' },
                { keyword: 'smalltalk_prefix', description: 'Smalltalk prefix' },
                { keyword: 'st', description: 'Smalltalk namespace' },
                { keyword: 'swift', description: 'Swift module' },
                { keyword: 'xsd', description: 'XML Schema namespace' }
            ];

            // 获取当前文件中的已有命名空间，避免重复
            const existingNamespaces = this.parseExistingNamespaces(text);
            
            namespaceKeywords.forEach(({ keyword, description }) => {
                if (!existingNamespaces.has(keyword)) {
                    const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
                    item.detail = description;
                    
                    // 为常见语言提供智能建议
                    if (['java_package', 'cpp', 'py', 'go'].includes(keyword)) {
                        item.documentation = this.generateNamespaceExample(keyword);
                        item.preselect = true; // 高亮显示常用语言
                    }
                    
                    completions.push(item);
                }
            });
        }

        // 3. 如果在类型位置（struct字段、函数参数等），提供类型补全
        if (this.isInTypeContext(line, position.character)) {
            // 检查用户是否正在输入 required/optional 关键字
            const beforeCursor = line.substring(0, position.character);
            const fieldPrefixMatch = beforeCursor.match(/^\s*\d+\s*:\s*(\w*)$/);

            if (fieldPrefixMatch && fieldPrefixMatch[1] && !fieldPrefixMatch[1].match(/^(required|optional)$/)) {
                // 用户正在输入 required/optional 关键字，提供关键字补全
                const fieldKeywords = ['required', 'optional'];
                fieldKeywords.forEach(keyword => {
                    const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
                    item.detail = 'Field qualifier';
                    completions.push(item);
                });
            } else {
                // 提供类型补全（包括 required/optional 之后的情况）
                // 原始类型
                this.primitives.forEach(primitive => {
                    const item = new vscode.CompletionItem(primitive, vscode.CompletionItemKind.TypeParameter);
                    item.detail = 'Primitive type';
                    completions.push(item);
                });

                // 容器类型
                this.containers.forEach(container => {
                    const item = new vscode.CompletionItem(container, vscode.CompletionItemKind.TypeParameter);
                    item.detail = 'Container type';
                    item.insertText = new vscode.SnippetString(`${container}<\${1:T}>`);
                    completions.push(item);
                });

                // 用户定义类型
                userTypes.forEach(type => {
                    const item = new vscode.CompletionItem(type, vscode.CompletionItemKind.Class);
                    item.detail = 'User-defined type';
                    completions.push(item);
                });
            }
        }

        // 4. 如果在枚举值位置，提供枚举值补全
        if (this.isInEnumValueContext(line, position.character)) {
            enumValues.forEach(value => {
                const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.EnumMember);
                item.detail = 'Enum value';
                completions.push(item);
            });
        }

        // 5. 如果在关键字位置，提供关键字补全
        if (this.isInKeywordContext(line, position.character)) {
            this.keywords.forEach(keyword => {
                const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
                item.detail = 'Thrift keyword';
                completions.push(item);
            });
        }

        // 6. 服务方法名补全
        if (this.isInServiceContext(text, position.line) && this.isInMethodContext(line, position.character)) {
            // 这里可以添加服务方法名的补全逻辑
            // 暂时提供常用的服务方法模式
            const commonMethods = ['get', 'set', 'create', 'update', 'delete', 'find', 'list'];
            commonMethods.forEach(method => {
                const item = new vscode.CompletionItem(method, vscode.CompletionItemKind.Method);
                item.detail = 'Common method name';
                completions.push(item);
            });
        }

        // 7. 常量补全（在需要常量值的地方）
        if (this.isInConstantValueContext(line, position.character)) {
            constants.forEach(constant => {
                const item = new vscode.CompletionItem(constant, vscode.CompletionItemKind.Constant);
                item.detail = 'Constant';
                completions.push(item);
            });
        }

        // 8. 服务类型补全（在需要服务类型的地方）
        if (this.isInServiceTypeContext(line, position.character)) {
            services.forEach(service => {
                const item = new vscode.CompletionItem(service, vscode.CompletionItemKind.Interface);
                item.detail = 'Service';
                completions.push(item);
            });
            
            // 同时包含用户定义的类型
            userTypes.forEach(type => {
                const item = new vscode.CompletionItem(type, vscode.CompletionItemKind.Class);
                item.detail = 'User-defined type';
                completions.push(item);
            });
        }

        // 过滤匹配前缀的补全项
        return completions.filter(item =>
            item.label.toString().toLowerCase().startsWith(prefix.toLowerCase())
        );
    }

    private isInTypeContext(line: string, character: number): boolean {
        // 简化的类型上下文检测
        // 检测是否在 struct 字段定义、函数参数等位置
        const beforeCursor = line.substring(0, character);

        // 匹配字段定义中的类型位置：1: required string name
        // 或者：1: string name
        const fieldPattern = /^\s*\d+\s*:\s*(?:required|optional)?\s*\w*$/;

        // 匹配函数参数中的类型位置
        const paramPattern = /^\s*\w+\s*$/;

        return fieldPattern.test(beforeCursor) || paramPattern.test(beforeCursor);
    }

    private isInEnumValueContext(line: string, character: number): boolean {
        // 检测是否在枚举值位置（= 后面）
        const beforeCursor = line.substring(0, character);
        return /\w+\s*=\s*$/.test(beforeCursor) || /\w+\s*=\s*\w*$/.test(beforeCursor);
    }

    private isInKeywordContext(line: string, character: number): boolean {
        // 检测是否在关键字位置（行首或特定模式）
        const beforeCursor = line.substring(0, character);
        return /^\s*\w*$/.test(beforeCursor);
    }

    private isInMethodContext(line: string, character: number): boolean {
        // 检测是否在服务方法定义位置
        const beforeCursor = line.substring(0, character);
        // 匹配服务方法模式：return_type methodName 或者 methodName
        // 只有当我们在服务上下文中时才启用方法补全
        return /^\s*\w+\s+\w*$/.test(beforeCursor) || /^\s*\w*$/.test(beforeCursor);
    }

    private isInServiceContext(text: string, lineNumber: number): boolean {
        // 检查当前是否在某一个 service 块内
        const lines = text.split('\n');
        let braceDepth = 0;
        let inService = false;

        for (let i = 0; i <= lineNumber; i++) {
            const line = lines[i];

            // 检测 service 定义开始
            if (/^\s*service\s+\w+/.test(line)) {
                inService = true;
            }

            // 计算大括号深度
            if (inService) {
                for (const char of line) {
                    if (char === '{') braceDepth++;
                    if (char === '}') braceDepth--;
                }

                // 如果大括号深度为 0，说明已经离开 service 块
                if (braceDepth === 0 && i < lineNumber) {
                    inService = false;
                }
            }
        }

        return inService && braceDepth > 0;
    }

    private isInConstantValueContext(line: string, character: number): boolean {
        // 检测是否在常量值位置（= 后面，或者在需要常量值的地方）
        const beforeCursor = line.substring(0, character);
        // 匹配 const 定义中的值位置：const TYPE NAME = 
        // 或者在字段默认值中：field: type = 
        return /^\s*const\s+\w+\s+\w+\s*=\s*$/.test(beforeCursor) || 
               /^\s*\d+\s*:\s*(?:required|optional)?\s*\w+\s+\w+\s*=\s*$/.test(beforeCursor);
    }

    private isInServiceTypeContext(line: string, character: number): boolean {
        // 检测是否在需要服务类型的上下文中
        // 例如在 extends 子句中：service MyService extends 
        const beforeCursor = line.substring(0, character);
        return /^\s*service\s+\w+\s+extends\s*$/.test(beforeCursor);
    }

    private parseExistingNamespaces(text: string): Set<string> {
        const existing = new Set<string>();
        const lines = text.split('\n');
        
        for (const line of lines) {
            const match = line.match(/^\s*namespace\s+([A-Za-z_][A-Za-z0-9_]*)/);
            if (match) {
                existing.add(match[1]);
            }
        }
        
        return existing;
    }

    private generateNamespaceExample(language: string): string {
        const examples: { [key: string]: string } = {
            'java_package': `Example: java_package com.example.myapp
Generates: package com.example.myapp;`,
            'cpp': `Example: cpp com.example
Generates: namespace com { namespace example { ... } }`,
            'py': `Example: py myapp.module
Generates: from myapp import module`,
            'go': `Example: go github.com/user/project
Generates: package project`
        };
        
        return examples[language] || '';
    }

    private async provideIncludePathCompletions(
        document: vscode.TextDocument,
        prefix: string
    ): Promise<vscode.CompletionItem[]> {
        const completions: vscode.CompletionItem[] = [];
        const documentDir = path.dirname(document.uri.fsPath);

        try {
            // 支持相对路径和绝对路径
            const searchPath = prefix.startsWith('/') ? prefix : path.resolve(documentDir, prefix);
            const searchDir = prefix.endsWith('/') ? searchPath : path.dirname(searchPath);
            const filePrefix = path.basename(prefix);

            // 获取指定目录下的 .thrift 文件
            const pattern = path.join(searchDir, '*.thrift');
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(searchDir, '*.thrift'),
                '**/node_modules/**'
            );

            // 添加匹配的 thrift 文件
            files.forEach(file => {
                const relativePath = path.relative(documentDir, file.fsPath);
                const fileName = path.basename(file.fsPath);
                
                // 只显示匹配前缀的文件
                if (fileName.startsWith(filePrefix) && fileName !== path.basename(document.uri.fsPath)) {
                    const displayPath = prefix.includes('/') ? relativePath : fileName;
                    const item = new vscode.CompletionItem(displayPath, vscode.CompletionItemKind.File);
                    item.detail = 'Thrift include file';
                    item.insertText = displayPath;
                    completions.push(item);
                }
            });

            // 添加子目录选项
            try {
                const dirs = await vscode.workspace.fs.readDirectory(vscode.Uri.file(searchDir));
                dirs.forEach(([name, type]) => {
                    if (type === vscode.FileType.Directory && !name.startsWith('.') && name.startsWith(filePrefix)) {
                        const displayPath = prefix.includes('/') 
                            ? path.join(path.relative(documentDir, searchDir), name, '')
                            : name + '/';
                        const item = new vscode.CompletionItem(displayPath, vscode.CompletionItemKind.Folder);
                        item.detail = 'Directory';
                        completions.push(item);
                    }
                });
            } catch (dirError) {
                // 目录读取失败时忽略
            }

            // 添加常见的相对路径选项（只在根目录时显示）
            if (!prefix.includes('/')) {
                const commonPaths = ['./', '../'];
                commonPaths.forEach(p => {
                    const item = new vscode.CompletionItem(p, vscode.CompletionItemKind.Folder);
                    item.detail = 'Relative path';
                    completions.push(item);
                });
            }
        } catch (error) {
            console.error('Error providing include path completions:', error);
        }

        return completions;
    }
}

export function registerCompletionProvider(context: vscode.ExtensionContext) {
    const provider = new ThriftCompletionProvider();

    const disposable = vscode.languages.registerCompletionItemProvider(
        'thrift',
        provider,
        '.', // 触发字符：点号
        '"', // 触发字符：双引号
        "'", // 触发字符：单引号
        ':', // 触发字符：冒号
        ' ', // 触发字符：空格
        '='  // 触发字符：等号
    );

    context.subscriptions.push(disposable);
}