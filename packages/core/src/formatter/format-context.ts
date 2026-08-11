import * as nodes from '../ast/nodes.types';
import {ThriftParser} from '../ast/parser';

/**
 * 格式化片段所需的起始上下文：缩进层级与所在块类型。
 * 由 range 之前的文本推导，使片段格式化与整文件格式化结果一致。
 */
export interface FormattingContext {
    indentLevel: number;
    inStruct: boolean;
    inEnum: boolean;
    inService: boolean;
    inInteraction: boolean;
}

export const DEFAULT_FORMATTING_CONTEXT: FormattingContext = {
    indentLevel: 0,
    inStruct: false,
    inEnum: false,
    inService: false,
    inInteraction: false
};

type BlockKind = 'struct' | 'enum' | 'service' | 'interaction';

const BLOCK_START_RE = /^(struct|union|exception|enum|senum|service|interaction)\b/;

/**
 * 计算格式化上下文的纯文本入口（无 VS Code 依赖）。
 *
 * @param parseContent - 用于推导上下文的文本：通常是 range 起始行之前的完整内容，
 *                       或整份文档内容。AST 无效时会退化为逐行扫描（仅扫到 boundaryLine）。
 * @param boundaryLine - 边界行号（基于 parseContent 的 0-based 行号）。
 *                       包含该行的块节点会计入上下文。
 * @param uri - 可选缓存键（默认使用内存 key）。
 */
export function computeFormattingContext(
    parseContent: string,
    boundaryLine: number,
    uri = 'inmemory://format-context'
): FormattingContext {
    try {
        if (!parseContent) {
            return {...DEFAULT_FORMATTING_CONTEXT};
        }

        const ast = ThriftParser.parseContentWithCache(uri, parseContent);

        const hasValidRanges = ast.body.some((node) => {
            return node.range !== null && node.range !== undefined &&
                typeof node.range.start?.line === 'number' &&
                typeof node.range.end?.line === 'number';
        });

        if (!hasValidRanges) {
            return computeContextByLineScan(parseContent.split('\n'), boundaryLine);
        }

        return computeContextByAst(ast, boundaryLine);
    } catch {
        return {...DEFAULT_FORMATTING_CONTEXT};
    }
}

function computeContextByAst(ast: nodes.ThriftDocument, boundaryLine: number): FormattingContext {
    let inStruct = false;
    let inEnum = false;
    let inService = false;
    let inInteraction = false;
    const stack: BlockKind[] = [];

    const traverse = (node: nodes.ThriftNode) => {
        if (node.range !== undefined && node.range !== null &&
            node.range.start.line <= boundaryLine && node.range.end.line >= boundaryLine) {
            if (node.type === nodes.ThriftNodeType.Struct ||
                node.type === nodes.ThriftNodeType.Union ||
                node.type === nodes.ThriftNodeType.Exception) {
                stack.push('struct');
                inStruct = true;
            } else if (node.type === nodes.ThriftNodeType.Enum) {
                stack.push('enum');
                inEnum = true;
            } else if (node.type === nodes.ThriftNodeType.Service) {
                stack.push('service');
                inService = true;
            } else if (node.type === nodes.ThriftNodeType.Interaction) {
                stack.push('interaction');
                inInteraction = true;
            }
        }

        if ((node as nodes.ThriftDocument).body !== undefined) {
            (node as nodes.ThriftDocument).body.forEach(traverse);
        } else if ((node as nodes.Struct).fields !== undefined) {
            (node as nodes.Struct).fields.forEach(traverse);
        } else if ((node as nodes.Enum).members !== undefined) {
            (node as nodes.Enum).members.forEach(traverse);
        } else if ((node as nodes.Service).functions !== undefined) {
            (node as nodes.Service).functions.forEach(traverse);
        } else if ((node as nodes.Interaction).functions !== undefined) {
            (node as nodes.Interaction).functions.forEach(traverse);
        }
    };

    ast.body.forEach(traverse);

    return {indentLevel: stack.length, inStruct, inEnum, inService, inInteraction};
}

function computeContextByLineScan(lines: string[], boundaryLine: number): FormattingContext {
    const stack: BlockKind[] = [];
    // 只扫描到边界行：boundary 之后的块（含其后闭合的块）不应影响边界处的上下文
    const scanLimit = Math.min(Math.max(boundaryLine, 0), lines.length - 1);
    for (let i = 0; i <= scanLimit; i++) {
        const rawLine = lines[i];
        const slashComment = rawLine.indexOf('//');
        const hashComment = rawLine.indexOf('#');
        let commentStart = rawLine.length;
        if (slashComment >= 0) {
            commentStart = slashComment;
        }
        if (hashComment >= 0) {
            commentStart = Math.min(commentStart, hashComment);
        }
        const line = rawLine.slice(0, commentStart).trim();
        if (!line) {
            continue;
        }
        const startMatch = line.match(BLOCK_START_RE);
        if (startMatch && line.includes('{')) {
            const type = startMatch[1];
            if (type === 'enum' || type === 'senum') {
                stack.push('enum');
            } else if (type === 'service') {
                stack.push('service');
            } else if (type === 'interaction') {
                stack.push('interaction');
            } else {
                stack.push('struct');
            }
        }
        if (line.includes('}')) {
            stack.pop();
        }
    }
    return {
        indentLevel: stack.length,
        inStruct: stack.includes('struct'),
        inEnum: stack.includes('enum'),
        inService: stack.includes('service'),
        inInteraction: stack.includes('interaction')
    };
}
