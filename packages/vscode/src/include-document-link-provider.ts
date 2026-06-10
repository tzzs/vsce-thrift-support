import * as path from 'path';
import * as vscode from 'vscode';
import {collectIncludes, safeResolveIncludePath, ThriftParser} from '@tanzz/thrift-core';
import {CoreDependencies} from './utils/dependencies';
import {ErrorHandler} from '@tanzz/thrift-core';

export class ThriftIncludeDocumentLinkProvider implements vscode.DocumentLinkProvider {
    private readonly errorHandler: ErrorHandler;

    constructor(deps?: Partial<CoreDependencies>) {
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();
    }

    provideDocumentLinks(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DocumentLink[]> {
        if (token.isCancellationRequested || document.languageId !== 'thrift') {
            return [];
        }

        try {
            const ast = ThriftParser.parseWithCacheByVersion(document.uri.fsPath, document.getText(), document.version);
            const links: vscode.DocumentLink[] = [];
            for (const includeNode of collectIncludes(ast)) {
                const lineNumber = includeNode.range.start.line;
                const line = document.lineAt(lineNumber).text;
                const range = findIncludePathRange(line, lineNumber, includeNode.path);
                if (range === undefined) {
                    continue;
                }
                const documentDir = path.dirname(document.uri.fsPath);
                const workspaceRoot = getWorkspaceRootForDocument(document.uri) ?? documentDir;
                const targetPath = safeResolveIncludePath(includeNode.path, documentDir, workspaceRoot);
                if (targetPath === undefined) {
                    continue;
                }
                const target = vscode.Uri.file(targetPath);
                links.push({range, target});
            }
            return links;
        } catch (error) {
            this.errorHandler.handleWarning('Include document link generation failed', {
                component: 'ThriftIncludeDocumentLinkProvider',
                operation: 'provideDocumentLinks',
                filePath: document.uri.fsPath,
                additionalInfo: {error: error instanceof Error ? error.message : 'Unknown error'}
            });
            return [];
        }
    }
}

export function registerIncludeDocumentLinkProvider(context: vscode.ExtensionContext, deps: CoreDependencies): void {
    context.subscriptions.push(
        vscode.languages.registerDocumentLinkProvider('thrift', new ThriftIncludeDocumentLinkProvider(deps))
    );
}

function getWorkspaceRootForDocument(uri: vscode.Uri): string | undefined {
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        const relative = path.relative(folder.uri.fsPath, uri.fsPath);
        if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
            return folder.uri.fsPath;
        }
    }
    return undefined;
}

function findIncludePathRange(line: string, lineNumber: number, includePath: string): vscode.Range | undefined {
    const match = /\binclude\s+(['"])(.*?)\1/.exec(line);
    if (match === null || match[2] !== includePath) {
        return undefined;
    }
    const startCharacter = (match.index ?? 0) + match[0].indexOf(match[2]);
    return new vscode.Range(lineNumber, startCharacter, lineNumber, startCharacter + includePath.length);
}
