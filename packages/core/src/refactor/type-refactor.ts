import {ThriftParser} from '../ast/parser';
import {sliceTextByRange} from '../ast/text-utils';
import {collectTopLevelTypes, positionInRange, walkNodes} from '../ast/utils';
import {Position, Range, TextEdit} from '../types';
import * as nodes from '../ast/nodes.types';

export interface PositionLike {
    line: number;
    character: number;
}

export interface RangeLike {
    start: PositionLike;
    end: PositionLike;
}

export interface ExtractTypeTarget {
    typeText: string;
    typeRange: RangeLike;
    insertPosition: PositionLike;
}

export interface ExtractTypeEdits {
    insertPosition: PositionLike;
    insertText: string;
    replaceRange: RangeLike;
    replaceText: string;
    textEdits: TextEdit[];
}

export interface MoveTypeTarget {
    typeName: string;
    typeKind: string;
    typeText: string;
    range: RangeLike;
}

const PRIMITIVE_TYPES = new Set([
    'bool',
    'byte',
    'i8',
    'i16',
    'i32',
    'i64',
    'double',
    'string',
    'binary',
    'uuid',
    'void'
]);

export function inferExtractTypeTarget(
    text: string,
    position: PositionLike,
    selectionRange?: RangeLike
): ExtractTypeTarget | undefined {
    const selectedType = inferSelectedType(text, selectionRange);
    if (selectedType !== undefined) {
        return {
            typeText: selectedType.typeText,
            typeRange: cloneRange(selectedType.range),
            insertPosition: inferTypedefInsertPosition(parseDocument(text))
        };
    }

    const ast = parseDocument(text);
    const hitPosition = toPosition(position);
    let bestField: nodes.Field | undefined;

    walkNodes(ast, node => {
        if (node.type !== nodes.ThriftNodeType.Field || node.typeRange === undefined) {
            return;
        }
        if (!positionInRange(node.typeRange, hitPosition)) {
            return;
        }
        if (bestField === undefined || rangeSize(node.typeRange) < rangeSize(bestField.typeRange!)) {
            bestField = node;
        }
    });

    if (bestField === undefined || bestField.typeRange === undefined) {
        return undefined;
    }

    const trimmedType = trimRangeText(text, bestField.typeRange);
    if (!isExtractableType(trimmedType.text)) {
        return undefined;
    }

    return {
        typeText: trimmedType.text,
        typeRange: cloneRange(trimmedType.range),
        insertPosition: inferTypedefInsertPosition(ast)
    };
}

export function buildExtractTypeEdits(target: ExtractTypeTarget, newTypeName: string): ExtractTypeEdits {
    const typedefText = `typedef ${target.typeText} ${newTypeName}\n\n`;
    const replaceRange = cloneRange(target.typeRange);
    const insertPosition = clonePosition(target.insertPosition);

    return {
        insertPosition,
        insertText: typedefText,
        replaceRange,
        replaceText: newTypeName,
        textEdits: [
            new TextEdit(toRange(insertPosition, insertPosition), typedefText),
            new TextEdit(toRange(replaceRange.start, replaceRange.end), newTypeName)
        ]
    };
}

export function inferMoveTypeTarget(text: string, position: PositionLike): MoveTypeTarget | undefined {
    const ast = parseDocument(text);
    const hitPosition = toPosition(position);

    for (const node of collectTopLevelTypes(ast)) {
        if (!isMovableTypeNode(node) || !positionInRange(node.range, hitPosition)) {
            continue;
        }
        if (node.name === undefined) {
            continue;
        }
        const declaration = trimTrailingRangeText(text, node.range);
        return {
            typeName: node.name,
            typeKind: node.type,
            typeText: declaration.text,
            range: cloneRange(declaration.range)
        };
    }

    return undefined;
}

function trimRangeText(text: string, range: RangeLike): {text: string; range: RangeLike} {
    const lineStarts = getLineStarts(text);
    let startOffset = offsetAt(lineStarts, range.start);
    let endOffset = offsetAt(lineStarts, range.end);

    while (startOffset < endOffset && /\s/.test(text[startOffset] ?? '')) {
        startOffset++;
    }
    while (endOffset > startOffset && /\s/.test(text[endOffset - 1] ?? '')) {
        endOffset--;
    }

    return {
        text: text.slice(startOffset, endOffset),
        range: {
            start: positionAt(lineStarts, startOffset),
            end: positionAt(lineStarts, endOffset)
        }
    };
}

function trimTrailingRangeText(text: string, range: RangeLike): {text: string; range: RangeLike} {
    const lineStarts = getLineStarts(text);
    const startOffset = offsetAt(lineStarts, range.start);
    let endOffset = offsetAt(lineStarts, range.end);

    while (endOffset > startOffset && /\s/.test(text[endOffset - 1] ?? '')) {
        endOffset--;
    }

    return {
        text: text.slice(startOffset, endOffset),
        range: {
            start: clonePosition(range.start),
            end: positionAt(lineStarts, endOffset)
        }
    };
}

function getLineStarts(text: string): number[] {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n') {
            starts.push(i + 1);
        }
    }
    return starts;
}

function offsetAt(lineStarts: number[], position: PositionLike): number {
    const lineStart = lineStarts[position.line] ?? lineStarts[lineStarts.length - 1];
    return lineStart + position.character;
}

function positionAt(lineStarts: number[], offset: number): PositionLike {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (lineStarts[mid] <= offset) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    const line = Math.max(0, low - 1);
    return {
        line,
        character: offset - lineStarts[line]
    };
}

function parseDocument(text: string): nodes.ThriftDocument {
    return new ThriftParser(text).parse();
}

function inferTypedefInsertPosition(ast: nodes.ThriftDocument): PositionLike {
    let insertLine = 0;
    for (const node of ast.body) {
        if (node.type === nodes.ThriftNodeType.Include || node.type === nodes.ThriftNodeType.Namespace) {
            insertLine = Math.max(insertLine, node.range.end.line + 1);
        }
    }
    return {line: insertLine, character: 0};
}

function inferSelectedType(
    text: string,
    selectionRange: RangeLike | undefined
): {typeText: string; range: RangeLike} | undefined {
    if (selectionRange === undefined || rangesEqual(selectionRange.start, selectionRange.end)) {
        return undefined;
    }
    const typeText = sliceTextByRange(splitLines(text), toRange(selectionRange.start, selectionRange.end)).trim();
    if (!isExtractableType(typeText)) {
        return undefined;
    }
    return {
        typeText,
        range: selectionRange
    };
}

function isExtractableType(typeText: string): boolean {
    const normalized = typeText.trim();
    if (normalized.length === 0) {
        return false;
    }
    if (PRIMITIVE_TYPES.has(normalized)) {
        return false;
    }
    return /^[A-Za-z_][A-Za-z0-9_.]*(?:\s*<[\s\S]+>)?$/.test(normalized);
}

function isMovableTypeNode(node: nodes.ThriftNode): boolean {
    return node.type === nodes.ThriftNodeType.Struct ||
        node.type === nodes.ThriftNodeType.Union ||
        node.type === nodes.ThriftNodeType.Exception ||
        node.type === nodes.ThriftNodeType.Enum ||
        node.type === nodes.ThriftNodeType.Service ||
        node.type === nodes.ThriftNodeType.Interaction ||
        node.type === nodes.ThriftNodeType.Typedef;
}

function splitLines(text: string): string[] {
    return text.split(/\r?\n/);
}

function clonePosition(position: PositionLike): PositionLike {
    return {
        line: position.line,
        character: position.character
    };
}

function cloneRange(range: RangeLike): RangeLike {
    return {
        start: clonePosition(range.start),
        end: clonePosition(range.end)
    };
}

function toPosition(position: PositionLike): Position {
    return new Position(position.line, position.character);
}

function toRange(start: PositionLike, end: PositionLike): Range {
    return new Range(start.line, start.character, end.line, end.character);
}

function rangeSize(range: RangeLike): number {
    return (range.end.line - range.start.line) * 100000 + (range.end.character - range.start.character);
}

function rangesEqual(a: PositionLike, b: PositionLike): boolean {
    return a.line === b.line && a.character === b.character;
}
