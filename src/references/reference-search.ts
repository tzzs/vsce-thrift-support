import * as vscode from 'vscode';
import { ThriftParser } from '../ast/parser';
import * as nodes from '../ast/nodes.types';
import { ErrorHandler } from '../utils/error-handler';
import { traverseAst } from './ast-traversal';
import { createLocation } from '../utils/vscode-utils';

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
export async function findReferencesInDocument(
    uri: vscode.Uri,
    text: string,
    symbolName: string,
    includeDeclaration: boolean,
    deps: ReferenceSearchDeps,
    token?: vscode.CancellationToken
): Promise<vscode.Location[]> {
    if (token && token.isCancellationRequested) {
        return [];
    }

    const references: vscode.Location[] = [];
    let ast: nodes.ThriftDocument;

    try {
        const parser = new ThriftParser(text);
        ast = parser.parse();
    } catch (error) {
        deps.errorHandler.handleError(error, {
            component: 'ThriftReferencesProvider',
            operation: 'parseAst',
            filePath: uri.fsPath,
            additionalInfo: { symbolName }
        });
        return references;
    }

    let inFunctionArguments = false;
    let inFunctionThrows = false;
    let currentFunction: nodes.ThriftFunction | null = null;

    const contextCallback = (node: nodes.ThriftNode, entering: boolean) => {
        if (node.type === nodes.ThriftNodeType.Function) {
            if (entering) {
                currentFunction = node as nodes.ThriftFunction;
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
                const field = node as nodes.Field;
                if (currentFunction && currentFunction.arguments && currentFunction.arguments.includes(field)) {
                    inFunctionArguments = true;
                    inFunctionThrows = false;
                } else if (currentFunction && currentFunction.throws && currentFunction.throws.includes(field)) {
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
                nodes.ThriftNodeType.Typedef,
                nodes.ThriftNodeType.Const
            ];
            return definitionTypes.includes(n.type);
        };

        if (includeDeclaration && node.name === symbolName && isDefinitionNode(node)) {
            references.push(createLocation(uri, node.nameRange ?? node.range));
            return;
        }

        if (inFunctionThrows) {
            return;
        }

        if (node.type === nodes.ThriftNodeType.Function) {
            const func = node as nodes.ThriftFunction;
            if (func.returnType === symbolName) {
                references.push(createLocation(uri, func.returnTypeRange ?? func.range));
            }
            if (func.returnType.includes('.') && func.returnType.endsWith('.' + symbolName)) {
                references.push(createLocation(uri, func.returnTypeRange ?? func.range));
            }
            return;
        }

        if (node.type === nodes.ThriftNodeType.Field) {
            const field = node as nodes.Field;
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
