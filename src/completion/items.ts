import * as vscode from 'vscode';
import * as path from 'path';
import {config} from '../config';

export const KEYWORDS = [
    'namespace', 'include', 'cpp_include', 'php_include', 'py_module',
    'perl_package', 'ruby_namespace', 'smalltalk_category', 'smalltalk_prefix',
    'java_package', 'cocoa_prefix', 'csharp_namespace', 'delphi_namespace',
    'cpp_namespace', 'd_namespace', 'c_glib', 'netstd', 'st',
    'xsd_all', 'xsd_optional', 'xsd_nillable', 'xsd_namespace', 'xsd_attrs',
    'const', 'typedef', 'enum', 'senum', 'struct', 'union', 'exception',
    'extends', 'service', 'oneway', 'void', 'throws', 'optional', 'required', 'async'
];

export const PRIMITIVES = [
    'bool', 'byte', 'i8', 'i16', 'i32', 'i64', 'double', 'string', 'binary',
    'uuid', 'slist', 'void'
];

export const CONTAINERS = ['list', 'set', 'map'];

export const NAMESPACE_LANGUAGES = [
    'c_glib', 'cpp', 'cpp_namespace', 'csharp_namespace', 'd_namespace',
    'delphi_namespace', 'go', 'java_package', 'js', 'lua', 'netstd',
    'perl', 'php', 'py', 'py.twisted', 'rb', 'rust', 'scala',
    'smalltalk_category', 'smalltalk_prefix', 'st', 'swift', 'xsd'
];

export const COMMON_METHODS = [
    'get', 'set', 'create', 'update', 'delete', 'find', 'list'
];

/**
 * 添加类型补全（基本类型 + 容器 + 用户定义类型）。
 * @param completions 补全列表容器
 * @param userTypes 用户定义的类型列表
 */
export function addTypeCompletions(completions: vscode.CompletionItem[], userTypes: string[]) {
    PRIMITIVES.forEach((p) => {
        completions.push(new vscode.CompletionItem(p, vscode.CompletionItemKind.Keyword));
    });
    CONTAINERS.forEach((c) => {
        const item = new vscode.CompletionItem(c, vscode.CompletionItemKind.Keyword);
        item.insertText = new vscode.SnippetString(`${c}<\${1:T}>`);
        completions.push(item);
    });
    userTypes.forEach((t) => {
        completions.push(new vscode.CompletionItem(t, vscode.CompletionItemKind.Class));
    });
}

/**
 * 添加枚举值补全。
 * @param completions 补全列表容器
 * @param values 枚举值列表
 */
export function addEnumValueCompletions(completions: vscode.CompletionItem[], values: string[]) {
    values.forEach((value) => {
        const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.EnumMember);
        item.detail = 'Enum value';
        completions.push(item);
    });
}

/**
 * 提供 include 路径补全（文件名与相对路径）。
 * @param document 当前文档
 * @param errorHandler 错误处理器
 * @returns 补全项列表
 */
export async function provideIncludePathCompletions(
    document: vscode.TextDocument,
    errorHandler: any // Simplified type to avoid circular dependency or import issue
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
        if (errorHandler && errorHandler.handleError) {
            errorHandler.handleError(error, {
                component: 'ThriftCompletionProvider',
                operation: 'provideIncludePathCompletions',
                filePath: document.uri.fsPath
            });
        }
    }

    return completions;
}
