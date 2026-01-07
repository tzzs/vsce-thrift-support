import * as vscode from 'vscode';
import * as nodes from '../ast/nodes.types';

export function findBlockNode(doc: nodes.ThriftDocument, line: number): nodes.ThriftNode | undefined {
    // Find the deepest node that covers the line
    for (const node of doc.body) {
        if (node.range.contains(new vscode.Position(line, 0))) {
            return node;
        }
    }
    return undefined;
}

export function collectTypesAndValues(doc: nodes.ThriftDocument) {
    const types: string[] = [];
    const values: string[] = [];

    for (const node of doc.body) {
        if (node.name) {
            if (
                nodes.isStructNode(node) ||
                nodes.isEnumNode(node) ||
                node.type === nodes.ThriftNodeType.Typedef
            ) {
                types.push(node.name);
            }
            if (
                node.type === nodes.ThriftNodeType.Const ||
                node.type === nodes.ThriftNodeType.EnumMember
            ) {
                values.push(node.name);
            }
        }
        // For enums, members are children
        if (nodes.isEnumNode(node)) {
            node.members.forEach((m) => {
                if (m.name) {
                    values.push(m.name);
                }
            });
        }
    }
    return { types, values };
}

export function looksLikeTypeContext(line: string, char: number): boolean {
    const before = line.substring(0, char);
    // After "1: " or "1: required "
    if (/(?:^|\s)\d+:\s*(?:(required|optional)\s+)?$/.test(before)) {
        return true;
    }
    // Function args: (type name
    if (/\(\s*$/.test(before) || /,\s*$/.test(before)) {
        return true; // loose heuristic
    }
    return false;
}

export function isInMethodContext(line: string, character: number): boolean {
    const beforeCursor = line.substring(0, character);
    if (/^\s*\w+\s+\w*$/.test(beforeCursor) || /^\s*\w*$/.test(beforeCursor)) {
        return true;
    }
    return false;
}

export function isInEnumAssignmentContext(
    line: string,
    character: number,
    doc: nodes.ThriftDocument
): boolean {
    const beforeCursor = line.substring(0, character);

    // Check if we're in a pattern like "Type fieldName = " or "1: required Type fieldName = "
    // Match patterns like:
    // "Status status = "
    // "1: required Status status = "
    // "1: optional Status status = "
    const assignmentMatch = beforeCursor.match(
        /^\s*(?:\d+\s*:\s*(?:required|optional)\s+)?(\w+)\s+(\w+)\s*=\s*$/
    );
    if (!assignmentMatch) {
        return false;
    }

    const [, typeName] = assignmentMatch;

    // Check if the type is an enum in the document
    for (const node of doc.body) {
        if (nodes.isEnumNode(node) && node.name === typeName) {
            return true;
        }
    }

    return false;
}
