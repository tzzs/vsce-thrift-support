import { EnumField, ThriftFormattingOptions } from '../interfaces.types';
import * as nodes from '../ast/nodes.types';

type IndentProvider = (level: number, options: ThriftFormattingOptions) => string;
type EnumFormatter = (fields: EnumField[], options: ThriftFormattingOptions, indentLevel: number) => string[];
type EnumFieldParser = (text: string) => EnumField | null;
type EnumFieldBuilder = (line: string, fieldNode: nodes.EnumMember) => EnumField | null;
type EnumFieldMatcher = (line: string) => boolean;

interface EnumContentDeps {
    getIndent: IndentProvider;
    formatEnumFields: EnumFormatter;
    buildEnumFieldFromAst: EnumFieldBuilder;
    parseEnumFieldText: EnumFieldParser;
    isEnumFieldText: EnumFieldMatcher;
}

interface EnumContentResult {
    handled: boolean;
    inEnum: boolean;
    indentLevel: number;
    enumFields: EnumField[];
    formattedLines: string[];
}

/**
 * Format a line inside an enum block.
 * @param line - Current line (trimmed).
 * @param lineIndex - Current line index.
 * @param indentLevel - Current indentation level.
 * @param enumFields - Accumulated enum fields.
 * @param enumMemberIndex - AST index for enum members.
 * @param options - Formatting options.
 * @param deps - Formatting dependencies.
 * @returns Updated enum state and formatted output.
 */
export function formatEnumContentLine(
    line: string,
    lineIndex: number,
    indentLevel: number,
    enumFields: EnumField[],
    enumMemberIndex: Map<number, nodes.EnumMember>,
    options: ThriftFormattingOptions,
    deps: EnumContentDeps
): EnumContentResult {
    if (line.startsWith('}')) {
        const formattedLines: string[] = [];
        if (enumFields.length > 0) {
            const formattedFields = deps.formatEnumFields(enumFields, options, indentLevel);
            formattedLines.push(...formattedFields);
            enumFields = [];
        }
        const nextIndent = indentLevel - 1;
        formattedLines.push(deps.getIndent(nextIndent, options) + line);
        return {
            handled: true,
            inEnum: false,
            indentLevel: nextIndent,
            enumFields,
            formattedLines
        };
    }

    const hasEnumField = enumMemberIndex.has(lineIndex) || deps.isEnumFieldText(line);
    const formattedLines: string[] = [];
    if (enumFields.length > 0 && !hasEnumField) {
        const formattedFields = deps.formatEnumFields(enumFields, options, indentLevel);
        formattedLines.push(...formattedFields);
        enumFields = [];
    }

    const enumNode = enumMemberIndex.get(lineIndex);
    const fieldInfo = enumNode
        ? deps.buildEnumFieldFromAst(line, enumNode)
        : deps.parseEnumFieldText(line);
    if (fieldInfo) {
        return {
            handled: true,
            inEnum: true,
            indentLevel,
            enumFields: [...enumFields, fieldInfo],
            formattedLines
        };
    }

    return {
        handled: formattedLines.length > 0,
        inEnum: true,
        indentLevel,
        enumFields,
        formattedLines
    };
}
