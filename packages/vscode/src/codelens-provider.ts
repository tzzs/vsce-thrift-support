import * as vscode from 'vscode';
import {ThriftParser, nodes} from '@tanzz/thrift-core';
import {CoreDependencies} from './utils/dependencies';
import {toVscodeRange} from './utils/vscode-utils';
import {buildServiceIndex, collectTransitiveChildren, extractTypeReferences} from './call-hierarchy-provider';

interface WorkspaceAst {
    uri: vscode.Uri;
    ast: nodes.ThriftDocument;
}

export class ThriftCodeLensProvider implements vscode.CodeLensProvider {
    private readonly workspaceIndex?: CoreDependencies['workspaceIndex'];

    constructor(deps?: Partial<CoreDependencies>) {
        this.workspaceIndex = deps?.workspaceIndex;
    }

    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        if (token.isCancellationRequested) {
            return [];
        }
        const ast = this.parse(document.getText());
        if (ast === undefined) {
            return [];
        }

        const docs = await this.getWorkspaceDocuments(document);
        if (token.isCancellationRequested) {
            return [];
        }

        const lenses: vscode.CodeLens[] = [];
        this.collectReferenceLenses(document, ast, docs, lenses, token);
        this.collectOverrideLenses(document, ast, docs, lenses, token);
        return token.isCancellationRequested ? [] : lenses;
    }

    private collectReferenceLenses(
        document: vscode.TextDocument,
        ast: nodes.ThriftDocument,
        docs: WorkspaceAst[],
        lenses: vscode.CodeLens[],
        token: vscode.CancellationToken
    ): void {
        for (const node of ast.body) {
            if (token.isCancellationRequested) {
                return;
            }
            if (!isReferenceLensTarget(node) || node.nameRange === undefined || node.name === undefined || node.name === '') {
                continue;
            }
            const locations = collectReferenceLocations(docs, node.name);
            lenses.push(new vscode.CodeLens(toVscodeRange(node.nameRange), {
                title: formatReferenceTitle(locations.length),
                command: 'editor.action.showReferences',
                arguments: [
                    document.uri,
                    new vscode.Position(node.nameRange.start.line, node.nameRange.start.character),
                    locations
                ]
            }));
        }
    }

    private collectOverrideLenses(
        document: vscode.TextDocument,
        ast: nodes.ThriftDocument,
        docs: WorkspaceAst[],
        lenses: vscode.CodeLens[],
        token: vscode.CancellationToken
    ): void {
        const serviceIndex = buildServiceIndex(docs);
        for (const node of ast.body) {
            if (token.isCancellationRequested || node.type !== nodes.ThriftNodeType.Service) {
                continue;
            }
            const serviceName = node.name ?? '';
            if (serviceName === '') {
                continue;
            }
            const childServices = collectTransitiveChildren(serviceIndex, serviceName);
            for (const fn of node.functions) {
                if (token.isCancellationRequested || fn.nameRange === undefined) {
                    return;
                }
                const overrides: vscode.Location[] = [];
                for (const child of childServices) {
                    for (const method of child.methods) {
                        if (method.methodName === fn.name) {
                            overrides.push(new vscode.Location(
                                method.uri,
                                toVscodeRange(method.funcNode.nameRange ?? method.funcNode.range)
                            ));
                        }
                    }
                }
                if (overrides.length === 0) {
                    continue;
                }
                lenses.push(new vscode.CodeLens(toVscodeRange(fn.nameRange), {
                    title: formatOverrideTitle(overrides.length),
                    command: 'editor.action.showReferences',
                    arguments: [
                        document.uri,
                        new vscode.Position(fn.nameRange.start.line, fn.nameRange.start.character),
                        overrides
                    ]
                }));
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

export function registerCodeLensProvider(
    context: vscode.ExtensionContext,
    deps?: Partial<CoreDependencies>
): ThriftCodeLensProvider {
    const provider = new ThriftCodeLensProvider(deps);
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider('thrift', provider)
    );
    return provider;
}

function collectReferenceLocations(docs: WorkspaceAst[], targetName: string): vscode.Location[] {
    const locations: vscode.Location[] = [];
    for (const doc of docs) {
        for (const node of doc.ast.body) {
            collectReferencesFromNode(doc.uri, node, targetName, locations);
        }
    }
    return locations;
}

function collectReferencesFromNode(
    uri: vscode.Uri,
    node: nodes.ThriftNode,
    targetName: string,
    locations: vscode.Location[]
): void {
    switch (node.type) {
        case nodes.ThriftNodeType.Const:
            addTypeReference(uri, node.valueType, node.valueTypeRange, targetName, locations);
            break;
        case nodes.ThriftNodeType.Typedef:
            addTypeReference(uri, node.aliasType, node.aliasTypeRange, targetName, locations);
            break;
        case nodes.ThriftNodeType.Struct:
        case nodes.ThriftNodeType.Union:
        case nodes.ThriftNodeType.Exception:
            for (const field of node.fields) {
                addTypeReference(uri, field.fieldType, field.typeRange, targetName, locations);
            }
            break;
        case nodes.ThriftNodeType.Service:
            if (node.extends === targetName && node.extendsRange !== undefined) {
                locations.push(new vscode.Location(uri, toVscodeRange(node.extendsRange)));
            }
            for (const fn of node.functions) {
                collectReferencesFromFunction(uri, fn, targetName, locations);
            }
            break;
        case nodes.ThriftNodeType.Interaction:
            for (const fn of node.functions) {
                collectReferencesFromFunction(uri, fn, targetName, locations);
            }
            break;
        default:
            break;
    }
}

function collectReferencesFromFunction(
    uri: vscode.Uri,
    fn: nodes.ThriftFunction,
    targetName: string,
    locations: vscode.Location[]
): void {
    addTypeReference(uri, fn.returnType, fn.returnTypeRange, targetName, locations);
    for (const arg of fn.arguments) {
        addTypeReference(uri, arg.fieldType, arg.typeRange, targetName, locations);
    }
    for (const field of fn.throws) {
        addTypeReference(uri, field.fieldType, field.typeRange, targetName, locations);
    }
}

function addTypeReference(
    uri: vscode.Uri,
    typeText: string,
    range: nodes.ThriftNode['nameRange'],
    targetName: string,
    locations: vscode.Location[]
): void {
    if (range === undefined || !extractTypeReferences(typeText).includes(targetName)) {
        return;
    }
    locations.push(new vscode.Location(uri, toVscodeRange(range)));
}

function isReferenceLensTarget(node: nodes.ThriftNode): boolean {
    return node.type === nodes.ThriftNodeType.Struct ||
        node.type === nodes.ThriftNodeType.Union ||
        node.type === nodes.ThriftNodeType.Exception ||
        node.type === nodes.ThriftNodeType.Enum ||
        node.type === nodes.ThriftNodeType.Typedef ||
        node.type === nodes.ThriftNodeType.Service ||
        node.type === nodes.ThriftNodeType.Interaction;
}

function formatReferenceTitle(count: number): string {
    return count === 1 ? '1 reference' : `${count} references`;
}

function formatOverrideTitle(count: number): string {
    return count === 1 ? '1 override' : `${count} overrides`;
}

function uriKey(uri: vscode.Uri): string {
    return uri.toString();
}
