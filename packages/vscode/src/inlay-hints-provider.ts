import * as vscode from 'vscode';
import {ThriftParser, nodes} from '@tanzz/thrift-core';
import {CoreDependencies} from './utils/dependencies';
import {buildServiceIndex, extractTypeReferences} from './call-hierarchy-provider';

interface WorkspaceAst {
    uri: vscode.Uri;
    ast: nodes.ThriftDocument;
}

interface InlayHintOptions {
    requiredness: boolean;
    includeAliases: boolean;
    serviceOverrides: boolean;
}

export class ThriftInlayHintsProvider implements vscode.InlayHintsProvider {
    private readonly workspaceIndex?: CoreDependencies['workspaceIndex'];

    constructor(deps?: Partial<CoreDependencies>) {
        this.workspaceIndex = deps?.workspaceIndex;
    }

    async provideInlayHints(
        document: vscode.TextDocument,
        range: vscode.Range,
        token: vscode.CancellationToken
    ): Promise<vscode.InlayHint[]> {
        if (token.isCancellationRequested) {
            return [];
        }
        const options = getInlayHintOptions();
        if (!options.requiredness && !options.includeAliases && !options.serviceOverrides) {
            return [];
        }

        const ast = this.parse(document.getText());
        if (ast === undefined) {
            return [];
        }

        const hints: vscode.InlayHint[] = [];
        if (options.requiredness) {
            this.collectRequirednessHints(document, ast, range, hints);
        }
        const docs = options.includeAliases || options.serviceOverrides
            ? await this.getWorkspaceDocuments(document)
            : [];
        if (options.includeAliases) {
            this.collectIncludeAliasHints(ast, docs, range, hints);
        }
        if (options.serviceOverrides && !token.isCancellationRequested) {
            this.collectServiceOverrideHints(ast, docs, range, hints, token);
        }

        return token.isCancellationRequested ? [] : hints;
    }

    private collectRequirednessHints(
        document: vscode.TextDocument,
        ast: nodes.ThriftDocument,
        range: vscode.Range,
        hints: vscode.InlayHint[]
    ): void {
        for (const node of ast.body) {
            if (!nodes.isStructNode(node)) {
                continue;
            }
            for (const field of node.fields) {
                if (field.typeRange === undefined || !isPositionInRange(field.typeRange.start, range)) {
                    continue;
                }
                const line = document.lineAt(field.typeRange.start.line).text;
                const beforeType = line.slice(0, field.typeRange.start.character);
                if (/\b(?:required|optional)\b/.test(beforeType)) {
                    continue;
                }
                hints.push(new vscode.InlayHint(
                    new vscode.Position(field.typeRange.start.line, field.typeRange.start.character),
                    'default',
                    vscode.InlayHintKind.Type
                ));
            }
        }
    }

    private collectIncludeAliasHints(
        ast: nodes.ThriftDocument,
        docs: WorkspaceAst[],
        range: vscode.Range,
        hints: vscode.InlayHint[]
    ): void {
        const aliasByType = buildIncludedAliasByType(ast, docs);
        if (aliasByType.size === 0) {
            return;
        }
        visitTypeRanges(ast, (typeText, typeRange) => {
            if (typeRange === undefined || typeText.includes('.')) {
                return;
            }
            const references = extractTypeReferences(typeText);
            if (references.length !== 1) {
                return;
            }
            const alias = aliasByType.get(references[0]);
            if (alias === undefined) {
                return;
            }
            const position = new vscode.Position(typeRange.end.line, typeRange.end.character);
            if (!range.contains(position)) {
                return;
            }
            hints.push(new vscode.InlayHint(position, `from ${alias}`, vscode.InlayHintKind.Type));
        });
    }

    private collectServiceOverrideHints(
        ast: nodes.ThriftDocument,
        docs: WorkspaceAst[],
        range: vscode.Range,
        hints: vscode.InlayHint[],
        token: vscode.CancellationToken
    ): void {
        const serviceIndex = buildServiceIndex(docs);
        for (const node of ast.body) {
            if (token.isCancellationRequested || node.type !== nodes.ThriftNodeType.Service) {
                continue;
            }
            const serviceName = node.name ?? '';
            const entry = serviceIndex.get(serviceName);
            if (entry === undefined) {
                continue;
            }
            for (const fn of node.functions) {
                if (token.isCancellationRequested || fn.nameRange === undefined) {
                    return;
                }
                const parentName = findNearestAncestorWithMethod(serviceIndex, entry.extendsName, fn.name ?? '');
                if (parentName === undefined) {
                    continue;
                }
                const position = new vscode.Position(fn.nameRange.end.line, fn.nameRange.end.character);
                if (!range.contains(position)) {
                    continue;
                }
                hints.push(new vscode.InlayHint(position, `overrides ${parentName}`, vscode.InlayHintKind.Type));
            }
        }
    }

    private async getWorkspaceDocuments(document: vscode.TextDocument): Promise<WorkspaceAst[]> {
        const currentUri = uriKey(document.uri);
        const docs: WorkspaceAst[] = [{uri: document.uri, ast: new ThriftParser(document.getText()).parse()}];
        if (this.workspaceIndex === undefined) {
            return docs;
        }

        for (const uri of this.workspaceIndex.getAllFiles()) {
            if (uriKey(uri) === currentUri) {
                continue;
            }
            try {
                docs.push({uri, ast: new ThriftParser(await this.workspaceIndex.getText(uri)).parse()});
            } catch {
                // Skip stale or unreadable indexed files.
            }
        }
        return docs;
    }

    private parse(text: string): nodes.ThriftDocument | undefined {
        try {
            return new ThriftParser(text).parse();
        } catch {
            return undefined;
        }
    }
}

export function registerInlayHintsProvider(
    context: vscode.ExtensionContext,
    deps?: Partial<CoreDependencies>
): ThriftInlayHintsProvider {
    const provider = new ThriftInlayHintsProvider(deps);
    context.subscriptions.push(
        vscode.languages.registerInlayHintsProvider('thrift', provider)
    );
    return provider;
}

function getInlayHintOptions(): InlayHintOptions {
    const config = vscode.workspace.getConfiguration('thrift.inlayHints');
    return {
        requiredness: config.get<boolean>('requiredness', false),
        includeAliases: config.get<boolean>('includeAliases', false),
        serviceOverrides: config.get<boolean>('serviceOverrides', true)
    };
}

function findNearestAncestorWithMethod(
    serviceIndex: ReturnType<typeof buildServiceIndex>,
    parentName: string | undefined,
    methodName: string
): string | undefined {
    let current = parentName;
    const seen = new Set<string>();
    while (current !== undefined && current !== '' && !seen.has(current)) {
        seen.add(current);
        const parent = serviceIndex.get(current);
        if (parent === undefined) {
            return undefined;
        }
        if (parent.methods.some(method => method.methodName === methodName)) {
            return parent.serviceName;
        }
        current = parent.extendsName;
    }
    return undefined;
}

function inferIncludeAlias(includePath: string): string {
    const lastSegment = includePath.split(/[\\/]/).pop() ?? includePath;
    return lastSegment.replace(/\.thrift$/i, '');
}

function buildIncludedAliasByType(ast: nodes.ThriftDocument, docs: WorkspaceAst[]): Map<string, string> {
    const aliasByType = new Map<string, string>();
    const includes = ast.body.filter((node): node is nodes.Include =>
        node.type === nodes.ThriftNodeType.Include && node.includeKind !== 'cpp_include'
    );
    for (const includeNode of includes) {
        const includedDoc = docs.find(doc => uriPathMatchesInclude(doc.uri, includeNode.path));
        if (includedDoc === undefined) {
            continue;
        }
        const alias = inferIncludeAlias(includeNode.path);
        for (const node of includedDoc.ast.body) {
            if (node.name !== undefined && node.name.length > 0 && isAliasableType(node)) {
                aliasByType.set(node.name, alias);
            }
        }
    }
    return aliasByType;
}

function visitTypeRanges(
    ast: nodes.ThriftDocument,
    visitor: (typeText: string, range: nodes.ThriftNode['nameRange']) => void
): void {
    for (const node of ast.body) {
        switch (node.type) {
            case nodes.ThriftNodeType.Const:
                visitor(node.valueType, node.valueTypeRange);
                break;
            case nodes.ThriftNodeType.Typedef:
                visitor(node.aliasType, node.aliasTypeRange);
                break;
            case nodes.ThriftNodeType.Struct:
            case nodes.ThriftNodeType.Union:
            case nodes.ThriftNodeType.Exception:
                for (const field of node.fields) {
                    visitor(field.fieldType, field.typeRange);
                }
                break;
            case nodes.ThriftNodeType.Service:
            case nodes.ThriftNodeType.Interaction:
                for (const fn of node.functions) {
                    visitor(fn.returnType, fn.returnTypeRange);
                    for (const arg of fn.arguments) {
                        visitor(arg.fieldType, arg.typeRange);
                    }
                    for (const field of fn.throws) {
                        visitor(field.fieldType, field.typeRange);
                    }
                }
                break;
            default:
                break;
        }
    }
}

function isAliasableType(node: nodes.ThriftNode): boolean {
    return node.type === nodes.ThriftNodeType.Struct ||
        node.type === nodes.ThriftNodeType.Union ||
        node.type === nodes.ThriftNodeType.Exception ||
        node.type === nodes.ThriftNodeType.Enum ||
        node.type === nodes.ThriftNodeType.Typedef ||
        node.type === nodes.ThriftNodeType.Service ||
        node.type === nodes.ThriftNodeType.Interaction;
}

function uriPathMatchesInclude(uri: vscode.Uri, includePath: string): boolean {
    const fsPath = uri.fsPath.replace(/\\/g, '/');
    const normalizedInclude = includePath.replace(/\\/g, '/');
    return fsPath.endsWith(`/${normalizedInclude}`) || fsPath.endsWith(`/${normalizedInclude.split('/').pop() ?? normalizedInclude}`);
}

function isPositionInRange(position: {line: number; character: number}, range: vscode.Range): boolean {
    return range.contains(new vscode.Position(position.line, position.character));
}

function uriKey(uri: vscode.Uri): string {
    return uri.toString();
}
