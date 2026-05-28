import * as vscode from 'vscode';
import {nodes} from '@tanzz/thrift-core';

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
        range: {start: {line: number; character: number}; end: {line: number; character: number}} | undefined,
        pos: {line: number; character: number}
    ): boolean => {
        if (!range) {
            return false;
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
                    const docNode = node;
                    if (docNode.body.length > 0) {
                        const childResult = findDeepestNode(docNode.body);
                        if (childResult) {
                            return childResult;
                        }
                    }
                } else if (node.type === nodes.ThriftNodeType.Struct ||
                    node.type === nodes.ThriftNodeType.Union ||
                    node.type === nodes.ThriftNodeType.Exception) {
                    const structNode = node;
                    if (structNode.fields.length > 0) {
                        const childResult = findDeepestNode(structNode.fields);
                        if (childResult) {
                            return childResult;
                        }
                    }
                } else if (node.type === nodes.ThriftNodeType.Enum) {
                    const enumNode = node;
                    if (enumNode.members.length > 0) {
                        const childResult = findDeepestNode(enumNode.members);
                        if (childResult) {
                            return childResult;
                        }
                    }
                } else if (node.type === nodes.ThriftNodeType.Service) {
                    const serviceNode = node;
                    if (serviceNode.functions.length > 0) {
                        const childResult = findDeepestNode(serviceNode.functions);
                        if (childResult) {
                            return childResult;
                        }
                    }
                } else if (node.type === nodes.ThriftNodeType.Interaction) {
                    const interactionNode = node;
                    if (interactionNode.functions.length > 0) {
                        const childResult = findDeepestNode(interactionNode.functions);
                        if (childResult) {
                            return childResult;
                        }
                    }
                } else if (node.type === nodes.ThriftNodeType.Function) {
                    const funcNode = node;
                    if (funcNode.arguments.length > 0) {
                        const childResult = findDeepestNode(funcNode.arguments);
                        if (childResult) {
                            return childResult;
                        }
                    }
                    if (funcNode.throws.length > 0) {
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
