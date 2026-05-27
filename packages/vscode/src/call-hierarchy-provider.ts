import * as vscode from 'vscode';
import {ThriftParser, nodes, ErrorHandler, config, parseContainerTypeInfo} from '@tanzz/thrift-core';
import {CoreDependencies} from './utils/dependencies';
import {toVscodeRange} from './utils/vscode-utils';

const PRIMITIVE_TYPES = new Set<string>([
    'void', 'bool', 'byte', 'i8', 'i16', 'i32', 'i64',
    'double', 'string', 'binary', 'uuid', 'slist'
]);

const CONTAINER_KEYWORDS = new Set<string>([
    'list', 'set', 'map', 'stream', 'sink'
]);

export interface ServiceMethodLocation {
    serviceName: string;
    methodName: string;
    funcNode: nodes.ThriftFunction;
    serviceNode: nodes.Service | nodes.Interaction;
    uri: vscode.Uri;
}

export function forEachServiceMethod(
    ast: nodes.ThriftDocument,
    uri: vscode.Uri,
    visitor: (entry: ServiceMethodLocation) => void
): void {
    for (const node of ast.body) {
        if (node.type === nodes.ThriftNodeType.Service || node.type === nodes.ThriftNodeType.Interaction) {
            const container = node;
            const serviceName = container.name ?? '';
            for (const func of container.functions) {
                visitor({
                    serviceName,
                    methodName: func.name ?? '',
                    funcNode: func,
                    serviceNode: container,
                    uri
                });
            }
        }
    }
}

export function extractTypeReferences(typeText: string): string[] {
    if (!typeText) {
        return [];
    }
    const result = new Set<string>();
    const container = parseContainerTypeInfo(typeText);
    const sourceTexts = container ? container.typeArgs : [typeText];
    for (const arg of sourceTexts) {
        scanIdentifiers(arg, result);
    }
    return Array.from(result);
}

function scanIdentifiers(text: string, out: Set<string>): void {
    // Match dotted identifiers as a single unit so `shared.User` → 'User' (the type),
    // not 'shared' + 'User'.
    const matches = text.match(/[A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z_][A-Za-z_0-9]*)*/g);
    if (!matches) {
        return;
    }
    for (const ident of matches) {
        if (PRIMITIVE_TYPES.has(ident) || CONTAINER_KEYWORDS.has(ident)) {
            continue;
        }
        const lastDot = ident.lastIndexOf('.');
        if (lastDot >= 0) {
            out.add(ident.slice(lastDot + 1));
        } else {
            out.add(ident);
        }
    }
}

export function findFunctionAtPosition(
    ast: nodes.ThriftDocument,
    line: number,
    character: number
): {func: nodes.ThriftFunction; service: nodes.Service | nodes.Interaction} | null {
    for (const node of ast.body) {
        if (node.type !== nodes.ThriftNodeType.Service && node.type !== nodes.ThriftNodeType.Interaction) {
            continue;
        }
        for (const func of node.functions) {
            const nr = func.nameRange ?? func.range;
            if (positionInRange(line, character, nr.start.line, nr.start.character, nr.end.line, nr.end.character)) {
                return {func, service: node};
            }
            const fr = func.range;
            if (positionInRange(line, character, fr.start.line, fr.start.character, fr.end.line, fr.end.character)) {
                return {func, service: node};
            }
        }
    }
    return null;
}

function positionInRange(
    line: number,
    character: number,
    sLine: number,
    sChar: number,
    eLine: number,
    eChar: number
): boolean {
    if (line < sLine || line > eLine) {
        return false;
    }
    if (line === sLine && character < sChar) {
        return false;
    }
    if (line === eLine && character > eChar) {
        return false;
    }
    return true;
}

/**
 * AST-driven Call Hierarchy for Thrift IDL.
 *
 * Semantics adapted to IDL (no method bodies):
 * - Outgoing calls = parent-service same-name method (override target) + each type
 *   the method references resolved to its workspace definition.
 * - Incoming calls = same-name methods in child services that extend this method's
 *   service transitively across the workspace.
 */
export class ThriftCallHierarchyProvider implements vscode.CallHierarchyProvider {
    private readonly errorHandler: ErrorHandler;
    private readonly decoder = new TextDecoder('utf-8');

    constructor(deps?: Partial<CoreDependencies>) {
        this.errorHandler = deps?.errorHandler ?? new ErrorHandler();
    }

    public prepareCallHierarchy(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.CallHierarchyItem | vscode.CallHierarchyItem[] | undefined {
        if (token.isCancellationRequested) {
            return undefined;
        }
        try {
            const ast = this.parseDocument(document);
            if (!ast) {
                return undefined;
            }
            const hit = findFunctionAtPosition(ast, position.line, position.character);
            if (!hit) {
                return undefined;
            }
            return createMethodItem(hit.func, hit.service, document.uri);
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftCallHierarchyProvider',
                operation: 'prepareCallHierarchy',
                filePath: document.uri.fsPath
            });
            return undefined;
        }
    }

    public async provideCallHierarchyIncomingCalls(
        item: vscode.CallHierarchyItem,
        token: vscode.CancellationToken
    ): Promise<vscode.CallHierarchyIncomingCall[]> {
        if (token.isCancellationRequested) {
            return [];
        }
        try {
            const result: vscode.CallHierarchyIncomingCall[] = [];
            const itemServiceName = parseServiceFromDetail(item.detail ?? '');
            if (itemServiceName === null) {
                return [];
            }
            const targetMethodName = item.name;

            const allDocs = await this.getWorkspaceDocuments();
            const serviceIndex = buildServiceIndex(allDocs);
            const childServices = collectTransitiveChildren(serviceIndex, itemServiceName);

            for (const child of childServices) {
                if (token.isCancellationRequested) {
                    break;
                }
                for (const method of child.methods) {
                    if (method.methodName === targetMethodName) {
                        const callerItem = createMethodItem(method.funcNode, method.serviceNode, method.uri);
                        result.push(new vscode.CallHierarchyIncomingCall(callerItem, [
                            toVscodeRange(method.funcNode.nameRange ?? method.funcNode.range)
                        ]));
                    }
                }
            }
            return result;
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftCallHierarchyProvider',
                operation: 'provideIncomingCalls'
            });
            return [];
        }
    }

    public async provideCallHierarchyOutgoingCalls(
        item: vscode.CallHierarchyItem,
        token: vscode.CancellationToken
    ): Promise<vscode.CallHierarchyOutgoingCall[]> {
        if (token.isCancellationRequested) {
            return [];
        }
        try {
            const result: vscode.CallHierarchyOutgoingCall[] = [];
            const ast = await this.loadAst(item.uri);
            if (!ast) {
                return [];
            }
            const hit = findFunctionAtPosition(
                ast,
                item.selectionRange.start.line,
                item.selectionRange.start.character
            );
            if (!hit) {
                return [];
            }

            const allDocs = await this.getWorkspaceDocuments();
            const typeIndex = buildTypeIndex(allDocs);
            const serviceIndex = buildServiceIndex(allDocs);

            if (hit.service.type === nodes.ThriftNodeType.Service) {
                const parentName = hit.service.extends;
                if (parentName !== undefined && parentName !== '') {
                    const parentEntry = serviceIndex.get(parentName);
                    if (parentEntry) {
                        for (const m of parentEntry.methods) {
                            if (m.methodName === hit.func.name) {
                                const parentItem = createMethodItem(m.funcNode, m.serviceNode, m.uri);
                                result.push(new vscode.CallHierarchyOutgoingCall(parentItem, [
                                    toVscodeRange(m.funcNode.nameRange ?? m.funcNode.range)
                                ]));
                            }
                        }
                    }
                }
            }

            const referenced = new Set<string>();
            for (const t of extractTypeReferences(hit.func.returnType)) {
                referenced.add(t);
            }
            for (const arg of hit.func.arguments) {
                for (const t of extractTypeReferences(arg.fieldType)) {
                    referenced.add(t);
                }
            }
            for (const thr of hit.func.throws) {
                for (const t of extractTypeReferences(thr.fieldType)) {
                    referenced.add(t);
                }
            }

            for (const typeName of referenced) {
                if (token.isCancellationRequested) {
                    break;
                }
                const def = typeIndex.get(typeName);
                if (!def) {
                    continue;
                }
                const typeItem = createTypeItem(def);
                result.push(new vscode.CallHierarchyOutgoingCall(typeItem, [
                    toVscodeRange(def.node.nameRange ?? def.node.range)
                ]));
            }

            return result;
        } catch (error) {
            this.errorHandler.handleError(error, {
                component: 'ThriftCallHierarchyProvider',
                operation: 'provideOutgoingCalls'
            });
            return [];
        }
    }

    private parseDocument(document: vscode.TextDocument): nodes.ThriftDocument | null {
        try {
            return ThriftParser.parseWithCacheByVersion(
                document.uri.fsPath,
                document.getText(),
                document.version
            );
        } catch {
            return null;
        }
    }

    private async loadAst(uri: vscode.Uri): Promise<nodes.ThriftDocument | null> {
        try {
            const open = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
            const text = open ? open.getText() : await this.readFile(uri);
            if (text === null) {
                return null;
            }
            return new ThriftParser(text).parse();
        } catch {
            return null;
        }
    }

    private async readFile(uri: vscode.Uri): Promise<string | null> {
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            return this.decoder.decode(content);
        } catch {
            return null;
        }
    }

    private async getWorkspaceDocuments(): Promise<Array<{uri: vscode.Uri; ast: nodes.ThriftDocument}>> {
        const out: Array<{uri: vscode.Uri; ast: nodes.ThriftDocument}> = [];
        if (vscode.workspace === undefined) {
            return out;
        }
        const files = await vscode.workspace.findFiles(config.filePatterns.thrift);
        for (const file of files) {
            const ast = await this.loadAst(file);
            if (ast) {
                out.push({uri: file, ast});
            }
        }
        return out;
    }
}

interface ServiceEntry {
    serviceName: string;
    extendsName?: string;
    uri: vscode.Uri;
    serviceNode: nodes.Service | nodes.Interaction;
    methods: ServiceMethodLocation[];
}

export function buildServiceIndex(docs: Array<{uri: vscode.Uri; ast: nodes.ThriftDocument}>): Map<string, ServiceEntry> {
    const index = new Map<string, ServiceEntry>();
    for (const {uri, ast} of docs) {
        for (const node of ast.body) {
            if (node.type !== nodes.ThriftNodeType.Service && node.type !== nodes.ThriftNodeType.Interaction) {
                continue;
            }
            const serviceName = node.name ?? '';
            if (!serviceName) {
                continue;
            }
            const methods: ServiceMethodLocation[] = [];
            for (const func of node.functions) {
                methods.push({
                    serviceName,
                    methodName: func.name ?? '',
                    funcNode: func,
                    serviceNode: node,
                    uri
                });
            }
            index.set(serviceName, {
                serviceName,
                extendsName: node.type === nodes.ThriftNodeType.Service ? node.extends : undefined,
                uri,
                serviceNode: node,
                methods
            });
        }
    }
    return index;
}

interface TypeDef {
    name: string;
    node: nodes.ThriftNode;
    uri: vscode.Uri;
    kind: vscode.SymbolKind;
    detail: string;
}

export function buildTypeIndex(docs: Array<{uri: vscode.Uri; ast: nodes.ThriftDocument}>): Map<string, TypeDef> {
    const index = new Map<string, TypeDef>();
    for (const {uri, ast} of docs) {
        for (const node of ast.body) {
            const name = node.name;
            if (name === undefined || name === '') {
                continue;
            }
            switch (node.type) {
                case nodes.ThriftNodeType.Struct:
                    index.set(name, {name, node, uri, kind: vscode.SymbolKind.Struct, detail: `struct ${name}`});
                    break;
                case nodes.ThriftNodeType.Union:
                    index.set(name, {name, node, uri, kind: vscode.SymbolKind.Struct, detail: `union ${name}`});
                    break;
                case nodes.ThriftNodeType.Exception:
                    index.set(name, {name, node, uri, kind: vscode.SymbolKind.Class, detail: `exception ${name}`});
                    break;
                case nodes.ThriftNodeType.Enum:
                    index.set(name, {name, node, uri, kind: vscode.SymbolKind.Enum, detail: `enum ${name}`});
                    break;
                case nodes.ThriftNodeType.Typedef:
                    index.set(name, {name, node, uri, kind: vscode.SymbolKind.TypeParameter, detail: `typedef ${name}`});
                    break;
                default:
                    break;
            }
        }
    }
    return index;
}

export function collectTransitiveChildren(
    index: Map<string, ServiceEntry>,
    parentName: string
): ServiceEntry[] {
    const result: ServiceEntry[] = [];
    const queue = [parentName];
    const seen = new Set<string>([parentName]);
    while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined) {
            break;
        }
        for (const entry of index.values()) {
            if (entry.extendsName === current && !seen.has(entry.serviceName)) {
                seen.add(entry.serviceName);
                result.push(entry);
                queue.push(entry.serviceName);
            }
        }
    }
    return result;
}

function createMethodItem(
    func: nodes.ThriftFunction,
    service: nodes.Service | nodes.Interaction,
    uri: vscode.Uri
): vscode.CallHierarchyItem {
    const serviceLabel = service.type === nodes.ThriftNodeType.Service ? 'service' : 'interaction';
    const detail = `${serviceLabel} ${service.name ?? ''}`;
    return new vscode.CallHierarchyItem(
        vscode.SymbolKind.Method,
        func.name ?? '',
        detail,
        uri,
        toVscodeRange(func.range),
        toVscodeRange(func.nameRange ?? func.range)
    );
}

function createTypeItem(def: TypeDef): vscode.CallHierarchyItem {
    return new vscode.CallHierarchyItem(
        def.kind,
        def.name,
        def.detail,
        def.uri,
        toVscodeRange(def.node.range),
        toVscodeRange(def.node.nameRange ?? def.node.range)
    );
}

function parseServiceFromDetail(detail: string): string | null {
    if (!detail) {
        return null;
    }
    const m = detail.match(/^(?:service|interaction)\s+(\S+)$/);
    return m ? m[1] : null;
}

export function registerCallHierarchyProvider(
    context: vscode.ExtensionContext,
    deps?: Partial<CoreDependencies>
): ThriftCallHierarchyProvider {
    const provider = new ThriftCallHierarchyProvider(deps);
    context.subscriptions.push(
        vscode.languages.registerCallHierarchyProvider('thrift', provider)
    );
    return provider;
}
