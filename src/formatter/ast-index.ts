import * as nodes from '../ast/nodes.types';

export interface AstIndex {
    structStarts: Map<number, nodes.Struct>;
    structFieldIndex: Map<number, nodes.Field>;
    enumStarts: Map<number, nodes.Enum>;
    enumMemberIndex: Map<number, nodes.EnumMember>;
    serviceStarts: Map<number, nodes.Service>;
    serviceFunctionIndex: Map<number, nodes.ThriftFunction>;
    constStarts: Map<number, nodes.Const>;
    constEnds: Map<number, number>;
}

/**
 * 构建 AST 索引，便于按行定位结构体/枚举/服务/常量节点。
 * @param ast Thrift 文档 AST
 * @returns AST 索引
 */
export function buildAstIndex(ast: nodes.ThriftDocument): AstIndex {
    const structStarts = new Map<number, nodes.Struct>();
    const structFieldIndex = new Map<number, nodes.Field>();
    const enumStarts = new Map<number, nodes.Enum>();
    const enumMemberIndex = new Map<number, nodes.EnumMember>();
    const serviceStarts = new Map<number, nodes.Service>();
    const serviceFunctionIndex = new Map<number, nodes.ThriftFunction>();
    const constStarts = new Map<number, nodes.Const>();
    const constEnds = new Map<number, number>();

    const visit = (node: nodes.ThriftNode) => {
        switch (node.type) {
            case nodes.ThriftNodeType.Struct:
            case nodes.ThriftNodeType.Union:
            case nodes.ThriftNodeType.Exception: {
                const structNode = node as nodes.Struct;
                structStarts.set(structNode.range.start.line, structNode);
                structNode.fields.forEach(field => {
                    structFieldIndex.set(field.range.start.line, field);
                });
                break;
            }
            case nodes.ThriftNodeType.Enum: {
                const enumNode = node as nodes.Enum;
                enumStarts.set(enumNode.range.start.line, enumNode);
                enumNode.members.forEach(member => {
                    enumMemberIndex.set(member.range.start.line, member);
                });
                break;
            }
            case nodes.ThriftNodeType.Service: {
                const serviceNode = node as nodes.Service;
                serviceStarts.set(serviceNode.range.start.line, serviceNode);
                serviceNode.functions.forEach(fn => {
                    serviceFunctionIndex.set(fn.range.start.line, fn);
                });
                break;
            }
            case nodes.ThriftNodeType.Const: {
                const constNode = node as nodes.Const;
                constStarts.set(constNode.range.start.line, constNode);
                constEnds.set(constNode.range.start.line, constNode.range.end.line);
                break;
            }
            default:
                break;
        }
    };

    ast.body.forEach(visit);

    return {
        structStarts,
        structFieldIndex,
        enumStarts,
        enumMemberIndex,
        serviceStarts,
        serviceFunctionIndex,
        constStarts,
        constEnds
    };
}
