import {ConstField, StructField, ThriftFormattingOptions} from '../interfaces.types';

type IndentProvider = (level: number, options: ThriftFormattingOptions) => string;
type StructFormatter = (fields: StructField[], options: ThriftFormattingOptions, indentLevel: number) => string[];
type ConstFormatter = (fields: ConstField[], options: ThriftFormattingOptions, indentLevel: number) => string[];
type StructFieldMatcher = (line: string) => boolean;
type ConstFieldParser = (text: string) => ConstField | null;
type SignatureNormalizer = (text: string) => string;

interface FlushStructDeps {
    formatStructFields: StructFormatter;
    isStructFieldText: StructFieldMatcher;
}

interface FlushConstDeps {
    formatConstFields: ConstFormatter;
}

interface SkipLineDeps {
    getIndent: IndentProvider;
    getServiceIndent: IndentProvider;
}

interface ConstStartDeps {
    parseConstFieldText: ConstFieldParser;
}

interface TypedefDeps {
    getIndent: IndentProvider;
    normalizeGenericsInSignature: SignatureNormalizer;
}

interface OpenBraceDeps {
    getIndent: IndentProvider;
}

interface FlushStructResult {
    structFields: StructField[];
    formattedLines: string[];
    flushed: boolean;
}

interface FlushConstResult {
    constFields: ConstField[];
    inConstBlock: boolean;
    constBlockIndentLevel: number | null;
    formattedLines: string[];
    flushed: boolean;
}

interface ConstStartResult {
    handled: boolean;
    nextIndex: number;
    constFields: ConstField[];
    inConstBlock: boolean;
    constBlockIndentLevel: number | null;
}

/**
 * Flush accumulated struct fields before non-field separators or comments.
 * @param inStruct - Whether the formatter is inside a struct block.
 * @param structFields - Collected struct fields.
 * @param line - Current line (trimmed).
 * @param lineIndex - Current line index.
 * @param structFieldIndex - AST index for struct fields.
 * @param indentLevel - Current indentation level.
 * @param options - Formatting options.
 * @param deps - Formatting dependencies.
 * @returns Updated struct fields and formatted output.
 */
export function flushStructFieldsIfNeeded(
    inStruct: boolean,
    structFields: StructField[],
    line: string,
    lineIndex: number,
    structFieldIndex: Map<number, unknown>,
    indentLevel: number,
    options: ThriftFormattingOptions,
    deps: FlushStructDeps
): FlushStructResult {
    if (!inStruct || structFields.length === 0) {
        return {structFields, formattedLines: [], flushed: false};
    }

    const hasStructField = structFieldIndex.has(lineIndex) || deps.isStructFieldText(line);
    if (!hasStructField && !line.startsWith('}')) {
        const formattedLines = deps.formatStructFields(structFields, options, indentLevel);
        return {structFields: [], formattedLines, flushed: true};
    }

    return {structFields, formattedLines: [], flushed: false};
}

/**
 * Flush pending const fields when a const block ends.
 * @param inConstBlock - Whether const block is active.
 * @param constFields - Collected const fields.
 * @param isConstStart - Whether current line starts a const definition.
 * @param constBlockIndentLevel - Indent level of const block.
 * @param indentLevel - Current indentation level.
 * @param options - Formatting options.
 * @param deps - Formatting dependencies.
 * @returns Updated const block state and formatted output.
 */
export function flushConstBlockIfNeeded(
    inConstBlock: boolean,
    constFields: ConstField[],
    isConstStart: boolean,
    constBlockIndentLevel: number | null,
    indentLevel: number,
    options: ThriftFormattingOptions,
    deps: FlushConstDeps
): FlushConstResult {
    if (inConstBlock && constFields.length > 0 && !isConstStart) {
        const formattedLines = deps.formatConstFields(constFields, options, constBlockIndentLevel ?? indentLevel);
        return {
            constFields: [],
            inConstBlock: false,
            constBlockIndentLevel: null,
            formattedLines,
            flushed: true
        };
    }

    return {
        constFields,
        inConstBlock,
        constBlockIndentLevel,
        formattedLines: [],
        flushed: false
    };
}

/**
 * Format empty lines and line comments.
 * @param line - Current line (trimmed).
 * @param inService - Whether the formatter is inside a service block.
 * @param serviceIndentLevel - Base service indentation level.
 * @param indentLevel - Current indentation level.
 * @param options - Formatting options.
 * @param deps - Formatting dependencies.
 * @returns Formatted line array or null when not handled.
 */
export function formatSkippedLine(
    line: string,
    inService: boolean,
    serviceIndentLevel: number,
    indentLevel: number,
    options: ThriftFormattingOptions,
    deps: SkipLineDeps
): string[] | null {
    if (!line || line.startsWith('//') || line.startsWith('#')) {
        const indent = inService
            ? deps.getServiceIndent(serviceIndentLevel + 1, options)
            : deps.getIndent(indentLevel, options);
        return [indent + line];
    }
    return null;
}

/**
 * Handle const definitions using AST indices.
 * @param lines - Full document lines.
 * @param lineIndex - Current line index.
 * @param isConstStart - Whether current line starts a const definition.
 * @param constEnds - Map of const start to end line.
 * @param inStruct - Whether the formatter is inside a struct block.
 * @param inEnum - Whether the formatter is inside an enum block.
 * @param inService - Whether the formatter is inside a service block.
 * @param indentLevel - Current indentation level.
 * @param constFields - Collected const fields.
 * @param constBlockIndentLevel - Indent level of const block.
 * @param deps - Formatting dependencies.
 * @returns Updated const block state and next index.
 */
export function handleConstStartLine(
    lines: string[],
    lineIndex: number,
    isConstStart: boolean,
    constEnds: Map<number, number>,
    inStruct: boolean,
    inEnum: boolean,
    inService: boolean,
    indentLevel: number,
    constFields: ConstField[],
    constBlockIndentLevel: number | null,
    deps: ConstStartDeps
): ConstStartResult {
    if (!isConstStart) {
        return {
            handled: false,
            nextIndex: lineIndex,
            constFields,
            inConstBlock: false,
            constBlockIndentLevel
        };
    }

    const endLine = constEnds.get(lineIndex) ?? lineIndex;
    const constText = lines.slice(lineIndex, endLine + 1).join('\n');
    const fieldInfo = deps.parseConstFieldText(constText);
    let inConstBlock = false;

    if (fieldInfo) {
        if (constFields.length === 0) {
            constBlockIndentLevel = (inStruct || inEnum || inService) ? indentLevel : 0;
        }
        constFields = [...constFields, fieldInfo];
        inConstBlock = true;
    }

    return {
        handled: true,
        nextIndex: endLine,
        constFields,
        inConstBlock,
        constBlockIndentLevel
    };
}

/**
 * Format a typedef line.
 * @param line - Current line (trimmed).
 * @param indentLevel - Current indentation level.
 * @param options - Formatting options.
 * @param deps - Formatting dependencies.
 * @returns Formatted typedef line or null when not handled.
 */
export function formatTypedefLine(
    line: string,
    indentLevel: number,
    options: ThriftFormattingOptions,
    deps: TypedefDeps
): string[] | null {
    if (/^\s*typedef\b/.test(line)) {
        const normalized = deps.normalizeGenericsInSignature(line);
        return [deps.getIndent(indentLevel, options) + normalized];
    }
    return null;
}

/**
 * Format a standalone opening brace line.
 * @param line - Current line (trimmed).
 * @param indentLevel - Current indentation level.
 * @param options - Formatting options.
 * @param deps - Formatting dependencies.
 * @returns Formatted line or null when not handled.
 */
export function formatOpenBraceLine(
    line: string,
    indentLevel: number,
    options: ThriftFormattingOptions,
    deps: OpenBraceDeps
): string[] | null {
    if (line === '{') {
        const level = Math.max(indentLevel - 1, 0);
        return [deps.getIndent(level, options) + line];
    }
    return null;
}
