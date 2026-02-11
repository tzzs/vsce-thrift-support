import * as vscode from 'vscode';
import * as nodes from '../ast/nodes.types';

/**
 * Find the deepest node that contains the given position.
 * @param doc - Parsed Thrift document.
 * @param position - Cursor position.
 * @returns Deepest AST node containing the position.
 */
export function findNodeAtPosition(
    doc: nodes.ThriftDocument,
    position: vscode.Position
): nodes.ThriftNode | undefined {
    const rangeContains = (
        range: vscode.Range | {start: vscode.Position; end: vscode.Position} | undefined,
        pos: vscode.Position
    ): boolean => {
        if (!range) {
            return false;
        }
        if (typeof (range as vscode.Range).contains === 'function') {
            return (range as vscode.Range).contains(pos);
        }
        const start = range.start;
        const end = range.end;
        return pos.line >= start.line &&
            pos.line <= end.line &&
            (pos.line !== start.line || pos.character >= start.character) &&
            (pos.line !== end.line || pos.character <= end.character);
    };

    function findDeepestNode(nodesArray: nodes.ThriftNode[]): nodes.ThriftNode | undefined {
        for (const node of nodesArray) {
            if (rangeContains(node.range , position)) {
                if (node.children) {
                    const childResult = findDeepestNode(node.children);
                    if (childResult) {
                        return childResult;
                    }
                }

                if (node.type === nodes.ThriftNodeType.Document) {
                    const docNode = node ;
                    if (docNode.body) {
                        const childResult = findDeepestNode(docNode.body);
                        if (childResult) {
                            return childResult;
                        }
                    }
                } else if (node.type === nodes.ThriftNodeType.Struct ||
                    node.type === nodes.ThriftNodeType.Union ||
                    node.type === nodes.ThriftNodeType.Exception) {
                    const structNode = node ;
                    if (structNode.fields) {
                        const childResult = findDeepestNode(structNode.fields);
                        if (childResult) {
                            return childResult;
                        }
                    }
                } else if (node.type === nodes.ThriftNodeType.Enum) {
                    const enumNode = node ;
                    if (enumNode.members) {
                        const childResult = findDeepestNode(enumNode.members);
                        if (childResult) {
                            return childResult;
                        }
                    }
                } else if (node.type === nodes.ThriftNodeType.Service) {
                    const serviceNode = node ;
                    if (serviceNode.functions) {
                        const childResult = findDeepestNode(serviceNode.functions);
                        if (childResult) {
                            return childResult;
                        }
                    }
                } else if (node.type === nodes.ThriftNodeType.Function) {
                    const funcNode = node ;
                    if (funcNode.arguments) {
                        const childResult = findDeepestNode(funcNode.arguments);
                        if (childResult) {
                            return childResult;
                        }
                    }
                    if (funcNode.throws) {
                        const childResult = findDeepestNode(funcNode.throws);
                        if (childResult) {
                            return childResult;
                        }
                    }
                }

                return node;
            }
        }
        return undefined;
    }

    return findDeepestNode(doc.body);
}
