import * as nodes from '../ast/nodes.types';

/**
 * 收集 AST 内定义的类型与类型类别。
 * @param ast Thrift AST 根节点
 * @returns 类型名称到类型类别的映射 (e.g. "User" -> "struct")
 */
export function collectTypesFromAst(ast: nodes.ThriftDocument): Map<string, string> {
    const typeKind = new Map<string, string>();
    for (const node of ast.body) {
        switch (node.type) {
            case nodes.ThriftNodeType.Typedef:
                if (typeof node.name === 'string' && node.name.length > 0) {
                    typeKind.set(node.name, 'typedef');
                }
                break;
            case nodes.ThriftNodeType.Enum:
                if (typeof node.name === 'string' && node.name.length > 0) {
                    typeKind.set(node.name, (node).isSenum === true ? 'senum' : 'enum');
                }
                break;
            case nodes.ThriftNodeType.Struct:
                if (typeof node.name === 'string' && node.name.length > 0) {
                    typeKind.set(node.name, 'struct');
                }
                break;
            case nodes.ThriftNodeType.Union:
                if (typeof node.name === 'string' && node.name.length > 0) {
                    typeKind.set(node.name, 'union');
                }
                break;
            case nodes.ThriftNodeType.Exception:
                if (typeof node.name === 'string' && node.name.length > 0) {
                    typeKind.set(node.name, 'exception');
                }
                break;
            case nodes.ThriftNodeType.Service:
                if (typeof node.name === 'string' && node.name.length > 0) {
                    typeKind.set(node.name, 'service');
                }
                break;
            case nodes.ThriftNodeType.Interaction:
                if (typeof node.name === 'string' && node.name.length > 0) {
                    typeKind.set(node.name, 'interaction');
                }
                break;
            default:
                break;
        }
    }
    return typeKind;
}
