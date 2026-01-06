import { StructField, ThriftFormattingOptions } from '../interfaces.types';
import * as nodes from '../ast/nodes.types';

type IndentProvider = (level: number, options: ThriftFormattingOptions) => string;
type StructFormatter = (fields: StructField[], options: ThriftFormattingOptions, indentLevel: number) => string[];
type StructFieldParser = (text: string) => StructField | null;
type StructFieldBuilder = (line: string, fieldNode: nodes.Field) => StructField | null;
type SignatureNormalizer = (text: string) => string;
type ServiceMethodMatcher = (line: string) => boolean;

interface StructContentDeps {
    getIndent: IndentProvider;
    formatStructFields: StructFormatter;
    buildStructFieldFromAst: StructFieldBuilder;
    parseStructFieldText: StructFieldParser;
    normalizeGenericsInSignature: SignatureNormalizer;
    isServiceMethod: ServiceMethodMatcher;
}

interface StructContentResult {
    handled: boolean;
    inStruct: boolean;
    indentLevel: number;
    structFields: StructField[];
    formattedLines: string[];
}

/**
 * Format a line inside a struct/union/exception block.
 * @param line - Current line (trimmed).
 * @param lineIndex - Current line index.
 * @param indentLevel - Current indentation level.
 * @param structFields - Accumulated struct fields.
 * @param structFieldIndex - AST index for struct fields.
 * @param options - Formatting options.
 * @param deps - Formatting dependencies.
 * @returns Updated struct state and formatted output.
 */
export function formatStructContentLine(
    line: string,
    lineIndex: number,
    indentLevel: number,
    structFields: StructField[],
    structFieldIndex: Map<number, nodes.Field>,
    options: ThriftFormattingOptions,
    deps: StructContentDeps
): StructContentResult {
    if (line.startsWith('}')) {
        const formattedLines: string[] = [];
        if (structFields.length > 0) {
            const formattedFields = deps.formatStructFields(structFields, options, indentLevel);
            formattedLines.push(...formattedFields);
            structFields = [];
        }
        const nextIndent = indentLevel - 1;
        formattedLines.push(deps.getIndent(nextIndent, options) + line);
        return {
            handled: true,
            inStruct: false,
            indentLevel: nextIndent,
            structFields,
            formattedLines
        };
    }

    if (deps.isServiceMethod(line)) {
        const normalized = deps.normalizeGenericsInSignature(line);
        return {
            handled: true,
            inStruct: true,
            indentLevel,
            structFields,
            formattedLines: [deps.getIndent(indentLevel, options) + normalized]
        };
    }

    const fieldNode = structFieldIndex.get(lineIndex);
    const fieldInfo = fieldNode
        ? deps.buildStructFieldFromAst(line, fieldNode)
        : deps.parseStructFieldText(line);
    if (fieldInfo) {
        return {
            handled: true,
            inStruct: true,
            indentLevel,
            structFields: [...structFields, fieldInfo],
            formattedLines: []
        };
    }

    return {
        handled: false,
        inStruct: true,
        indentLevel,
        structFields,
        formattedLines: []
    };
}
