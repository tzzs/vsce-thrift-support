import * as vscode from 'vscode';
import * as nodes from '../ast/nodes.types';
import {findNodeAtPosition} from './node-locator';

interface SymbolTypeDeps {
    getCachedAst: (document: vscode.TextDocument) => nodes.ThriftDocument;
}

/**
 * Resolve the symbol type for reference searching.
 * @param document - Current document.
 * @param position - Position of the symbol.
 * @param symbolName - Name of the symbol.
 * @param deps - Dependency providers.
 * @returns Symbol type string or null.
 */
export async function getSymbolType(
    document: vscode.TextDocument,
    position: vscode.Position,
    symbolName: string,
    deps: SymbolTypeDeps
): Promise<string | null> {
    if (symbolName.includes('.')) {
        return 'type';
    }

    const wordRange = document.getWordRangeAtPosition(position, /\b([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (wordRange) {
        const lineText = document.lineAt(position.line).text;
        const wordStart = wordRange.start.character;
        const wordEnd = wordRange.end.character;

        const afterWord = lineText.substring(wordEnd);
        const namespacedPattern = /^\s*\.\s*[A-Za-z_][A-Za-z0-9_]*/;
        if (namespacedPattern.test(afterWord)) {
            return 'namespace';
        }

        const beforeWord = lineText.substring(0, wordStart);
        const reverseBefore = beforeWord.split('').reverse().join('');
        const reversedNamespacePattern = /^[A-Za-z_][A-Za-z0-9_]*\s*\.\s*$/;
        if (reversedNamespacePattern.test(reverseBefore)) {
            return 'namespace';
        }
    }

    const ast = deps.getCachedAst(document);
    const node = findNodeAtPosition(ast, position);

    if (!node) {
        return null;
    }

    if (node.name === symbolName) {
        switch (node.type) {
            case nodes.ThriftNodeType.Struct:
                return 'struct';
            case nodes.ThriftNodeType.Union:
                return 'union';
            case nodes.ThriftNodeType.Exception:
                return 'exception';
            case nodes.ThriftNodeType.Enum:
                return 'enum';
            case nodes.ThriftNodeType.Service:
                return 'service';
            case nodes.ThriftNodeType.Typedef:
                return 'typedef';
            case nodes.ThriftNodeType.Const:
                return 'type';
            case nodes.ThriftNodeType.Field:
                return 'field';
            case nodes.ThriftNodeType.Function:
                return 'method';
            case nodes.ThriftNodeType.EnumMember:
                return 'enumValue';
            default:
                return null;
        }
    } else {
        switch (node.type) {
            case nodes.ThriftNodeType.Struct:
            case nodes.ThriftNodeType.Union:
            case nodes.ThriftNodeType.Exception: {
                const structNode = node ;
                if (structNode.fields) {
                    for (const field of structNode.fields) {
                        if (field.name === symbolName) {
                            return 'field';
                        }
                        if (field.fieldType === symbolName) {
                            return 'type';
                        }
                        if (field.fieldType.includes('.') && field.fieldType.endsWith('.' + symbolName)) {
                            return 'type';
                        }
                    }
                }
                break;
            }
            case nodes.ThriftNodeType.Field: {
                const fieldNode = node ;
                if (fieldNode.fieldType === symbolName) {
                    return 'type';
                }
                if (fieldNode.fieldType.includes('.') && fieldNode.fieldType.endsWith('.' + symbolName)) {
                    return 'type';
                }
                if (fieldNode.fieldType.includes('.')) {
                    const parts = fieldNode.fieldType.split('.');
                    if (parts.length === 2 && parts[1] === symbolName) {
                        return 'type';
                    }
                }
                break;
            }
            case nodes.ThriftNodeType.Enum: {
                const enumNode = node ;
                if (enumNode.members) {
                    for (const member of enumNode.members) {
                        if (member.name === symbolName) {
                            return 'enumValue';
                        }
                    }
                }
                break;
            }
            case nodes.ThriftNodeType.Service: {
                const serviceNode = node ;
                if (serviceNode.functions) {
                    for (const func of serviceNode.functions) {
                        if (func.name === symbolName) {
                            return 'method';
                        }
                        if (func.returnType === symbolName) {
                            return 'type';
                        }
                        if (func.returnType.includes('.') && func.returnType.endsWith('.' + symbolName)) {
                            return 'type';
                        }
                    }
                }
                break;
            }
            case nodes.ThriftNodeType.Function: {
                const funcNode = node ;
                if (funcNode.returnType === symbolName) {
                    return 'type';
                }
                if (funcNode.returnType.includes('.') && funcNode.returnType.endsWith('.' + symbolName)) {
                    return 'type';
                }
                break;
            }
            default:
                break;
        }
    }

    return null;
}
