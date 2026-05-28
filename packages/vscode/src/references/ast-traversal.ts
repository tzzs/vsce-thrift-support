import {nodes} from '@tanzz/thrift-core';

type TraversalCallback = (node: nodes.ThriftNode) => void;
type ContextCallback = (node: nodes.ThriftNode, entering: boolean) => void;

/**
 * Traverse AST nodes with optional context callbacks.
 * @param node - Node to traverse.
 * @param callback - Callback invoked for each node.
 * @param contextCallback - Callback invoked on enter/leave.
 */
export function traverseAst(
    node: nodes.ThriftNode,
    callback: TraversalCallback,
    contextCallback?: ContextCallback
): void {
    if (contextCallback) {
        contextCallback(node, true);
    }

    callback(node);

    if (node.type === nodes.ThriftNodeType.Document) {
        const doc = node;
        if (Array.isArray(doc.body)) {
            doc.body.forEach(child => traverseAst(child, callback, contextCallback));
        }
    } else if (node.type === nodes.ThriftNodeType.Struct ||
        node.type === nodes.ThriftNodeType.Union ||
        node.type === nodes.ThriftNodeType.Exception) {
        const struct = node;
        if (Array.isArray(struct.fields)) {
            struct.fields.forEach(field => traverseAst(field, callback, contextCallback));
        }
    } else if (node.type === nodes.ThriftNodeType.Enum) {
        const enumNode = node;
        if (Array.isArray(enumNode.members)) {
            enumNode.members.forEach(member => traverseAst(member, callback, contextCallback));
        }
    } else if (node.type === nodes.ThriftNodeType.Service) {
        const service = node;
        if (Array.isArray(service.functions)) {
            service.functions.forEach(func => traverseAst(func, callback, contextCallback));
        }
    } else if (node.type === nodes.ThriftNodeType.Interaction) {
        const interaction = node;
        if (Array.isArray(interaction.functions)) {
            interaction.functions.forEach(func => traverseAst(func, callback, contextCallback));
        }
    } else if (node.type === nodes.ThriftNodeType.Function) {
        const func = node;
        if (Array.isArray(func.arguments)) {
            func.arguments.forEach(arg => traverseAst(arg, callback, contextCallback));
        }
        if (Array.isArray(func.throws)) {
            func.throws.forEach(throwNode => traverseAst(throwNode, callback, contextCallback));
        }
    } else if (node.children && Array.isArray(node.children)) {
        node.children.forEach(child => traverseAst(child, callback, contextCallback));
    }

    if (contextCallback) {
        contextCallback(node, false);
    }
}
