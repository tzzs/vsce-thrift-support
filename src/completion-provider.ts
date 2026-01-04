import * as vscode from 'vscode';
import * as path from 'path';
import {ThriftParser} from './ast/parser';
import * as nodes from './ast/nodes.types';
import {ErrorHandler} from './utils/error-handler';
import {CoreDependencies} from './utils/dependencies';
import {config} from './config';

/**
 * ThriftCompletionProvider：提供 Thrift 语言代码补全。
 */
export class ThriftCompletionProvider implements vscode.CompletionItemProvider {
    // 错误处理器
    private errorHandler: ErrorHandler;
    private keywords = [
        'namespace',
        'include',
        'cpp_include',
        'php_include',
        'py_module',
        'perl_package',
        'ruby_namespace',
        'smalltalk_category',
        'smalltalk_prefix',
        'java_package',
        'cocoa_prefix',
        'csharp_namespace',
        'delphi_namespace',
        'cpp_namespace',
        'd_namespace',
        'c_glib',
        'netstd',
        'st',
        'xsd_all',
        'xsd_optional',
        'xsd_nillable',
        'xsd_namespace',
        'xsd_attrs',
        'const',
        'typedef',
        'enum',
        'senum',
        'struct',
        'union',
        'exception',
        'extends',
        'service',
        'oneway',
        'void',
        'throws',
        'optional',
        'required',
        'async'
    ];

    private primitives = [
        'bool',
        'byte',
        'i8',
        'i16',
        'i32',
        'i64',
        'double',
        'string',
        'binary',
        'uuid',
        'slist',
        'void'
    ];

    private containers = ['list', 'set', 'map'];

    constructor(deps?: Partial<CoreDependencies>) {
        this.errorHandler = deps?.errorHandler ?? ErrorHandler.getInstance();
    }

    /**
     * 根据上下文返回补全项列表。
     */
    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        _context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList> {
        const thriftDoc = ThriftParser.parseWithCache(document);
        if (token.isCancellationRequested) {
            return [];
        }
        const completions: vscode.CompletionItem[] = [];

        // Determine context using AST
        const line = document.lineAt(position.line).text;
        const beforeCursor = line.substring(0, position.character);

        // 1. Include paths
        if (/^\s*include\s+["']?[^"']*$/.test(line)) {
            // Check if we are inside quotes
            const quoteMatch = beforeCursor.match(/include\s+(["'])/);
            if (quoteMatch) {
                const prefix = beforeCursor.substring(beforeCursor.indexOf(quoteMatch[1]) + 1);
                return await this.provideIncludePathCompletions(document, prefix);
            }
        }

        // 2. Namespace languages
        if (/^\s*namespace\s+\w*$/.test(line)) {
            const namespaceKeywords = [
                'c_glib',
                'cpp',
                'cpp_namespace',
                'csharp_namespace',
                'd_namespace',
                'delphi_namespace',
                'go',
                'java_package',
                'js',
                'lua',
                'netstd',
                'perl',
                'php',
                'py',
                'py.twisted',
                'rb',
                'rust',
                'scala',
                'smalltalk_category',
                'smalltalk_prefix',
                'st',
                'swift',
                'xsd'
            ];

            namespaceKeywords.forEach((keyword) => {
                const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
                item.detail = 'Namespace language';
                completions.push(item);
            });
            return completions;
        }

        // Collect available types and values from AST
        const {types, values} = this.collectTypesAndValues(thriftDoc);

        // 3. Inside a block (struct, enum, service)
        const blockNode = this.findBlockNode(thriftDoc, position.line);

        if (blockNode) {
            if (blockNode.type === nodes.ThriftNodeType.Enum) {
                // Inside Enum: usually validating or just ensuring syntax, but actually Enum members are defined by user.
                // We typically assume new line in enum means new member or end.
                // Context-wise, we might not need to provide much inside an enum definition unless it's assigning values?
                // Actually, if we are in an enum, we are defining members.
            } else if (nodes.isServiceNode(blockNode)) {
                // Inside Service: expecting methods
                // Check if we are at start of line (return type) or after type (name) or throws
                if (this.isInMethodContext(line, position.character)) {
                    // Common method names/verbs could be suggested?
                    const commonMethods = [
                        'get',
                        'set',
                        'create',
                        'update',
                        'delete',
                        'find',
                        'list'
                    ];
                    commonMethods.forEach((method) => {
                        const item = new vscode.CompletionItem(
                            method,
                            vscode.CompletionItemKind.Method
                        );
                        completions.push(item);
                    });

                    // Also types for return type
                    this.addTypeCompletions(completions, types);
                }
            } else {
                // Struct/Union/Exception/Function Args: expecting fields (ID: Type Name)
                // If at start, suggest types? No, start is ID.
                // If after ID, suggest 'required', 'optional' or Types.

                // Heuristic: check if we match "ID :"
                if (
                    /^\s*\d+\s*:\s*$/.test(beforeCursor) ||
                    /^\s*\d+\s*:\s*(required|optional)\s+$/.test(beforeCursor)
                ) {
                    this.addTypeCompletions(completions, types);
                }

                // If we are typing 'required'/'optional'
                if (/^\s*\d+\s*:\s*\w*$/.test(beforeCursor) && !beforeCursor.trim().endsWith(':')) {
                    if (!nodes.isServiceNode(blockNode)) {
                        // Services don't use required/optional usually?
                        ['required', 'optional'].forEach((k) => {
                            completions.push(
                                new vscode.CompletionItem(k, vscode.CompletionItemKind.Keyword)
                            );
                        });
                    }
                    this.addTypeCompletions(completions, types);
                }
            }
        } else {
            // Top level: suggest keywords (struct, enum, etc.)
            this.keywords.forEach((k) => {
                completions.push(new vscode.CompletionItem(k, vscode.CompletionItemKind.Keyword));
            });
        }

        // General type completion if it looks like a type context
        if (this.looksLikeTypeContext(line, position.character)) {
            this.addTypeCompletions(completions, types);
        }

        // Check for enum value assignment context
        if (this.isInEnumAssignmentContext(line, position.character, thriftDoc)) {
            this.addEnumValueCompletions(completions, values);
        }

        return completions;
    }

    private findBlockNode(doc: nodes.ThriftDocument, line: number): nodes.ThriftNode | undefined {
        // Find the deepest node that covers the line
        for (const node of doc.body) {
            if (node.range.contains(new vscode.Position(line, 0))) {
                return node;
            }
        }
        return undefined;
    }

    private collectTypesAndValues(doc: nodes.ThriftDocument) {
        const types: string[] = [];
        const values: string[] = [];

        for (const node of doc.body) {
            if (node.name) {
                if (
                    nodes.isStructNode(node) ||
                    nodes.isEnumNode(node) ||
                    node.type === nodes.ThriftNodeType.Typedef
                ) {
                    types.push(node.name);
                }
                if (
                    node.type === nodes.ThriftNodeType.Const ||
                    node.type === nodes.ThriftNodeType.EnumMember
                ) {
                    values.push(node.name);
                }
            }
            // For enums, members are children
            if (nodes.isEnumNode(node)) {
                node.members.forEach((m) => {
                    if (m.name) {
                        values.push(m.name);
                    }
                });
            }
        }
        return {types, values};
    }

    private addTypeCompletions(completions: vscode.CompletionItem[], userTypes: string[]) {
        this.primitives.forEach((p) => {
            completions.push(new vscode.CompletionItem(p, vscode.CompletionItemKind.Keyword));
        });
        this.containers.forEach((c) => {
            const item = new vscode.CompletionItem(c, vscode.CompletionItemKind.Keyword);
            item.insertText = new vscode.SnippetString(`${c}<\${1:T}>`);
            completions.push(item);
        });
        userTypes.forEach((t) => {
            completions.push(new vscode.CompletionItem(t, vscode.CompletionItemKind.Class));
        });
    }

    private looksLikeTypeContext(line: string, char: number): boolean {
        const before = line.substring(0, char);
        // After "1: " or "1: required "
        if (/(?:^|\s)\d+:\s*(?:(required|optional)\s+)?$/.test(before)) {
            return true;
        }
        // Function args: (type name
        if (/\(\s*$/.test(before) || /,\s*$/.test(before)) {
            return true; // loose heuristic
        }
        return false;
    }

    private isInMethodContext(line: string, character: number): boolean {
        const beforeCursor = line.substring(0, character);
        if (/^\s*\w+\s+\w*$/.test(beforeCursor) || /^\s*\w*$/.test(beforeCursor)) {
            return true;
        }
        return false;
    }

    private isInEnumAssignmentContext(
        line: string,
        character: number,
        doc: nodes.ThriftDocument
    ): boolean {
        const beforeCursor = line.substring(0, character);

        // Check if we're in a pattern like "Type fieldName = " or "1: required Type fieldName = "
        // Match patterns like:
        // "Status status = "
        // "1: required Status status = "
        // "1: optional Status status = "
        const assignmentMatch = beforeCursor.match(
            /^\s*(?:\d+\s*:\s*(?:required|optional)\s+)?(\w+)\s+(\w+)\s*=\s*$/
        );
        if (!assignmentMatch) {
            return false;
        }

        const [, typeName] = assignmentMatch;

        // Check if the type is an enum in the document
        for (const node of doc.body) {
            if (nodes.isEnumNode(node) && node.name === typeName) {
                return true;
            }
        }

        return false;
    }

    private addEnumValueCompletions(completions: vscode.CompletionItem[], values: string[]) {
        values.forEach((value) => {
            const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.EnumMember);
            item.detail = 'Enum value';
            completions.push(item);
        });
    }

    private async provideIncludePathCompletions(
        document: vscode.TextDocument,
        prefix: string
    ): Promise<vscode.CompletionItem[]> {
        const completions: vscode.CompletionItem[] = [];
        const documentDir = path.dirname(document.uri.fsPath);

        try {
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(documentDir, '*.thrift'),
                config.filePatterns.excludeNodeModules
            );

            files.forEach((file) => {
                const fileName = path.basename(file.fsPath);
                if (fileName !== path.basename(document.uri.fsPath)) {
                    const item = new vscode.CompletionItem(
                        fileName,
                        vscode.CompletionItemKind.File
                    );
                    item.detail = 'Thrift include file';
                    item.insertText = fileName;
                    completions.push(item);
                }
            });

            const commonPaths = ['./', '../'];
            commonPaths.forEach((p) => {
                const item = new vscode.CompletionItem(p, vscode.CompletionItemKind.Folder);
                item.detail = 'Relative path';
                completions.push(item);
            });
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftCompletionProvider',
                operation: 'provideIncludePathCompletions',
                filePath: document.uri.fsPath,
                additionalInfo: {prefix}
            });
        }

        return completions;
    }
}

/**
 * 注册 CompletionProvider。
 */
export function registerCompletionProvider(context: vscode.ExtensionContext, deps?: Partial<CoreDependencies>) {
    const provider = new ThriftCompletionProvider(deps);

    const disposable = vscode.languages.registerCompletionItemProvider(
        'thrift',
        provider,
        '.',
        '"',
        "'",
        ':',
        ' ',
        '='
    );

    context.subscriptions.push(disposable);
}
