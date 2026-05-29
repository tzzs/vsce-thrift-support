import * as nodes from '../ast/nodes.types';

export interface AstIndex {
    structStarts: Map<number, nodes.Struct>;
    structFieldIndex: Map<number, nodes.Field>;
    /** start.line → end.line for multi-line struct fields (only when end > start) */
    structFieldEnds: Map<number, number>;
    enumStarts: Map<number, nodes.Enum>;
    enumMemberIndex: Map<number, nodes.EnumMember>;
    serviceStarts: Map<number, nodes.Service>;
    serviceFunctionIndex: Map<number, nodes.ThriftFunction>;
    interactionStarts: Map<number, nodes.Interaction>;
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
    const structFieldEnds = new Map<number, number>();
    const enumStarts = new Map<number, nodes.Enum>();
    const enumMemberIndex = new Map<number, nodes.EnumMember>();
    const serviceStarts = new Map<number, nodes.Service>();
    const serviceFunctionIndex = new Map<number, nodes.ThriftFunction>();
    const interactionStarts = new Map<number, nodes.Interaction>();
    const constStarts = new Map<number, nodes.Const>();
    const constEnds = new Map<number, number>();

    const visit = (node: nodes.ThriftNode) => {
        switch (node.type) {
            case nodes.ThriftNodeType.Struct:
            case nodes.ThriftNodeType.Union:
            case nodes.ThriftNodeType.Exception: {
                const structNode = node;
                structStarts.set(structNode.range.start.line, structNode);
                structNode.fields.forEach(field => {
                    const startLine = field.range.start.line;
                    const endLine = field.range.end.line;
                    structFieldIndex.set(startLine, field);
                    if (endLine > startLine) {
                        structFieldEnds.set(startLine, endLine);
                        // 为多行字段的所有中间行填充 structFieldIndex，
                        // 使 struct-content.ts 中的 fieldNode.range.start.line !== lineIndex
                        // 检查能将续行标记为已处理，避免将其当作独立字段解析。
                        for (let li = startLine + 1; li <= endLine; li++) {
                            if (!structFieldIndex.has(li)) {
                                structFieldIndex.set(li, field);
                            }
                        }
                    }
                });
                break;
            }
            case nodes.ThriftNodeType.Enum: {
                const enumNode = node;
                enumStarts.set(enumNode.range.start.line, enumNode);
                enumNode.members.forEach(member => {
                    enumMemberIndex.set(member.range.start.line, member);
                });
                break;
            }
            case nodes.ThriftNodeType.Service: {
                const serviceNode = node;
                serviceStarts.set(serviceNode.range.start.line, serviceNode);
                serviceNode.functions.forEach(fn => {
                    serviceFunctionIndex.set(fn.range.start.line, fn);
                });
                break;
            }
            case nodes.ThriftNodeType.Interaction: {
                const interactionNode = node;
                interactionStarts.set(interactionNode.range.start.line, interactionNode);
                break;
            }
            case nodes.ThriftNodeType.Const: {
                const constNode = node;
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
        structFieldEnds,
        enumStarts,
        enumMemberIndex,
        serviceStarts,
        serviceFunctionIndex,
        interactionStarts,
        constStarts,
        constEnds
    };
}
