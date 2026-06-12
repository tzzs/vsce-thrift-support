import * as vscode from 'vscode';
import {nodes, ThriftParser} from '@tanzz/thrift-core';
import {CoreDependencies} from './utils/dependencies';

export class ThriftSignatureHelpProvider implements vscode.SignatureHelpProvider {
    provideSignatureHelp(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SignatureHelp> {
        if (document.languageId !== 'thrift' || token?.isCancellationRequested) {
            return undefined;
        }

        const ast = this.parseDocument(document);
        const fn = this.findFunctionAtPosition(ast, position);
        if (fn === undefined || token?.isCancellationRequested) {
            return undefined;
        }

        const argList = this.findArgumentList(document, fn);
        if (argList === undefined || !this.positionInside(position, argList.open, argList.close)) {
            return undefined;
        }

        const activeParameter = this.countActiveParameter(document, argList.open, position);
        const parameters = fn.arguments.map(field => this.formatField(field));
        const throwsText = fn.throws.length > 0
            ? ` throws (${fn.throws.map(field => this.formatField(field)).join(', ')})`
            : '';
        const signature = {
            label: `${fn.returnType} ${fn.name ?? ''}(${parameters.join(', ')})${throwsText}`,
            parameters: parameters.map(label => ({label}))
        } as vscode.SignatureInformation;

        return {
            signatures: [signature],
            activeSignature: 0,
            activeParameter: Math.min(activeParameter, Math.max(parameters.length - 1, 0))
        };
    }

    private parseDocument(document: vscode.TextDocument): nodes.ThriftDocument {
        if (document.uri?.fsPath !== undefined) {
            return ThriftParser.parseWithCacheByVersion(document.uri.fsPath, document.getText(), document.version);
        }
        return new ThriftParser(document.getText()).parse();
    }

    private findFunctionAtPosition(
        ast: nodes.ThriftDocument,
        position: vscode.Position
    ): nodes.ThriftFunction | undefined {
        for (const node of ast.body) {
            if (node.type !== nodes.ThriftNodeType.Service && node.type !== nodes.ThriftNodeType.Interaction) {
                continue;
            }
            const fn = node.functions.find(candidate =>
                position.line >= candidate.range.start.line &&
                position.line <= candidate.range.end.line
            );
            if (fn !== undefined) {
                return fn;
            }
        }
        return undefined;
    }

    private findArgumentList(
        document: vscode.TextDocument,
        fn: nodes.ThriftFunction
    ): {open: vscode.Position; close: vscode.Position} | undefined {
        const startLine = fn.range.start.line;
        const firstLine = document.lineAt(startLine).text;
        const openChar = firstLine.indexOf('(', fn.nameRange?.end.character ?? fn.range.start.character);
        if (openChar === -1) {
            return undefined;
        }
        const open = new vscode.Position(startLine, openChar);
        const close = this.findMatchingParen(document, open);
        if (close === undefined) {
            return undefined;
        }
        return {open, close};
    }

    private findMatchingParen(document: vscode.TextDocument, open: vscode.Position): vscode.Position | undefined {
        let depth = 0;
        let inSingle = false;
        let inDouble = false;
        let escaped = false;
        for (let lineNo = open.line; lineNo < document.lineCount; lineNo++) {
            const line = document.lineAt(lineNo).text;
            const startChar = lineNo === open.line ? open.character : 0;
            for (let char = startChar; char < line.length; char++) {
                const current = line[char];
                if (inSingle || inDouble) {
                    if (!escaped && current === '\\') {
                        escaped = true;
                        continue;
                    }
                    if (!escaped && inSingle && current === '\'') {
                        inSingle = false;
                    } else if (!escaped && inDouble && current === '"') {
                        inDouble = false;
                    }
                    escaped = false;
                    continue;
                }
                if (current === '\'') {
                    inSingle = true;
                    continue;
                }
                if (current === '"') {
                    inDouble = true;
                    continue;
                }
                if (current === '(') {
                    depth++;
                } else if (current === ')') {
                    depth--;
                    if (depth === 0) {
                        return new vscode.Position(lineNo, char);
                    }
                }
            }
        }
        return undefined;
    }

    private countActiveParameter(document: vscode.TextDocument, open: vscode.Position, position: vscode.Position): number {
        let active = 0;
        let depthAngle = 0;
        let depthBracket = 0;
        let depthBrace = 0;
        let depthParen = 0;
        for (let lineNo = open.line; lineNo <= position.line; lineNo++) {
            const line = document.lineAt(lineNo).text;
            const start = lineNo === open.line ? open.character + 1 : 0;
            const end = lineNo === position.line ? position.character : line.length;
            for (let char = start; char < end; char++) {
                const current = line[char];
                if (current === '<') {
                    depthAngle++;
                } else if (current === '>') {
                    depthAngle = Math.max(0, depthAngle - 1);
                } else if (current === '[') {
                    depthBracket++;
                } else if (current === ']') {
                    depthBracket = Math.max(0, depthBracket - 1);
                } else if (current === '{') {
                    depthBrace++;
                } else if (current === '}') {
                    depthBrace = Math.max(0, depthBrace - 1);
                } else if (current === '(') {
                    depthParen++;
                } else if (current === ')') {
                    depthParen = Math.max(0, depthParen - 1);
                } else if ((current === ',' || current === ';') &&
                    depthAngle === 0 && depthBracket === 0 && depthBrace === 0 && depthParen === 0) {
                    active++;
                }
            }
        }
        return active;
    }

    private positionInside(position: vscode.Position, open: vscode.Position, close: vscode.Position): boolean {
        return this.compare(open, position) < 0 && this.compare(position, close) <= 0;
    }

    private compare(a: vscode.Position, b: vscode.Position): number {
        if (a.line !== b.line) {
            return a.line - b.line;
        }
        return a.character - b.character;
    }

    private formatField(field: nodes.Field): string {
        const requiredness = field.requiredness ? `${field.requiredness} ` : '';
        return `${field.id}: ${requiredness}${field.fieldType} ${field.name ?? ''}`;
    }
}

export function registerSignatureHelpProvider(context: vscode.ExtensionContext, _deps: CoreDependencies): void {
    context.subscriptions.push(
        vscode.languages.registerSignatureHelpProvider(
            'thrift',
            new ThriftSignatureHelpProvider(),
            '(',
            ',',
            ';'
        )
    );
}
