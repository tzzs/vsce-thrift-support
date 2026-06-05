import * as vscode from 'vscode';
import {ThriftParser} from '@tanzz/thrift-core';
import {nodes} from '@tanzz/thrift-core';
import {ErrorHandler} from '@tanzz/thrift-core';
import {traverseAst} from './ast-traversal';
import {createLocation} from '../utils/vscode-utils';

interface ReferenceSearchDeps {
    errorHandler: ErrorHandler;
}

/**
 * Find all references of a symbol in a given document text.
 * @param uri - Document URI.
 * @param text - Raw document text.
 * @param symbolName - Symbol to search.
 * @param includeDeclaration - Whether to include definitions.
 * @param deps - Dependency providers.
 * @param token - Optional cancellation token.
 * @returns Reference locations.
 */
export function findReferencesInDocument(
    uri: vscode.Uri,
    text: string,
    symbolName: string,
    symbolType: string,
    includeDeclaration: boolean,
    deps: ReferenceSearchDeps,
    token?: vscode.CancellationToken
): vscode.Location[] {
    if (token && token.isCancellationRequested) {
        return [];
    }

    const references: vscode.Location[] = [];
    const ast = deps.errorHandler.wrapSync(() => {
        const parser = new ThriftParser(text);
        return parser.parse();
    }, {
        component: 'ThriftReferencesProvider',
        operation: 'parseAst',
        filePath: uri.fsPath,
        additionalInfo: {symbolName}
    }, null);
    if (!ast) {
        return references;
    }

    let inFunctionArguments = false;
    let inFunctionThrows = false;
    let currentFunction: nodes.ThriftFunction | null = null;

    const contextCallback = (node: nodes.ThriftNode, entering: boolean) => {
        if (node.type === nodes.ThriftNodeType.Function) {
            if (entering) {
                currentFunction = node;
                inFunctionArguments = false;
                inFunctionThrows = false;
            } else {
                currentFunction = null;
                inFunctionArguments = false;
                inFunctionThrows = false;
            }
        }

        if (node.type === nodes.ThriftNodeType.Field) {
            if (entering) {
                const field = node;
                if (currentFunction !== null && currentFunction.arguments.includes(field)) {
                    inFunctionArguments = true;
                    inFunctionThrows = false;
                } else if (currentFunction !== null && currentFunction.throws.includes(field)) {
                    inFunctionArguments = false;
                    inFunctionThrows = true;
                } else {
                    inFunctionArguments = false;
                    inFunctionThrows = false;
                }
            } else {
                inFunctionArguments = false;
                inFunctionThrows = false;
            }
        }

        if (node.type === nodes.ThriftNodeType.Function && !entering) {
            inFunctionThrows = false;
        }
    };

    traverseAst(ast, (node) => {
        const isDefinitionNode = (n: nodes.ThriftNode) => {
            const definitionTypes = [
                nodes.ThriftNodeType.Struct,
                nodes.ThriftNodeType.Union,
                nodes.ThriftNodeType.Exception,
                nodes.ThriftNodeType.Enum,
                nodes.ThriftNodeType.Service,
                nodes.ThriftNodeType.Interaction,
                nodes.ThriftNodeType.Typedef,
                nodes.ThriftNodeType.Const
            ];
            return definitionTypes.includes(n.type);
        };

        if (!isTypeSymbol(symbolType)) {
            if (includeDeclaration && node.name === symbolName && isSymbolTypeDeclaration(node, symbolType)) {
                references.push(createLocation(uri, node.nameRange ?? node.range));
            }
            return;
        }

        if (includeDeclaration && node.name === symbolName && isDefinitionNode(node)) {
            references.push(createLocation(uri, node.nameRange ?? node.range));
            return;
        }

        if (inFunctionThrows) {
            return;
        }

        if (node.type === nodes.ThriftNodeType.Function) {
            const func = node;
            if (func.returnType === symbolName) {
                references.push(createLocation(uri, func.returnTypeRange ?? func.range));
            }
            if (func.returnType.includes('.') && func.returnType.endsWith('.' + symbolName)) {
                references.push(createLocation(uri, func.returnTypeRange ?? func.range));
            }
            return;
        }

        if (node.type === nodes.ThriftNodeType.Field) {
            const field = node;
            if (!inFunctionArguments) {
                if (field.fieldType === symbolName) {
                    references.push(createLocation(uri, field.typeRange ?? field.range));
                }
                if (field.fieldType.includes('.')) {
                    const parts = field.fieldType.split('.');
                    if (parts.length === 2) {
                        const namespace = parts[0];
                        const typeName = parts[1];
                        if (namespace === symbolName) {
                            references.push(createLocation(uri, field.range));
                        } else if (typeName === symbolName) {
                            references.push(createLocation(uri, field.range));
                        }
                    }
                }
            }
            return;
        }
    }, contextCallback);

    return references;
}

function isTypeSymbol(symbolType: string): boolean {
    return symbolType === 'type' ||
        symbolType === 'struct' ||
        symbolType === 'union' ||
        symbolType === 'exception' ||
        symbolType === 'enum' ||
        symbolType === 'service' ||
        symbolType === 'interaction' ||
        symbolType === 'typedef' ||
        symbolType === 'namespace';
}

function isSymbolTypeDeclaration(node: nodes.ThriftNode, symbolType: string): boolean {
    switch (symbolType) {
        case 'field':
            return node.type === nodes.ThriftNodeType.Field;
        case 'method':
            return node.type === nodes.ThriftNodeType.Function;
        case 'enumValue':
            return node.type === nodes.ThriftNodeType.EnumMember;
        default:
            return false;
    }
}
