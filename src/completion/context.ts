import * as vscode from 'vscode';
import * as nodes from '../ast/nodes.types';

/**
 * 查找指定行所在的区块节点。
 * @param doc Thrift AST 文档
 * @param line 行号
 * @returns 覆盖该行的节点，未找到返回 undefined
 */
export function findBlockNode(doc: nodes.ThriftDocument, line: number): nodes.ThriftNode | undefined {
    // Find the deepest node that covers the line
    for (const node of doc.body) {
        if (node.range.contains(new vscode.Position(line, 0))) {
            return node;
        }
    }
    return undefined;
}

/**
 * 收集文档中的类型定义与常量/枚举成员值。
 * @param doc Thrift AST 文档
 * @returns {types: string[], values: string[]} 类型列表与值列表
 */
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

/**
 * 判断是否处于期望输入类型的上下文中。
 * @param line 当前行文本
 * @param char 光标字符位置
 * @returns 是否像是类型上下文
 */
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

/**
 * 判断是否处于各类方法上下文中（如 service 内部）。
 * @param line 当前行文本
 * @param character 光标字符位置
 * @returns 是否处于方法上下文
 */
export function isInMethodContext(line: string, character: number): boolean {
    const beforeCursor = line.substring(0, character);
    if (/^\s*\w+\s+\w*$/.test(beforeCursor) || /^\s*\w*$/.test(beforeCursor)) {
        return true;
    }
    return false;
}

/**
 * 判断是否处于枚举值赋值上下文（如 "Status s = "）。
 * @param line 当前行文本
 * @param character 光标字符位置
 * @param doc AST 文档（用于查找枚举类型定义）
 * @returns 是否处于赋值上下文
 */
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
