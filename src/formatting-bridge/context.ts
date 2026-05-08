import * as vscode from 'vscode';
import {ThriftParser} from '../ast/parser';
import * as nodes from '../ast/nodes.types';

export interface FormattingContext {
    indentLevel: number;
    inStruct: boolean;
    inEnum: boolean;
    inService: boolean;
    inInteraction: boolean;
}

/**
 * Compute formatting context from the content before the selection start.
 * @param document - Source document.
 * @param start - Selection start position.
 * @param useCachedAst - Whether to use cached AST for full document.
 * @returns Formatting context for range formatting.
 */
export function computeInitialContext(
    document: vscode.TextDocument,
    start: vscode.Position,
    useCachedAst = false
): FormattingContext {
    try {
        let ast: nodes.ThriftDocument;
        let beforeLines: string[] | null = null;
        let boundaryLine = start.line;

        if (useCachedAst) {
            ast = ThriftParser.parseWithCache(document);
            if (start.character === 0) {
                boundaryLine = Math.max(start.line - 1, 0);
            }
        } else {
            const before = document.getText(new vscode.Range(new vscode.Position(0, 0), start));
            if (!before) {
                return {indentLevel: 0, inStruct: false, inEnum: false, inService: false, inInteraction: false};
            }
            const baseKey = document.uri && typeof document.uri.toString === 'function'
                ? document.uri.toString()
                : 'inmemory://range';
            ast = ThriftParser.parseContentWithCache(`${baseKey}#range`, before);
            beforeLines = before.split('\n');
            boundaryLine = Math.max(0, beforeLines.length - 1);
        }

        const hasValidRanges = ast.body.some((node) => {
            return node.range &&
                typeof node.range.start?.line === 'number' &&
                typeof node.range.end?.line === 'number';
        });

        if (!hasValidRanges) {
            if (!beforeLines) {
                const before = document.getText(new vscode.Range(new vscode.Position(0, 0), start));
                beforeLines = before.split('\n');
            }
            const stack: Array<'struct' | 'enum' | 'service' | 'interaction'> = [];
            for (const rawLine of beforeLines) {
                const line = rawLine.replace(/\/\/.*$/, '').replace(/#.*$/, '').trim();
                if (!line) {
                    continue;
                }
                const startMatch = line.match(/^(struct|union|exception|enum|senum|service|interaction)\b/);
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

        let inStruct = false;
        let inEnum = false;
        let inService = false;
        let inInteraction = false;
        const stack: Array<'struct' | 'enum' | 'service' | 'interaction'> = [];

        const traverse = (node: nodes.ThriftNode) => {
            if (node.range && node.range.start.line <= boundaryLine && node.range.end.line >= boundaryLine) {
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

            if ((node as nodes.ThriftDocument).body) {
                (node as nodes.ThriftDocument).body.forEach(traverse);
            } else if ((node as nodes.Struct).fields) {
                (node as nodes.Struct).fields.forEach(traverse);
            } else if ((node as nodes.Enum).members) {
                (node as nodes.Enum).members.forEach(traverse);
            } else if ((node as nodes.Service).functions) {
                (node as nodes.Service).functions.forEach(traverse);
            } else if ((node as nodes.Interaction).functions) {
                (node as nodes.Interaction).functions.forEach(traverse);
            }
        };

        ast.body.forEach(traverse);

        return {
            indentLevel: stack.length,
            inStruct,
            inEnum,
            inService,
            inInteraction
        };
    } catch {
        return {indentLevel: 0, inStruct: false, inEnum: false, inService: false, inInteraction: false};
    }
}
